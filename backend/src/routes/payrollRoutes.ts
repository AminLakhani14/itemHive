import { Router } from "express";
import Joi from "joi";
import mongoose from "mongoose";
import { protect, authorize, type AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import Employee from "../models/Employee";
import EmployeeLeave from "../models/EmployeeLeave";
import {
  PayrollAudit,
  PayrollCommission,
  PayrollDayClaim,
  PayrollLoan,
  PayrollLoanMovement,
  PayrollPayment,
  PayrollPolicy,
  PayrollRequest,
  PayrollRun,
  SalaryStructure,
} from "../models/Payroll";
import {
  audit,
  calculateRun,
  leaveBalances,
  migratePayrollBusiness,
  payrollSource,
  payrollTenant,
  policyFor,
  saveSalary,
  syncSalarySummary,
} from "../services/payrollService";
import {
  dateKeys,
  defaultSchedule,
  minor,
  monthRange,
  scheduleMinutes,
  structureOn,
  validDate,
  type Structure,
} from "../services/payrollCalculator";

import { financialAccess, canFinancial } from '../middleware/financialAccess';
import { FinancePolicy, JournalEntry } from '../models/Finance';
import { businessDate, postSource, systemAccount, sourceSettlement, reverseSource } from '../services/financeService';
const id = Joi.string().hex().length(24);
const date = Joi.string().custom((v, h) =>
  validDate(v) ? v : h.error("any.invalid"),
);
const month = Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/);
const text = Joi.string().trim().min(1).max(500);
const optionalNote = Joi.string().trim().allow('').max(500).default('');
const amount = Joi.number().min(0).max(1_000_000_000).precision(2).strict();
const schedule = Joi.object({
  workingDays: Joi.array()
    .items(Joi.number().integer().min(0).max(6))
    .unique()
    .min(1)
    .required(),
  startTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  endTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  breakMinutes: Joi.number().integer().min(0).max(720).required(),
  graceMinutes: Joi.number().integer().min(0).max(120).required(),
});
const salaryFields = {
      effectiveDate: date.required(),
      base: amount.required(),
      salaryType: Joi.string().valid("monthly", "daily", "hourly").required(),
      commissionPercent: Joi.number().min(0).max(100).required(),
      schedule: schedule.required(),
      leavePolicyName: text.optional(),
      leaveRules: Joi.object()
        .pattern(
          Joi.string().valid("casual", "sick", "annual", "unpaid", "other"),
          Joi.object({
            paid: Joi.boolean().required(),
            annualDays: Joi.number().min(0).max(366).required(),
            openingDays: Joi.number().min(0).max(366).required(),
            carryLimit: Joi.number().min(0).max(366).required(),
          }),
        )
        .optional(),
      reason: optionalNote,
      components: Joi.array()
        .max(50)
        .items(
          Joi.object({
            name: text.required(),
            kind: Joi.string()
              .valid("allowance", "deduction", "employer")
              .required(),
            mode: Joi.string().valid("fixed", "percent").required(),
            value: amount.required(),
            prorate: Joi.boolean().required(),
          }),
        )
        .required(),
};
const reasonSchema = Joi.object({
  reason: optionalNote,
  version: Joi.number().integer().min(0).required(),
});
const handler =
  (fn: (req: AuthRequest, res: any) => Promise<unknown>) =>
  async (req: AuthRequest, res: any) => {
    try {
      await fn(req, res);
    } catch (e: any) {
      res.status(e.code === 11000 ? 409 : e.status || 400).json({
        message:
          e.code === 11000
            ? "This operation duplicates an existing payroll record or overlaps approved pay. Refresh and retry."
            : e.message || "Payroll operation failed",
      });
    }
  };
async function transaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    return (await session.withTransaction(() => fn(session))) as T;
  } finally {
    await session.endSession();
  }
}
const permission = (key: string) => (req: AuthRequest, res: any, next: any) => {
  if (
    req.user?.role === "super_admin" ||
    (req.user?.role === "admin" &&
      req.user.screenPermissions?.includes(key as any))
  )
    return next();
  return res
    .status(403)
    .json({ message: `Explicit ${key} permission is required` });
};
const tenant = (req: AuthRequest) => payrollTenant(req.user!.businessId);
const requestAccess = financialAccess('payroll_hr', 'payroll_leave_requests', 'payroll_loan_requests', 'payroll_work_requests');
const managedRequestKinds = (req: AuthRequest) => canFinancial(req, 'payroll_hr') ? ['leave', 'loan', 'advance', 'overtime', 'attendance'] : [
  ...(canFinancial(req, 'payroll_leave_requests') ? ['leave'] : []),
  ...(canFinancial(req, 'payroll_loan_requests') ? ['loan', 'advance'] : []),
  ...(canFinancial(req, 'payroll_work_requests') ? ['overtime', 'attendance'] : []),
];
const auditFor = (
  req: AuthRequest,
  action: string,
  target: string,
  reason: string,
  before: unknown,
  after: unknown,
  session?: mongoose.ClientSession,
) =>
  audit(
    req.user!.businessId,
    req.user!.id,
    action,
    target,
    reason,
    before,
    after,
    session,
    req.user!.name,
  );
async function employeeFor(
  req: AuthRequest,
  employeeId?: string,
  session?: mongoose.ClientSession,
) {
  const employee = await Employee.findOne({
    ...tenant(req),
    ...(employeeId ? { _id: employeeId } : { userId: req.user!.id }),
  })
    .select("+bankName +bankAccount")
    .session(session || null);
  if (!employee) throw new Error("Employee not found in the selected business");
  return employee;
}
async function getRun(req: AuthRequest, session: mongoose.ClientSession) {
  const run = await PayrollRun.findOne({
    ...tenant(req),
    _id: req.params.id,
  }).session(session);
  if (!run) throw new Error("Payroll run not found");
  if (run.version !== req.body.version)
    throw new Error("This run changed. Refresh before continuing");
  return run;
}
async function paymentSummary(req: AuthRequest, items: any[]) {
  const payments = await PayrollPayment.find({
    ...tenant(req),
    reversedAt: { $exists: false },
  }).lean();
  return items.map((i) => {
    const paidMinor = payments
      .filter(
        (p) =>
          String(p.runId) === String(i.runId) &&
          String(p.employeeId) === i.employeeId,
      )
      .reduce((n, p) => n + p.amountMinor, 0);
    return {
      ...i,
      paidMinor,
      outstandingMinor: i.netMinor - paidMinor,
      paymentStatus:
        paidMinor === i.netMinor
          ? "paid"
          : paidMinor > 0
            ? "partially_paid"
            : "unpaid",
    };
  });
}
const maskProfile = (e: any) => ({
  ...e,
  bankAccount: e.bankAccount ? `••••${e.bankAccount.slice(-4)}` : "",
});

export const payrollRouter = Router();
payrollRouter.use(protect, authorize("super_admin", "admin"));
// Sales staff use a separate slim endpoint below, not employee/profile permissions.
payrollRouter.get(
  "/settings",
  financialAccess('payroll_view', 'payroll_settings', 'payroll_hr', 'payroll_pay', 'payroll_reports', 'payroll_prepare', 'payroll_approve', 'payroll_leave_requests', 'payroll_loan_requests', 'payroll_work_requests', 'payroll_loans_view', 'payroll_loans_manage', 'payroll_payment_reverse'),
  handler(async (req, res) => res.json(await policyFor(req.user!.businessId))),
);
payrollRouter.put(
  "/settings",
  permission("payroll_settings"),
  validate(
    Joi.object({
      enabled: Joi.boolean().required(),
      confirmed: Joi.boolean().required(),
      currency: Joi.string()
        .valid("PKR", "USD", "EUR", "GBP", "CHF", "CDF", "INR", "AED")
        .required(),
      timeZone: text.required(),
      overtimeMultiplier: Joi.number().min(1).max(10).required(),
      commissionsEnabled: Joi.boolean().required(),
      dailyPaidNonWork: Joi.boolean().required(),
      hourlyPaidNonWork: Joi.boolean().required(),
      allowZeroPay: Joi.boolean().required(),
      latePenaltyMinor: Joi.number().integer().min(0).required(),
      earlyPenaltyMinor: Joi.number().integer().min(0).required(),
      holidays: Joi.array().items(date).unique().max(366).required(),
      leaveRules: Joi.object()
        .pattern(
          Joi.string().valid("casual", "sick", "annual", "unpaid", "other"),
          Joi.object({
            paid: Joi.boolean().required(),
            annualDays: Joi.number().min(0).max(366).default(0),
            openingDays: Joi.number().min(0).max(366).default(0),
            carryLimit: Joi.number().min(0).max(366).default(0),
          }),
        )
        .required(),
      reason: optionalNote,
    }),
  ),
  handler(async (req, res) => {
    new Intl.DateTimeFormat("en", { timeZone: req.body.timeZone });
    if (req.body.enabled && !req.body.confirmed)
      throw new Error("Confirm currency and timezone before enabling payroll");
    const result = await transaction(async (session) => {
      const before = await PayrollPolicy.findOne(tenant(req))
        .session(session)
        .lean();
      if (
        before &&
        (before.currency !== req.body.currency ||
          before.timeZone !== req.body.timeZone) &&
        (await PayrollRun.exists({
          ...tenant(req),
          status: "approved",
        }).session(session))
      )
        throw new Error(
          "Currency and timezone cannot change after approved payroll",
        );
      const { reason, ...data } = req.body;
      const after = await PayrollPolicy.findOneAndUpdate(
        tenant(req),
        { $set: data },
        { upsert: true, returnDocument: 'after', runValidators: true, session },
      );
      await auditFor(
        req,
        "policy.update",
        req.user!.businessId,
        reason,
        before,
        after,
        session,
      );
      return after;
    });
    res.json(result);
  }),
);
payrollRouter.post(
  "/migration",
  permission("payroll_settings"),
  handler(async (req, res) =>
    res.json(await migratePayrollBusiness(req.user!.businessId, req.user!.id)),
  ),
);
payrollRouter.get(
  "/employees",
  financialAccess('payroll_view', 'payroll_settings', 'payroll_reports', 'payroll_pay', 'payroll_prepare', 'payroll_approve', 'payroll_loans_view', 'payroll_loans_manage', 'payroll_payment_reverse'),
  handler(async (req, res) => {
    const employees = await Employee.find(tenant(req))
      .sort({ fullName: 1 })
      .lean();
    res.json(
      employees.map((e) =>
        maskProfile({
          _id: e._id,
          fullName: e.fullName,
          employeeCode: e.employeeCode,
          joiningDate: e.joiningDate,
          employmentEndDate: e.employmentEndDate,
          designation: e.designation,
          department: e.department,
          status: e.status,
          payrollEnrolled: e.payrollEnrolled,
          bankAccount: e.bankAccount,
          paymentMethod: e.paymentMethod,
          bankName: e.bankName,
        }),
      ),
    );
  }),
);
payrollRouter.get(
  "/employees/:id",
  financialAccess('payroll_view', 'payroll_settings'),
  handler(async (req, res) => {
    const e = await employeeFor(req, String(req.params.id));
    const structures = await SalaryStructure.find({
      ...tenant(req),
      employeeId: e._id,
    })
      .sort({ effectiveDate: -1 })
      .lean();
    const canSettings =
      req.user!.role === "super_admin" ||
      req.user!.screenPermissions?.includes("payroll_settings");
    const profile = {
      _id: e._id,
      fullName: e.fullName,
      joiningDate: e.joiningDate,
      salary: e.salary,
      salaryType: e.salaryType,
      payrollRevision: e.payrollRevision,
      payrollEnrolled: e.payrollEnrolled,
      department: e.department,
      employmentEndDate: e.employmentEndDate,
      paymentMethod: e.paymentMethod,
      bankName: e.bankName,
      bankAccount: e.bankAccount,
      leavePolicy: "business",
    };
    res.json({
      profile: canSettings ? profile : maskProfile(profile),
      structures,
      audit: (await PayrollAudit.find({ ...tenant(req), $or: [{ action: 'employee.payroll', targetId: String(e._id) }, { action: 'salary.create', 'after.employeeId': e._id }] }).select('actorId actorName action reason reasonProvided createdAt').sort({ createdAt: -1, _id: -1 }).limit(100).lean()),
      balances: await leaveBalances(
        req.user!.businessId,
        e,
        new Date().toISOString().slice(0, 10),
      ),
    });
  }),
);
payrollRouter.put(
  "/employees/:id",
  permission("payroll_settings"),
  validate(
    Joi.object({
      payrollEnrolled: Joi.boolean().required(),
      payrollRevision: Joi.number().integer().min(0).optional(),
      department: Joi.string().trim().allow("").max(80).required(),
      employmentEndDate: date.allow("").required(),
      paymentMethod: Joi.string().valid("cash", "bank").required(),
      bankName: Joi.string().trim().allow("").max(100).required(),
      bankAccount: Joi.string().trim().allow("").max(100).required(),
      reason: optionalNote,
      openingSalary: Joi.object({ ...salaryFields, reason: Joi.forbidden() }).optional(),
    }),
  ),
  handler(async (req, res) => {
    const result = await transaction(async (session) => {
      const e = await employeeFor(req, String(req.params.id), session);
      const correction = e.payrollEnrolled && (!req.body.payrollEnrolled || (e.employmentEndDate || '') !== req.body.employmentEndDate || e.paymentMethod !== req.body.paymentMethod || (e.bankName || '') !== req.body.bankName || (e.bankAccount || '') !== req.body.bankAccount);
      if (correction && !req.body.reason.trim()) throw new Error('Reason is required for payroll removal, employment date or payment detail corrections');
      if (req.body.payrollRevision !== undefined && req.body.payrollRevision !== e.payrollRevision) throw new Error('Payroll profile changed. Refresh before saving');
      if (
        req.body.employmentEndDate &&
        req.body.employmentEndDate < e.joiningDate
      )
        throw new Error("Employment end date cannot precede joining date");
      if (
        req.body.employmentEndDate &&
        (await PayrollDayClaim.exists({
          ...tenant(req),
          employeeId: e._id,
          dateKey: { $gt: req.body.employmentEndDate },
        }).session(session))
      )
        throw new Error(
          "End date conflicts with approved payroll; use an adjustment",
        );
      if (req.body.openingSalary) {
        if (!req.body.payrollEnrolled || !e.joiningDate) throw new Error('A joining date and payroll enrollment are required for the opening salary');
        if (req.body.openingSalary.effectiveDate > e.joiningDate) throw new Error('Opening salary must start on or before the joining date');
        if (await SalaryStructure.exists({ ...tenant(req), employeeId: e._id, effectiveDate: { $lte: e.joiningDate } }).session(session)) throw new Error('Opening salary already exists. Refresh the profile before saving');
        if (!scheduleMinutes(req.body.openingSalary.schedule)) throw new Error('Schedule must contain payable working minutes');
        const { base, ...opening } = req.body.openingSalary;
        await saveSalary(req.user!.businessId, String(e._id), req.user!.id, { ...opening, baseMinor: minor(base), reason: req.body.reason }, session);
      }
      if (
        req.body.payrollEnrolled &&
        (!e.joiningDate ||
          !(await SalaryStructure.exists({
            ...tenant(req),
            employeeId: e._id,
            effectiveDate: { $lte: e.joiningDate },
          }).session(session)))
      )
        throw new Error(
          e.joiningDate ? `Add a salary dated ${e.joiningDate} or earlier, then save enrollment` : 'Add the employee joining date before enrolling',
        );
      if (
        req.body.paymentMethod === "bank" &&
        (!req.body.bankAccount || !req.body.bankName)
      )
        throw new Error("Bank name and account are required for bank payments");
      const { reason, payrollRevision, openingSalary, ...data } = req.body;
      const before = maskProfile(e.toObject());
      e.set(data);
      e.payrollRevision++;
      await e.save({ session });
      await auditFor(
        req,
        "employee.payroll",
        String(e._id),
        reason,
        before,
        maskProfile(e.toObject()),
        session,
      );
      return maskProfile(e.toObject());
    });
    res.json(result);
  }),
);
payrollRouter.post(
  "/employees/:id/structures",
  permission("payroll_settings"),
  validate(
    Joi.object({ ...salaryFields, payrollRevision: Joi.number().integer().min(0).optional() }),
  ),
  handler(async (req, res) => {
    if (!scheduleMinutes(req.body.schedule))
      throw new Error("Schedule must contain payable working minutes");
    const { base, payrollRevision, ...data } = req.body;
    res
      .status(201)
      .json(
        await transaction(async (session) => {
          const employee = await employeeFor(req, String(req.params.id), session);
          if (payrollRevision !== undefined && employee.payrollRevision !== payrollRevision) throw new Error('Payroll profile changed. Refresh before saving');
          return saveSalary(
            req.user!.businessId,
            String(req.params.id),
            req.user!.id,
            { ...data, baseMinor: minor(base) },
            session,
          );
        }),
      );
  }),
);

const requestSchema = Joi.object({
  key: text.optional(),
  employeeId: id.optional(),
  kind: Joi.string()
    .valid("leave", "overtime", "loan", "advance", "attendance")
    .required(),
  reason: text.required(),
  data: Joi.object({
    startDate: date,
    endDate: date,
    leaveType: Joi.string().valid(
      "casual",
      "sick",
      "annual",
      "unpaid",
      "other",
    ),
    fraction: Joi.number().valid(0.5, 1),
    dateKey: date,
    minutes: Joi.number().integer().min(1).max(1440),
    amount: amount.greater(0),
    installment: amount.greater(0),
    startMonth: month,
  }).required(),
});
async function createRequest(req: AuthRequest, self: boolean) {
  if (!self && !managedRequestKinds(req).includes(req.body.kind)) throw Object.assign(new Error('This HR request type has not been shared with your account'), { status: 403 });
  const e = await employeeFor(req, self ? undefined : req.body.employeeId);
  if (self && req.body.kind === "attendance")
    throw new Error("Attendance review is restricted to payroll managers");
  const d = req.body.data;
  if (req.body.kind === "leave") {
    if (
      !d.startDate ||
      !d.endDate ||
      !d.leaveType ||
      d.startDate > d.endDate ||
      dateKeys(d.startDate, d.endDate).length > 366
    )
      throw new Error("Valid leave dates and type are required");
    if ((d.fraction || 1) === 0.5 && d.startDate !== d.endDate)
      throw new Error("Half-day leave must cover one date");
  } else if (["overtime", "attendance"].includes(req.body.kind)) {
    if (!d.dateKey || (req.body.kind === "overtime" && !d.minutes))
      throw new Error("Date and overtime minutes are required");
  } else if (
    !d.amount ||
    !d.installment ||
    !d.startMonth ||
    d.installment > d.amount
  )
    throw new Error("Valid amount, installment and start month are required");
  return transaction(async session => {
    if (req.body.key) {
      const existing = await PayrollRequest.findOne({ ...tenant(req), key: req.body.key }).session(session);
      if (existing) {
        if (String(existing.employeeId) !== String(e._id) || String(existing.createdBy) !== req.user!.id || existing.kind !== req.body.kind || existing.reason !== req.body.reason || JSON.stringify(existing.data) !== JSON.stringify(d)) throw new Error('Request key belongs to different details');
        return existing;
      }
    }
    const [r] = await PayrollRequest.create([{ ...tenant(req), ...(req.body.key ? { key: req.body.key } : {}), employeeId: e._id, kind: req.body.kind, data: d, reason: req.body.reason, createdBy: req.user!.id }], { session });
    await auditFor(req, 'request.create', String(r._id), req.body.reason, null, r.toObject(), session);
    return r;
  });
}
payrollRouter.get('/request-employees', requestAccess, handler(async (req, res) => res.json(await Employee.find(tenant(req)).select('fullName employeeCode department designation status joiningDate employmentEndDate').sort({ fullName: 1 }).lean())));
payrollRouter.get(
  "/requests",
  requestAccess,
  handler(async (req, res) => {
    const [rows, ownEmployees] = await Promise.all([
      PayrollRequest.find({ ...tenant(req), kind: { $in: managedRequestKinds(req) } }).sort({ createdAt: -1 }).lean(),
      Employee.find({ ...tenant(req), userId: req.user!.id }).select('_id').lean(),
    ]);
    const ownIds = new Set(ownEmployees.map(e => String(e._id)));
    res.json(rows.map(r => ({ ...r, canApprove: r.status === 'pending' && String(r.createdBy) !== req.user!.id && !ownIds.has(String(r.employeeId)) })));
  }),
);
payrollRouter.post(
  "/requests",
  requestAccess,
  validate(requestSchema),
  handler(async (req, res) => {
    if (!req.body.employeeId) throw new Error("Employee is required");
    res.status(201).json(await createRequest(req, false));
  }),
);
payrollRouter.post(
  "/requests/:id/decision",
  requestAccess,
  validate(
    Joi.object({
      status: Joi.string()
        .valid("approved", "rejected", "cancelled")
        .required(),
      reason: Joi.when('status', { is: 'approved', then: optionalNote, otherwise: text.required() }),
    }),
  ),
  handler(async (req, res) => {
    res.json(
      await transaction(async (session) => {
        const r = await PayrollRequest.findOne({
          ...tenant(req),
          _id: req.params.id,
          kind: { $in: managedRequestKinds(req) },
        }).session(session);
        if (
          !r ||
          (r.status !== "pending" &&
            !(
              req.body.status === "cancelled" &&
              r.status === "approved" &&
              ["leave", "overtime", "attendance"].includes(r.kind)
            ))
        )
          throw new Error(
            "Only pending requests or unposted approved HR requests can be decided",
          );
        if (req.body.status === 'approved' && String(r.createdBy) === req.user!.id) throw new Error('Another authorized admin must approve this request');
        const e = await employeeFor(req, String(r.employeeId), session);
        if (req.body.status === 'approved' && String(e.userId || '') === req.user!.id) throw new Error('An employee cannot approve their own request');
        const d = r.data;
        if (req.body.status === "cancelled" && r.status === "approved") {
          const from = d.startDate || d.dateKey;
          const to = d.endDate || d.dateKey;
          if (
            await PayrollDayClaim.exists({
              ...tenant(req),
              employeeId: e._id,
              dateKey: { $gte: from, $lte: to },
            }).session(session)
          )
            throw new Error(
              "Approved payroll dates cannot be cancelled; use an adjustment",
            );
          if (r.kind === "leave")
            await EmployeeLeave.deleteOne(
              {
                ...tenant(req),
                payrollRequestId: new mongoose.Types.ObjectId(String(r._id)),
              },
              { session },
            );
        }
        if (req.body.status === "approved") {
          if (["leave", "overtime", "attendance"].includes(r.kind)) {
            const from = d.startDate || d.dateKey;
            const to = d.endDate || d.dateKey;
            if (
              !e.joiningDate ||
              from < e.joiningDate ||
              (e.employmentEndDate && to > e.employmentEndDate)
            )
              throw new Error("Request is outside employment dates");
            if (
              await PayrollDayClaim.exists({
                ...tenant(req),
                employeeId: e._id,
                dateKey: { $gte: from, $lte: to },
              }).session(session)
            )
              throw new Error(
                "Request overlaps approved payroll; use an adjustment run",
              );
          }
          if (r.kind === "leave") {
            if (
              await EmployeeLeave.exists({
                ...tenant(req),
                employeeId: e._id,
                startDate: { $lte: d.endDate },
                endDate: { $gte: d.startDate },
              }).session(session)
            )
              throw new Error("Leave overlaps an existing approved leave");
            const p = await policyFor(req.user!.businessId);
            const structures = await SalaryStructure.find({
              ...tenant(req),
              employeeId: e._id,
            })
              .session(session)
              .lean();
            const count =
              dateKeys(d.startDate, d.endDate).filter(
                (day) =>
                  (
                    structureOn(structures as unknown as Structure[], day)
                      ?.schedule || defaultSchedule
                  ).workingDays.includes(
                    new Date(`${day}T00:00Z`).getUTCDay(),
                  ) && !p.holidays.includes(day),
              ).length * (d.fraction || 1);
            const balances = await leaveBalances(
              req.user!.businessId,
              e,
              d.endDate,
              session,
            );
            if (
              dateKeys(d.startDate, d.endDate).some(
                (day) =>
                  (
                    structureOn(structures as unknown as Structure[], day)
                      ?.leaveRules?.[d.leaveType] || p.leaveRules[d.leaveType]
                  )?.paid,
              ) &&
              count > (balances[d.leaveType] || 0)
            )
              throw new Error(
                "Insufficient paid leave balance; adjust entitlements or request unpaid leave",
              );
            await EmployeeLeave.create(
              [
                {
                  ...tenant(req),
                  employeeId: e._id,
                  startDate: d.startDate,
                  endDate: d.endDate,
                  leaveType: d.leaveType,
                  fraction: d.fraction || 1,
                  reason: r.reason,
                  createdBy: req.user!.id,
                  payrollRequestId: new mongoose.Types.ObjectId(String(r._id)),
                },
              ],
              { session },
            );
            // Serialize leave balance checks for concurrent approvals of different requests.
            await Employee.updateOne(
              { _id: e._id, ...tenant(req) },
              { $inc: { payrollRevision: 1 } },
              { session },
            );
          }
          if (
            r.kind === "overtime" &&
            (await PayrollRequest.exists({
              ...tenant(req),
              employeeId: e._id,
              kind: "overtime",
              status: "approved",
              "data.dateKey": d.dateKey,
            }).session(session))
          )
            throw new Error("Overtime is already approved for this date");
          if (["loan", "advance"].includes(r.kind))
            await PayrollLoan.create(
              [
                {
                  ...tenant(req),
                  employeeId: e._id,
                  requestId: r._id,
                  kind: r.kind,
                  principalMinor: minor(d.amount),
                  installmentMinor: minor(d.installment),
                  balanceMinor: 0,
                  startMonth: d.startMonth,
                },
              ],
              { session },
            );
        }
        const before = r.toObject();
        r.status = req.body.status;
        r.decidedBy = req.user!.id;
        r.decisionReason = req.body.reason || 'Request approved';
        r.decidedAt = new Date();
        await r.save({ session });
        await Employee.updateOne(
          { _id: e._id, ...tenant(req) },
          { $inc: { payrollRevision: 1 } },
          { session },
        );
        await auditFor(
          req,
          "request.decision",
          String(r._id),
          req.body.reason,
          before,
          r.toObject(),
          session,
        );
        return r;
      }),
    );
  }),
);

payrollRouter.get(
  "/loans",
  financialAccess('payroll_view', 'payroll_loans_view', 'payroll_loans_manage'),
  handler(async (req, res) =>
    res.json({
      loans: await PayrollLoan.find(tenant(req)).sort({ createdAt: -1 }).lean(),
      movements: await PayrollLoanMovement.find(tenant(req))
        .sort({ createdAt: -1 })
        .lean(),
    }),
  ),
);
payrollRouter.post(
  "/loans/:id/movements",
  financialAccess('payroll_pay', 'payroll_loans_manage'),
  validate(
    Joi.object({
      kind: Joi.string()
        .valid("disbursement", "repayment", "cancellation")
        .required(),
      amount: amount.optional(),
      key: text.required(),
      reference: text.required(),
      reason: Joi.when('kind', { is: 'cancellation', then: text.required(), otherwise: optionalNote }),
    }),
  ),
  handler(async (req, res) => {
    res.json(
      await transaction(async (session) => {
        const existing = await PayrollLoanMovement.findOne({
          ...tenant(req),
          key: req.body.key,
        }).session(session);
        if (existing) {
          if (
            String(existing.loanId) !== String(req.params.id) ||
            existing.kind !== req.body.kind ||
            (req.body.kind === "repayment" &&
              existing.amountMinor !== minor(req.body.amount || 0))
          )
            throw new Error("Idempotency key belongs to another operation");
          return existing;
        }
        const l = await PayrollLoan.findOne({
          ...tenant(req),
          _id: req.params.id,
        }).session(session);
        if (!l) throw new Error("Loan not found");
        const before = l.toObject();
        let value = 0;
        if (req.body.kind === "disbursement") {
          if (l.status !== "approved")
            throw new Error("Only approved loans can be disbursed");
          value = l.principalMinor;
          l.balanceMinor = value;
          l.status = "disbursed";
        } else if (req.body.kind === "cancellation") {
          if (l.status !== "approved")
            throw new Error("Only undisbursed loans can be cancelled");
          l.status = "cancelled";
        } else {
          value = minor(req.body.amount || 0);
          if (l.status !== "disbursed" || value <= 0 || value > l.balanceMinor)
            throw new Error("Repayment exceeds outstanding disbursed balance");
          l.balanceMinor -= value;
          if (!l.balanceMinor) l.status = "settled";
        }
        await l.save({ session });
        await Employee.updateOne(
          { ...tenant(req), _id: l.employeeId },
          { $inc: { payrollRevision: 1 } },
          { session },
        );
        const movement = await PayrollLoanMovement.create(
          [
            {
              ...tenant(req),
              employeeId: l.employeeId,
              loanId: l._id,
              kind: req.body.kind,
              amountMinor: value,
              key: req.body.key,
              reference: req.body.reference,
              reason: req.body.reason || `Loan ${req.body.kind}: ${req.body.reference}`,
              actorId: req.user!.id,
              actorName: req.user!.name,
            },
          ],
          { session },
        );
        if (value && (req.body.kind === 'disbursement' || l.journalEntryId) && await FinancePolicy.exists(tenant(req)).session(session)) {
          const policy = await policyFor(req.user!.businessId);
          const j = await sourceSettlement(req.user!.businessId, req.user!.id, 'loan:movement:' + movement[0]._id, businessDate(policy.timeZone), policy.currency, req.body.reference, 'employee_loan', String(l._id), value, req.body.kind === 'disbursement' ? 'employee_loans' : 'cash', req.body.kind === 'disbursement' ? 'cash' : 'employee_loans', session);
          if (req.body.kind === 'disbursement' && j) { l.journalEntryId = j._id; await l.save({ session }); }
        }
        await auditFor(
          req,
          `loan.${req.body.kind}`,
          String(l._id),
          req.body.reason,
          before,
          l.toObject(),
          session,
        );
        return movement[0];
      }),
    );
  }),
);

payrollRouter.get(
  "/runs",
  financialAccess('payroll_view', 'payroll_prepare', 'payroll_approve', 'payroll_pay', 'payroll_reports'),
  handler(async (req, res) =>
    res.json(
      await PayrollRun.find(tenant(req))
        .sort({ month: -1, createdAt: -1 })
        .lean(),
    ),
  ),
);
payrollRouter.post(
  "/runs",
  permission("payroll_prepare"),
  validate(
    Joi.object({
      month: month.required(),
      kind: Joi.string().valid("regular", "adjustment", "final").required(),
      employeeIds: Joi.array().items(id.required()).unique().min(1).required(),
      parentRunId: id.optional(),
      reason: Joi.when('kind', { is: 'adjustment', then: text.required(), otherwise: optionalNote }),
    }),
  ),
  handler(async (req, res) => {
    monthRange(req.body.month);
    const p = await policyFor(req.user!.businessId);
    if (!p.enabled || !p.confirmed)
      throw new Error("Confirm and enable payroll settings first");
    const employees = await Employee.find({
      ...tenant(req),
      _id: { $in: req.body.employeeIds },
    });
    if (
      employees.length !== req.body.employeeIds.length ||
      employees.some((e) => !e.payrollEnrolled)
    )
      throw new Error(
        "All selected employees must be enrolled in this business",
      );
    if (
      req.body.kind === "final" &&
      employees.some(
        (e) =>
          !e.employmentEndDate ||
          e.employmentEndDate.slice(0, 7) !== req.body.month,
      )
    )
      throw new Error(
        "Final settlement requires an employment end date in the selected month",
      );
    if (req.body.kind === "adjustment" && !req.body.parentRunId)
      throw new Error("Adjustment runs require an approved parent run");
    if (
      req.body.parentRunId &&
      !(await PayrollRun.exists({
        ...tenant(req),
        _id: req.body.parentRunId,
        status: "approved",
      }))
    )
      throw new Error("Approved parent run not found");
    const run = await PayrollRun.create({
      ...req.body,
      reason: req.body.reason || `${req.body.kind} payroll for ${req.body.month}`,
      ...tenant(req),
      createdBy: req.user!.id,
      preparedBy: req.user!.id,
    });
    await auditFor(
      req,
      "run.create",
      String(run._id),
      req.body.reason,
      null,
      run.toObject(),
    );
    res.status(201).json(run);
  }),
);
payrollRouter.get(
  "/runs/:id",
  financialAccess('payroll_view', 'payroll_prepare', 'payroll_approve', 'payroll_pay'),
  handler(async (req, res) => {
    const run = await PayrollRun.findOne({
      ...tenant(req),
      _id: req.params.id,
    }).lean();
    if (!run) throw new Error("Run not found");
    res.json({
      ...run,
      items: await paymentSummary(
        req,
        run.items.map((i: any) => ({ ...i, runId: String(run._id) })),
      ),
      audit: await PayrollAudit.find({ ...tenant(req), $or: [{ targetId: String(run._id) }, { 'after.runId': run._id }, { 'before.runId': run._id }] }).select('actorId actorName action reason reasonProvided createdAt').sort({ createdAt: -1, _id: -1 }).limit(100).lean(),
    });
  }),
);
payrollRouter.put(
  "/runs/:id/adjustments",
  permission("payroll_prepare"),
  validate(
    Joi.object({
      version: Joi.number().integer().required(),
      reason: text.required(),
      adjustments: Joi.array()
        .items(
          Joi.object({
            employeeId: id.required(),
            kind: Joi.string()
              .valid(
                "bonus",
                "reimbursement",
                "deduction",
                "allowance",
                "benefit",
                "encashment",
                "recovery",
              )
              .required(),
            amount: Joi.number()
              .min(-1_000_000_000)
              .max(1_000_000_000)
              .precision(2).strict()
              .required(),
            reason: text.required(),
            loanId: id.optional(),
          }),
        )
        .max(1000)
        .required(),
    }),
  ),
  handler(async (req, res) => {
    res.json(
      await transaction(async (session) => {
        const run = await getRun(req, session);
        if (!["draft", "calculated"].includes(run.status))
          throw new Error("Return the run before changing adjustments");
        const recoveries = new Set<string>();
        for (const a of req.body.adjustments) {
          if (a.kind === "recovery") {
            const key = `${a.employeeId}:${a.loanId}`;
            if (recoveries.has(key))
              throw new Error(
                "Only one recovery override per employee loan is allowed",
              );
            recoveries.add(key);
          }
          if (!run.employeeIds.some((i: any) => String(i) === a.employeeId))
            throw new Error("Adjustment employee is outside this run");
          if (
            a.kind === "recovery" &&
            (!a.loanId ||
              !(await PayrollLoan.exists({
                ...tenant(req),
                _id: a.loanId,
                employeeId: a.employeeId,
                status: "disbursed",
              }).session(session)))
          )
            throw new Error("Recovery requires a disbursed employee loan");
        }
        run.adjustments = req.body.adjustments.map(({ amount, ...a }: any) => ({
          ...a,
          amountMinor: minor(amount),
        }));
        run.status = "draft";
        run.items = [];
        run.totals = undefined;
        run.sourceHash = undefined;
        run.preparedBy = req.user!.id;
        run.version++;
        await run.save({ session });
        await auditFor(
          req,
          "run.adjustments",
          String(run._id),
          req.body.reason,
          null,
          run.adjustments,
          session,
        );
        return run;
      }),
    );
  }),
);
for (const action of ["calculate", "submit", "approve", "return"])
  payrollRouter.post(
    `/runs/:id/${action}`,
    permission(
      action === "approve" || action === "return"
        ? "payroll_approve"
        : "payroll_prepare",
    ),
    validate(reasonSchema),
    handler(async (req, res) => {
      if (action === 'return' && !req.body.reason.trim()) throw new Error('Reason is required when returning payroll');
      res.json(
        await transaction(async (session) => {
          const run = await getRun(req, session);
          const before = run.toObject();
          if (action === "calculate") {
            if (!["draft", "calculated"].includes(run.status))
              throw new Error(
                "Only draft or calculated runs can be recalculated",
              );
            const { to } = monthRange(run.month);
            const p = await policyFor(req.user!.businessId);
            const today = new Intl.DateTimeFormat("en-CA", {
              timeZone: p.timeZone,
            }).format(new Date());
            const endDate =
              run.kind === "final"
                ? (
                    await Employee.find({
                      ...tenant(req),
                      _id: { $in: run.employeeIds },
                    }).session(session)
                  )
                    .map((e) => e.employmentEndDate)
                    .sort()
                    .at(-1)
                : to;
            if (run.kind !== "adjustment" && (!endDate || endDate >= today))
              throw new Error(
                "Calculate only after the covered employment/pay period has ended",
              );
            run.set(await calculateRun(req.user!.businessId, run, session));
            run.status = "calculated";
            run.preparedBy = req.user!.id;
          } else if (action === "return") {
            if (run.status !== "submitted")
              throw new Error("Only submitted runs can be returned");
            run.status = "draft";
            run.items = [];
            run.totals = undefined;
            run.sourceHash = undefined;
          } else {
            if (
              run.status !== (action === "submit" ? "calculated" : "submitted")
            )
              throw new Error("Invalid payroll transition");
            if (
              !run.items.length ||
              run.items.some((i: any) => i.exceptions.length)
            )
              throw new Error(
                "Resolve all payroll exceptions before submission or approval",
              );
            if (
              (await payrollSource(req.user!.businessId, run, session))
                .sourceHash !== run.sourceHash
            )
              throw new Error(
                "Payroll sources changed. Return/recalculate this run before proceeding",
              );
            if (action === "submit") {
              run.status = "submitted";
              run.submittedAt = new Date();
              run.preparedBy = req.user!.id;
            } else {
              // Serialize approval against policy edits without changing the calculation inputs.
              await PayrollPolicy.updateOne(
                tenant(req),
                { $inc: { transitionLock: 1 } },
                { session, timestamps: false },
              );
              for (const item of run.items) {
                await Employee.updateOne(
                  { _id: item.employeeId, ...tenant(req) },
                  { $inc: { payrollRevision: 1 } },
                  { session },
                );
                if (item.payableDates.length)
                  await PayrollDayClaim.insertMany(
                    item.payableDates.map((dateKey: string) => ({
                      ...tenant(req),
                      employeeId: item.employeeId,
                      dateKey,
                      runId: run._id,
                    })),
                    { session },
                  );
                for (const line of item.lines.filter(
                  (l: any) => l.kind === "recovery" && l.amountMinor > 0,
                )) {
                  const l = await PayrollLoan.findOne({
                    ...tenant(req),
                    _id: line.loanId,
                    employeeId: item.employeeId,
                    status: "disbursed",
                    balanceMinor: { $gte: line.amountMinor },
                  }).session(session);
                  if (!l) throw new Error("Loan balance changed");
                  if (!l.journalEntryId && await FinancePolicy.exists(tenant(req)).session(session)) throw new Error('Allocate the historical loan to reviewed opening balances before payroll recovery');
                  l.balanceMinor -= line.amountMinor;
                  if (!l.balanceMinor) l.status = "settled";
                  await l.save({ session });
                  await PayrollLoanMovement.create(
                    [
                      {
                        ...tenant(req),
                        employeeId: item.employeeId,
                        loanId: l._id,
                        runId: run._id,
                        kind: "recovery",
                        amountMinor: line.amountMinor,
                        key: `run:${run._id}:loan:${l._id}`,
                        reason: req.body.reason || `Payroll recovery for ${run.month}`,
                        actorId: req.user!.id,
                        actorName: req.user!.name,
                      },
                    ],
                    { session },
                  );
                }
                const commissionIds = item.lines
                  .filter((l: any) => l.kind === "commission")
                  .flatMap((l: any) => l.sourceIds);
                if (commissionIds.length) {
                  const updated = await PayrollCommission.updateMany(
                    {
                      ...tenant(req),
                      _id: { $in: commissionIds },
                      runId: null,
                      reversed: false,
                    },
                    { $set: { runId: run._id } },
                    { session },
                  );
                  if (updated.modifiedCount !== commissionIds.length)
                    throw new Error(
                      "Commission was already claimed by another run",
                    );
                }
              }
              if (await FinancePolicy.exists(tenant(req)).session(session)) {
                const amounts: Record<string, number> = { payroll_expense: 0, salary_payable: 0, employee_loans: 0, deductions_payable: 0, employer_payable: 0 };
                for (const item of run.items) {
                  const recovery = item.lines.filter((l: any) => l.kind === 'recovery').reduce((n: number, l: any) => n + l.amountMinor, 0);
                  amounts.payroll_expense += item.employerCostMinor;
                  amounts.salary_payable += item.netMinor;
                  amounts.employee_loans += recovery;
                  amounts.deductions_payable += item.deductionsMinor - recovery;
                  amounts.employer_payable += item.employerCostMinor - item.grossMinor;
                }
                const lines = [];
                for (const [key, value] of Object.entries(amounts)) if (value) lines.push({ accountId: await systemAccount(req.user!.businessId, key, session), debitMinor: key === 'payroll_expense' ? value : 0, creditMinor: key === 'payroll_expense' ? 0 : value });
                if (lines.length) {
                  const entry = await postSource({ businessId: req.user!.businessId, actorId: req.user!.id, key: 'payroll:' + run._id + ':approval', dateKey: businessDate(run.policy.timeZone), currency: run.policy.currency, description: 'Payroll ' + run.month + ' / ' + run.kind, source: 'payroll', sourceId: String(run._id), lines }, session);
                  run.journalEntryId = entry._id;
                }
              }
              run.status = "approved";
              run.approvedBy = req.user!.id;
              run.approvedAt = new Date();
            }
          }
          run.version++;
          await run.save({ session });
          await auditFor(
            req,
            `run.${action}`,
            String(run._id),
            req.body.reason,
            before,
            run.toObject(),
            session,
          );
          return run;
        }),
      );
    }),
  );

payrollRouter.get(
  "/payments",
  financialAccess('payroll_pay', 'payroll_payment_reverse'),
  handler(async (req, res) =>
    res.json(
      await PayrollPayment.find(tenant(req)).sort({ createdAt: -1 }).lean(),
    ),
  ),
);
const paymentInput = Joi.object({
  runId: id.required(),
  employeeId: id.required(),
  amount: amount.greater(0).required(),
  dateKey: date.required(),
  method: Joi.string().valid("cash", "bank").required(),
  reference: text.required(),
  key: text.required(),
});
payrollRouter.post(
  "/payments",
  permission("payroll_pay"),
  validate(
    Joi.object({
      payments: Joi.array().items(paymentInput).min(1).max(500).required(),
      reason: optionalNote,
    }),
  ),
  handler(async (req, res) => {
    res.json(
      await transaction(async (session) => {
        const result = [];
        for (const data of req.body.payments) {
          const value = minor(data.amount);
          const existing = await PayrollPayment.findOne({
            ...tenant(req),
            key: data.key,
          }).session(session);
          if (existing) {
            if (
              String(existing.runId) !== data.runId ||
              String(existing.employeeId) !== data.employeeId ||
              existing.amountMinor !== value
              || existing.method !== data.method || existing.dateKey !== data.dateKey || existing.reference !== data.reference
            )
              throw new Error("Idempotency key belongs to a different payment");
            result.push(existing);
            continue;
          }
          const run = await PayrollRun.findOneAndUpdate(
            { ...tenant(req), _id: data.runId, status: "approved" },
            { $inc: { version: 1 } },
            { returnDocument: 'after', session },
          );
          if (!run) throw new Error("Only approved payroll can be paid");
          if (run.journalEntryId) {
            const journal = await JournalEntry.findOne({ ...tenant(req), _id: run.journalEntryId, status: 'posted', reversedBy: { $exists: false } }).session(session);
            if (!journal) throw new Error('Payroll payable journal is missing or reversed');
            if (data.dateKey < journal.dateKey) throw new Error('Payment date cannot precede the payroll accounting date');
          } else if (await FinancePolicy.exists(tenant(req)).session(session)) {
            throw new Error('Allocate the historical payroll to reviewed opening balances before payment');
          }
          const item = run.items.find(
            (i: any) => i.employeeId === data.employeeId,
          );
          if (!item) throw new Error("Employee is outside this run");
          const payments = await PayrollPayment.find({
            ...tenant(req),
            runId: run._id,
            employeeId: data.employeeId,
            reversedAt: { $exists: false },
          }).session(session);
          if (
            value >
            item.netMinor - payments.reduce((n, p) => n + p.amountMinor, 0)
          )
            throw new Error("Payment exceeds outstanding salary");
          const created = await PayrollPayment.create(
            [
              {
                ...tenant(req),
                ...data,
                amountMinor: value,
                actorId: req.user!.id,
              },
            ],
            { session },
          );
          if (run.journalEntryId) await sourceSettlement(req.user!.businessId, req.user!.id, 'payroll:payment:' + created[0]._id, data.dateKey, run.policy.currency, data.reference, 'payroll_payment', String(created[0]._id), value, 'salary_payable', data.method, session);
          await auditFor(
            req,
            "payment.record",
            String(created[0]._id),
            req.body.reason,
            null,
            created[0].toObject(),
            session,
          );
          result.push(created[0]);
        }
        return result;
      }),
    );
  }),
);
payrollRouter.post(
  "/payments/:id/reverse",
  permission('payroll_payment_reverse'),
  validate(Joi.object({ reason: text.required(), dateKey: date.optional() })),
  handler(async (req, res) => {
    res.json(
      await transaction(async (session) => {
        const p = await PayrollPayment.findOne({
          ...tenant(req),
          _id: req.params.id,
        }).session(session);
        if (!p) throw new Error("Payment not found");
        if (p.reversedAt) return p;
        await PayrollRun.updateOne(
          { ...tenant(req), _id: p.runId },
          { $inc: { version: 1 } },
          { session },
        );
        const reversalDate = req.body.dateKey || businessDate((await policyFor(req.user!.businessId)).timeZone);
        if (reversalDate < p.dateKey) throw new Error('Reversal date cannot precede payment date');
        await reverseSource(req.user!.businessId, req.user!.id, 'payroll:payment:' + p._id, reversalDate, req.body.reason, session);
        p.reversedAt = new Date();
        p.reversedBy = req.user!.id;
        p.reversalReason = req.body.reason;
        await p.save({ session });
        await auditFor(
          req,
          "payment.reverse",
          String(p._id),
          req.body.reason,
          null,
          p.toObject(),
          session,
        );
        return p;
      }),
    );
  }),
);
payrollRouter.get(
  "/reports",
  permission("payroll_reports"),
  handler(async (req, res) => {
    const from = String(req.query.from || `${new Date().getUTCFullYear()}-01`);
    const to = String(req.query.to || new Date().toISOString().slice(0, 7));
    monthRange(from);
    monthRange(to);
    if (from > to) throw new Error("Report start must not follow its end");
    const runs = await PayrollRun.find({
      ...tenant(req),
      status: "approved",
      month: { $gte: from, $lte: to },
    })
      .sort({ month: -1 })
      .lean();
    let rows = await paymentSummary(
      req,
      runs.flatMap((r) =>
        r.items.map((i: any) => ({
          ...i,
          runId: String(r._id),
          month: r.month,
          kind: r.kind,
          currency: r.policy.currency,
        })),
      ),
    );
    rows = rows.filter(
      (i) =>
        (!req.query.employeeId || i.employeeId === req.query.employeeId) &&
        (!req.query.department || i.department === req.query.department) &&
        (!req.query.designation || i.designation === req.query.designation) &&
        (!req.query.status || i.paymentStatus === req.query.status),
    );
    const matchingEmployees = await Employee.find({
      ...tenant(req),
      ...(req.query.employeeId ? { _id: req.query.employeeId } : {}),
      ...(req.query.department ? { department: req.query.department } : {}),
      ...(req.query.designation ? { designation: req.query.designation } : {}),
    }).lean();
    const scopedEmployees = matchingEmployees.map((e) => e._id);
    const { to: end } = monthRange(to);
    const balances = [];
    for (const e of matchingEmployees)
      balances.push({
        employeeId: String(e._id),
        employeeName: e.fullName,
        balances: await leaveBalances(req.user!.businessId, e, end),
      });
    res.json({
      rows,
      balances,
      payments: await PayrollPayment.find({
        ...tenant(req),
        employeeId: { $in: scopedEmployees },
        dateKey: { $gte: `${from}-01`, $lte: end },
      }).lean(),
      commissions: await PayrollCommission.find({
        ...tenant(req),
        employeeId: { $in: scopedEmployees },
        dateKey: { $gte: `${from}-01`, $lte: end },
      }).lean(),
      loans: await PayrollLoan.find({
        ...tenant(req),
        employeeId: { $in: scopedEmployees },
      }).lean(),
      movements: await PayrollLoanMovement.find({
        ...tenant(req),
        employeeId: { $in: scopedEmployees },
        createdAt: {
          $gte: new Date(`${from}-01`),
          $lt: new Date(+new Date(end) + 86400000),
        },
      }).lean(),
      audit: await PayrollAudit.find({
        ...tenant(req),
        createdAt: {
          $gte: new Date(`${from}-01`),
          $lt: new Date(+new Date(end) + 86400000),
        },
      })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
    });
  }),
);
payrollRouter.get(
  "/payslips/:runId/:employeeId",
  permission("payroll_view"),
  handler(async (req, res) => {
    const r = await PayrollRun.findOne({
      ...tenant(req),
      _id: req.params.runId,
      status: "approved",
    }).lean();
    const item = r?.items.find(
      (i: any) => i.employeeId === req.params.employeeId,
    );
    if (!item) throw new Error("Released payslip not found");
    res.json({
      ...r,
      items: await paymentSummary(req, [{ ...item, runId: String(r!._id) }]),
    });
  }),
);

export const myPayrollRouter = Router();
myPayrollRouter.use(protect);
const ownRequestKinds = (req: AuthRequest) => [
  ...(canFinancial(req, 'self_leave') ? ['leave'] : []),
  ...(canFinancial(req, 'self_loan') ? ['loan', 'advance'] : []),
  ...(canFinancial(req, 'self_overtime') ? ['overtime'] : []),
];
myPayrollRouter.get('/requests-meta', financialAccess('self_leave', 'self_loan', 'self_overtime'), handler(async (req, res) => {
  const e = await employeeFor(req); const p = await policyFor(req.user!.businessId);
  res.json({ employee: { _id: e._id, fullName: e.fullName }, currency: p.currency, kinds: ownRequestKinds(req), balances: canFinancial(req, 'self_leave') ? await leaveBalances(req.user!.businessId, e, businessDate(p.timeZone)) : {}, requests: await PayrollRequest.find({ ...tenant(req), employeeId: e._id, kind: { $in: ownRequestKinds(req) } }).sort({ createdAt: -1 }).lean(), loans: canFinancial(req, 'self_loan') ? await PayrollLoan.find({ ...tenant(req), employeeId: e._id }).lean() : [] });
}));
myPayrollRouter.get(
  "/",
  financialAccess('self_payroll'),
  handler(async (req, res) => {
    const e = await employeeFor(req);
    const policy = await policyFor(req.user!.businessId);
    const runs = await PayrollRun.find({
      ...tenant(req),
      status: "approved",
      employeeIds: e._id,
    })
      .sort({ month: -1 })
      .lean();
    res.json({
      currency: policy.currency,
      employee: {
        _id: e._id,
        fullName: e.fullName,
        employeeCode: e.employeeCode,
      },
      payslips: await paymentSummary(
        req,
        runs.flatMap((r) =>
          r.items
            .filter((i: any) => i.employeeId === String(e._id))
            .map((i: any) => ({
              ...i,
              runId: String(r._id),
              month: r.month,
              currency: r.policy.currency,
            })),
        ),
      ),
      payments: await PayrollPayment.find({ ...tenant(req), employeeId: e._id })
        .sort({ createdAt: -1 })
        .lean(),
      requests: await PayrollRequest.find({ ...tenant(req), employeeId: e._id, kind: { $in: ownRequestKinds(req) } })
        .sort({ createdAt: -1 })
        .lean(),
      loans: canFinancial(req, 'self_loan') ? await PayrollLoan.find({
        ...tenant(req),
        employeeId: e._id,
      }).lean() : [],
      balances: canFinancial(req, 'self_leave') ? await leaveBalances(
        req.user!.businessId,
        e,
        new Date().toISOString().slice(0, 10),
      ) : {},
    });
  }),
);
myPayrollRouter.post(
  "/requests",
  financialAccess('self_leave', 'self_loan', 'self_overtime'),
  validate(requestSchema),
  handler(async (req, res) => {
    if (!ownRequestKinds(req).includes(req.body.kind)) throw Object.assign(new Error('This request feature has not been shared with your account'), { status: 403 });
    res.status(201).json(await createRequest(req, true));
  }),
);
myPayrollRouter.post(
  "/requests/:id/cancel",
  financialAccess('self_leave', 'self_loan', 'self_overtime'),
  handler(async (req, res) => {
    res.json(await transaction(async session => {
    const e = await employeeFor(req, undefined, session);
    const before = await PayrollRequest.findOne({ ...tenant(req), _id: req.params.id, employeeId: e._id }).session(session).lean();
    const r = await PayrollRequest.findOneAndUpdate(
      {
        ...tenant(req),
        _id: req.params.id,
        employeeId: e._id,
        status: "pending",
        kind: { $in: ownRequestKinds(req) },
      },
      {
        $set: { status: "cancelled", decisionReason: "Cancelled by employee", decidedBy: req.user!.id, decidedAt: new Date() },
      },
      { returnDocument: 'after', session },
    );
    if (!r) throw new Error("Pending request not found");
    await auditFor(
      req,
      "request.cancel",
      String(r._id),
      "Cancelled by employee",
      before,
      r.toObject(),
      session,
    );
    return r;
    }));
  }),
);
export const salespersonRouter = Router();
salespersonRouter.get(
  "/",
  protect,
  handler(async (req, res) => {
    const p = await policyFor(req.user!.businessId);
    const employees = await Employee.find({ ...tenant(req), status: "active" })
      .select("fullName employeeCode userId")
      .lean();
    res.json({
      required: p.enabled && p.commissionsEnabled,
      employees: employees.map((e) => ({
        _id: e._id,
        fullName: e.fullName,
        employeeCode: e.employeeCode,
      })),
      defaultEmployeeId: String(
        employees.find((e) => String(e.userId) === req.user!.id)?._id || "",
      ),
    });
  }),
);
