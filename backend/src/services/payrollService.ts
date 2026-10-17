import mongoose, { type ClientSession } from "mongoose";
import { createHash } from "crypto";
import Employee from "../models/Employee";
import Attendance from "../models/Attendance";
import EmployeeLeave from "../models/EmployeeLeave";
import Transaction from "../models/Transaction";
import {
  PayrollAudit,
  PayrollCommission,
  PayrollDayClaim,
  PayrollLoan,
  PayrollPolicy,
  PayrollRequest,
  SalaryStructure,
} from "../models/Payroll";
import {
  calculateEmployee,
  defaultSchedule,
  minor,
  monthRange,
  percentOf,
  structureOn,
  type Structure,
} from "./payrollCalculator";

export const payrollTenant = (businessId: string) => ({
  businessId: new mongoose.Types.ObjectId(businessId),
});
export const audit = async (
  businessId: string,
  actorId: string,
  action: string,
  targetId: string,
  reason: string,
  before: unknown,
  after: unknown,
  session?: ClientSession,
) => {
  await PayrollAudit.create(
    [
      {
        ...payrollTenant(businessId),
        actorId,
        action,
        targetId,
        reason,
        before,
        after,
      },
    ],
    { session },
  );
};
export const policyFor = async (businessId: string) => {
  const existing = await PayrollPolicy.findOne(
    payrollTenant(businessId),
  ).lean();
  return (
    existing || {
      enabled: false,
      confirmed: false,
      currency: "PKR",
      timeZone: "Asia/Karachi",
      overtimeMultiplier: 1,
      commissionsEnabled: false,
      dailyPaidNonWork: false,
      hourlyPaidNonWork: false,
      allowZeroPay: false,
      latePenaltyMinor: 0,
      earlyPenaltyMinor: 0,
      holidays: [],
      leaveRules: {
        casual: { paid: true, annualDays: 0, openingDays: 0, carryLimit: 0 },
        sick: { paid: true, annualDays: 0, openingDays: 0, carryLimit: 0 },
        annual: { paid: true, annualDays: 0, openingDays: 0, carryLimit: 0 },
        unpaid: { paid: false, annualDays: 0 },
        other: { paid: false, annualDays: 0 },
      },
    }
  );
};
export async function saveSalary(
  businessId: string,
  employeeId: string,
  actorId: string,
  data: Record<string, any>,
  session: ClientSession,
) {
  const tenant = payrollTenant(businessId);
  const e = await Employee.findOne({ ...tenant, _id: employeeId }).session(
    session,
  );
  if (!e) throw new Error("Employee not found in this business");
  const p = await PayrollPolicy.findOne(tenant).session(session);
  if (data.baseMinor === 0 && !p?.allowZeroPay)
    throw new Error("Enable zero pay explicitly in payroll settings first");
  const locked = await PayrollDayClaim.exists({
    ...tenant,
    employeeId,
    dateKey: { $gte: data.effectiveDate },
  }).session(session);
  if (locked)
    throw new Error(
      "This effective date overlaps approved payroll. Use an adjustment run for historical corrections",
    );
  const s = await SalaryStructure.create(
    [{ ...data, ...tenant, employeeId, createdBy: actorId }],
    { session },
  );
  await Employee.updateOne(
    { ...tenant, _id: employeeId },
    { $inc: { payrollRevision: 1 } },
    { session },
  );
  await syncSalarySummary(businessId, employeeId, session);
  await audit(
    businessId,
    actorId,
    "salary.create",
    String(s[0]._id),
    data.reason,
    null,
    s[0].toObject(),
    session,
  );
  return s[0];
}
export async function syncSalarySummary(
  businessId: string,
  employeeId: string,
  session?: ClientSession,
) {
  const p = await policyFor(businessId);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: p.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const structures = await SalaryStructure.find({
    ...payrollTenant(businessId),
    employeeId,
    effectiveDate: { $lte: today },
  })
    .sort({ effectiveDate: -1 })
    .limit(1)
    .session(session || null);
  if (structures[0])
    await Employee.updateOne(
      {
        ...payrollTenant(businessId),
        _id: employeeId,
        $or: [
          { salary: { $ne: structures[0].baseMinor / 100 } },
          { salaryType: { $ne: structures[0].salaryType } },
        ],
      },
      {
        $set: {
          salary: structures[0].baseMinor / 100,
          salaryType: structures[0].salaryType,
        },
      },
      { session },
    );
}
export async function payrollSource(
  businessId: string,
  run: any,
  session?: ClientSession,
) {
  const t = payrollTenant(businessId);
  const { from, to } = monthRange(run.month);
  const employeeIds = run.employeeIds;
  const employees = await Employee.find({ ...t, _id: { $in: employeeIds } })
    .sort({ _id: 1 })
    .session(session || null)
    .lean();
  const structures = await SalaryStructure.find({
    ...t,
    employeeId: { $in: employeeIds },
    effectiveDate: { $lte: to },
  })
    .sort({ employeeId: 1, effectiveDate: 1 })
    .session(session || null)
    .lean();
  const records = await Attendance.find({
    ...t,
    employeeId: { $in: employeeIds },
    dateKey: { $gte: from, $lte: to },
  })
    .sort({ _id: 1 })
    .session(session || null)
    .lean();
  const leaves = await EmployeeLeave.find({
    ...t,
    employeeId: { $in: employeeIds },
    startDate: { $lte: to },
    endDate: { $gte: from },
  })
    .sort({ _id: 1 })
    .session(session || null)
    .lean();
  const requests = await PayrollRequest.find({
    ...t,
    employeeId: { $in: employeeIds },
    status: "approved",
  })
    .sort({ _id: 1 })
    .session(session || null)
    .lean();
  const loans = await PayrollLoan.find({
    ...t,
    employeeId: { $in: employeeIds },
    status: "disbursed",
    startMonth: { $lte: run.month },
  })
    .sort({ _id: 1 })
    .session(session || null)
    .lean();
  const commissions = await PayrollCommission.find({
    ...t,
    employeeId: { $in: employeeIds },
    dateKey: { $lte: to },
    runId: null,
    reversed: false,
  })
    .sort({ _id: 1 })
    .session(session || null)
    .lean();
  const claims = await PayrollDayClaim.find({
    ...t,
    employeeId: { $in: employeeIds },
    dateKey: { $gte: from, $lte: to },
  })
    .sort({ _id: 1 })
    .session(session || null)
    .lean();
  const policy = await PayrollPolicy.findOne(t)
    .session(session || null)
    .lean();
  if (!policy?.enabled || !policy.confirmed)
    throw new Error("Confirm and enable business payroll settings first");
  const source = {
    employees,
    structures,
    records,
    leaves,
    requests,
    loans,
    commissions,
    claims,
    policy,
  };
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(source))
    .digest("hex");
  return { ...source, sourceHash };
}
export async function calculateRun(
  businessId: string,
  run: any,
  session: ClientSession,
) {
  const source = await payrollSource(businessId, run, session);
  const belongs = (row: any, e: any) =>
    String(row.employeeId) === String(e._id);
  const items = source.employees.map((e) =>
    calculateEmployee({
      employee: e as any,
      month: run.month,
      structures: source.structures.filter((s) =>
        belongs(s, e),
      ) as unknown as Structure[],
      policy: source.policy as any,
      records:
        run.kind === "adjustment"
          ? []
          : (source.records.filter((r) => belongs(r, e)) as any),
      leaves: source.leaves.filter((l) => belongs(l, e)) as any,
      requests: source.requests.filter((r) => belongs(r, e)) as any,
      commissions:
        run.kind === "adjustment"
          ? []
          : (source.commissions.filter((c) => belongs(c, e)) as any),
      loans:
        run.kind === "adjustment"
          ? []
          : (source.loans
              .filter((l) => belongs(l, e))
              .map((l) =>
                run.kind === "final"
                  ? { ...l, installmentMinor: l.balanceMinor }
                  : l,
              ) as any),
      adjustments: run.adjustments.filter(
        (a: any) => String(a.employeeId) === String(e._id),
      ),
      claimedDays:
        run.kind === "adjustment"
          ? Array.from(
              { length: 31 },
              (_, i) => `${run.month}-${String(i + 1).padStart(2, "0")}`,
            )
          : source.claims.filter((c) => belongs(c, e)).map((c) => c.dateKey),
    }),
  );
  if (items.length !== run.employeeIds.length)
    throw new Error(
      "One or more run employees no longer belong to this business",
    );
  return {
    items,
    sourceHash: source.sourceHash,
    policy: source.policy,
    totals: {
      grossMinor: items.reduce((n, i) => n + i.grossMinor, 0),
      deductionsMinor: items.reduce((n, i) => n + i.deductionsMinor, 0),
      netMinor: items.reduce((n, i) => n + i.netMinor, 0),
      employerCostMinor: items.reduce((n, i) => n + i.employerCostMinor, 0),
    },
  };
}

export async function salesPerson(
  businessId: string,
  userId: string,
  selected: string | undefined,
  session: ClientSession,
) {
  if (
    selected &&
    (typeof selected !== "string" || !mongoose.Types.ObjectId.isValid(selected))
  )
    throw new Error("Invalid salesperson identifier");
  const p = await PayrollPolicy.findOne(payrollTenant(businessId)).session(
    session,
  );
  const e = await Employee.findOne({
    ...payrollTenant(businessId),
    status: "active",
    ...(selected ? { _id: selected } : { userId }),
  }).session(session);
  if (selected && !e)
    throw new Error("Salesperson must be an active employee in this business");
  if (p?.enabled && p.commissionsEnabled && !e)
    throw new Error("Select a salesperson for this sale");
  return e ? { salespersonEmployeeId: e._id, salespersonName: e.fullName } : {};
}
export async function recordCommission(sale: any, session: ClientSession) {
  if (
    !sale.salespersonEmployeeId ||
    sale.type !== "reduction" ||
    !["pos", "order_desk"].includes(sale.source)
  )
    return;
  const p = await PayrollPolicy.findOne({
    businessId: sale.businessId,
  }).session(session);
  if (!p?.enabled || !p.commissionsEnabled) return;
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: p.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(sale.timestamp || Date.now()));
  const structures = await SalaryStructure.find({
    businessId: sale.businessId,
    employeeId: sale.salespersonEmployeeId,
    effectiveDate: { $lte: dateKey },
  })
    .session(session)
    .lean();
  const s = structureOn(structures as unknown as Structure[], dateKey);
  if (!s?.commissionPercent) return;
  await Employee.updateOne(
    { businessId: sale.businessId, _id: sale.salespersonEmployeeId },
    { $inc: { payrollRevision: 1 } },
    { session },
  );
  const eligibleMinor = Math.max(
    0,
    minor(sale.subtotal || 0) - minor(sale.discountAmount || 0),
  );
  await PayrollCommission.create(
    [
      {
        businessId: sale.businessId,
        employeeId: sale.salespersonEmployeeId,
        saleId: sale.id,
        key: `sale:${sale.id}`,
        dateKey,
        eligibleMinor,
        amountMinor: percentOf(eligibleMinor, s.commissionPercent),
        percent: s.commissionPercent,
      },
    ],
    { session },
  );
}
export async function reverseCommission(sale: any, session: ClientSession) {
  const c = await PayrollCommission.findOne({
    businessId: sale.businessId,
    key: `sale:${sale.id}`,
  }).session(session);
  if (!c || c.reversed) return;
  await Employee.updateOne(
    { businessId: c.businessId, _id: c.employeeId },
    { $inc: { payrollRevision: 1 } },
    { session },
  );
  if (c.runId) {
    await PayrollCommission.create(
      [
        {
          businessId: c.businessId,
          employeeId: c.employeeId,
          saleId: c.saleId,
          key: `reversal:${sale.id}`,
          dateKey: c.dateKey,
          eligibleMinor: -c.eligibleMinor,
          amountMinor: -c.amountMinor,
          percent: c.percent,
          reversalOf: c._id,
        },
      ],
      { session },
    );
  }
  c.reversed = true;
  await c.save({ session });
}

export async function leaveBalances(
  businessId: string,
  e: any,
  at: string,
  session?: ClientSession,
) {
  const p = await policyFor(businessId);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: p.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (at > today) at = today;
  const year = Number(at.slice(0, 4));
  const startYear = Number((e.joiningDate || at).slice(0, 4));
  const leaves = await EmployeeLeave.find({
    ...payrollTenant(businessId),
    employeeId: e._id,
  })
    .session(session || null)
    .lean();
  const balance: Record<string, number> = {};
  const structures = await SalaryStructure.find({
    ...payrollTenant(businessId),
    employeeId: e._id,
    effectiveDate: { $lte: at },
  })
    .session(session || null)
    .lean();
  const ruleOn = (type: string, day: string) =>
    structureOn(structures as unknown as Structure[], day)?.leaveRules?.[
      type
    ] ||
    p.leaveRules[type] ||
    {};
  for (const type of Object.keys(p.leaveRules)) {
    let available = ruleOn(type, e.joiningDate || at).openingDays || 0;
    for (let y = startYear; y <= year; y++) {
      if (y > startYear)
        available = Math.min(
          Math.max(0, available),
          ruleOn(type, `${y}-01-01`).carryLimit || 0,
        );
      const accruedMonths = y === year ? Number(at.slice(5, 7)) : 12;
      const joinMonth =
        y === startYear ? Number((e.joiningDate || at).slice(5, 7)) : 1;
      for (let m = joinMonth; m <= accruedMonths; m++) {
        const end = monthRange(`${y}-${String(m).padStart(2, "0")}`).to;
        available += (ruleOn(type, end > at ? at : end).annualDays || 0) / 12;
      }
      for (const l of leaves.filter((l) => l.leaveType === type)) {
        const from = l.startDate > `${y}-01-01` ? l.startDate : `${y}-01-01`;
        const to =
          l.endDate < (y === year ? at : `${y}-12-31`)
            ? l.endDate
            : y === year
              ? at
              : `${y}-12-31`;
        if (from <= to) {
          const { dateKeys } = await import("./payrollCalculator");
          available -=
            dateKeys(from, to).filter((d) => {
              const s = structureOn(structures as unknown as Structure[], d);
              return (
                (s?.schedule || defaultSchedule).workingDays.includes(
                  new Date(`${d}T00:00Z`).getUTCDay(),
                ) && !p.holidays.includes(d)
              );
            }).length * (l.fraction || 1);
        }
      }
    }
    balance[type] = Math.round(available * 100) / 100;
  }
  return balance;
}

// Explicit, idempotent opening migration; never invent salary or commission history.
export async function migratePayrollBusiness(
  businessId: string,
  actorId: string,
) {
  const employees = await Employee.find(payrollTenant(businessId));
  let migrated = 0;
  for (const e of employees) {
    if (
      !e.joiningDate ||
      e.salary <= 0 ||
      (await SalaryStructure.exists({
        ...payrollTenant(businessId),
        employeeId: e._id,
      }))
    )
      continue;
    const settings = await import("../utils/tenancy");
    const app = await settings.getAppSettingsForTenant({
      businessId,
      businessIsLegacy: false,
    });
    await SalaryStructure.updateOne(
      {
        ...payrollTenant(businessId),
        employeeId: e._id,
        effectiveDate: e.joiningDate,
      },
      {
        $setOnInsert: {
          baseMinor: minor(e.salary),
          salaryType: e.salaryType,
          components: [],
          commissionPercent: 0,
          schedule: {
            ...defaultSchedule,
            workingDays: [0, 1, 2, 3, 4, 5, 6].filter(
              (d) => !app.attendanceWeeklyOffDays.includes(d),
            ),
          },
          reason: "Opening salary migration; prior salary history unavailable",
          createdBy: actorId,
        },
      },
      { upsert: true },
    );
    migrated++;
  }
  await audit(
    businessId,
    actorId,
    "migration.opening",
    businessId,
    "Opening salary migration",
    null,
    { migrated },
  );
  return {
    migrated,
    incomplete: employees
      .filter((e) => !e.joiningDate || e.salary <= 0)
      .map((e) => ({ employeeId: e._id, name: e.fullName })),
  };
}
