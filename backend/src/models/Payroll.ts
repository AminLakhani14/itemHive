import mongoose, { Schema } from "mongoose";
import { branchScopedPlugin } from "../utils/branchScope";

// Payroll collections never use the legacy unscoped tenant fallback.
const tenant = {
  businessId: { type: Schema.Types.ObjectId, required: true },
};
const employee = {
  employeeId: {
    type: Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
};
// Each branch runs its own payroll. The policy, salary structures and audit log are shared by the business,
// so an employee moved to another branch keeps their salary history.
const BRANCH_SCOPED = new Set([
  "PayrollRun",
  "PayrollDayClaim",
  "PayrollPayment",
  "PayrollRequest",
  "PayrollLoan",
  "PayrollLoanMovement",
  "PayrollCommission",
]);
const money = { type: Number, required: true, validate: Number.isSafeInteger };
const model = (
  name: string,
  fields: Record<string, unknown>,
  indexes: Array<[Record<string, 1 | -1>, Record<string, unknown>]> = [],
) => {
  const schema = new Schema<Record<string, any>>(
    { ...tenant, ...fields },
    { timestamps: true },
  );
  for (const [keys, options] of indexes) schema.index(keys, options);
  if (
    !indexes.some(
      ([keys]) => Object.keys(keys).length === 1 && keys.businessId === 1,
    )
  )
    schema.index({ businessId: 1 });
  if ("employeeId" in fields) schema.index({ businessId: 1, employeeId: 1 });
  if (BRANCH_SCOPED.has(name)) schema.plugin(branchScopedPlugin);
  return mongoose.model<Record<string, any>>(name, schema);
};

export const PayrollPolicy = model(
  "PayrollPolicy",
  {
    enabled: { type: Boolean, default: false },
    confirmed: { type: Boolean, default: false },
    transitionLock: { type: Number, default: 0, select: false },
    currency: { type: String, default: "PKR" },
    timeZone: { type: String, default: "Asia/Karachi" },
    overtimeMultiplier: { type: Number, default: 1 },
    commissionsEnabled: { type: Boolean, default: false },
    dailyPaidNonWork: { type: Boolean, default: false },
    hourlyPaidNonWork: { type: Boolean, default: false },
    allowZeroPay: { type: Boolean, default: false },
    latePenaltyMinor: { type: Number, default: 0 },
    earlyPenaltyMinor: { type: Number, default: 0 },
    holidays: { type: [String], default: [] },
    leaveRules: {
      type: Schema.Types.Mixed,
      default: () => ({
        casual: { paid: true, annualDays: 0, openingDays: 0, carryLimit: 0 },
        sick: { paid: true, annualDays: 0, openingDays: 0, carryLimit: 0 },
        annual: { paid: true, annualDays: 0, openingDays: 0, carryLimit: 0 },
        unpaid: { paid: false, annualDays: 0 },
        other: { paid: false, annualDays: 0 },
      }),
    },
  },
  [[{ businessId: 1 }, { unique: true }]],
);

export const SalaryStructure = model(
  "SalaryStructure",
  {
    ...employee,
    effectiveDate: { type: String, required: true },
    baseMinor: money,
    salaryType: {
      type: String,
      enum: ["monthly", "daily", "hourly"],
      required: true,
    },
    components: { type: [Schema.Types.Mixed], default: [] },
    commissionPercent: { type: Number, default: 0 },
    schedule: { type: Schema.Types.Mixed, required: true },
    leavePolicyName: { type: String, default: "Business default" },
    leaveRules: { type: Schema.Types.Mixed, default: () => ({}) },
    reason: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  [[{ businessId: 1, employeeId: 1, effectiveDate: 1 }, { unique: true }]],
);

export const PayrollRequest = model("PayrollRequest", {
  key: String,
  ...employee,
  kind: {
    type: String,
    enum: ["leave", "overtime", "loan", "advance", "attendance"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "cancelled"],
    default: "pending",
  },
  data: { type: Schema.Types.Mixed, required: true },
  reason: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, required: true },
  decidedBy: Schema.Types.ObjectId,
  decisionReason: String,
  decidedAt: Date,
}, [[{ businessId: 1, key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } }]]);
export const PayrollLoan = model(
  "PayrollLoan",
  {
    journalEntryId: Schema.Types.ObjectId,
    ...employee,
    requestId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ["loan", "advance"], required: true },
    principalMinor: money,
    installmentMinor: money,
    balanceMinor: { ...money, min: 0 },
    startMonth: { type: String, required: true },
    status: {
      type: String,
      enum: ["approved", "disbursed", "settled", "cancelled"],
      default: "approved",
    },
  },
  [[{ businessId: 1, requestId: 1 }, { unique: true }]],
);
export const PayrollLoanMovement = model(
  "PayrollLoanMovement",
  {
    ...employee,
    loanId: { type: Schema.Types.ObjectId, required: true },
    kind: {
      type: String,
      enum: ["disbursement", "recovery", "repayment", "cancellation"],
      required: true,
    },
    amountMinor: money,
    runId: Schema.Types.ObjectId,
    key: { type: String, required: true },
    reference: String,
    reason: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    actorName: String,
  },
  [[{ businessId: 1, key: 1 }, { unique: true }]],
);
export const PayrollCommission = model(
  "PayrollCommission",
  {
    ...employee,
    saleId: { type: String, required: true },
    dateKey: { type: String, required: true },
    key: { type: String, required: true },
    eligibleMinor: money,
    amountMinor: money,
    percent: Number,
    reversalOf: Schema.Types.ObjectId,
    runId: { type: Schema.Types.ObjectId, default: null },
    reversed: { type: Boolean, default: false },
  },
  [[{ businessId: 1, key: 1 }, { unique: true }]],
);

export const PayrollRun = model(
  "PayrollRun",
  {
    month: { type: String, required: true },
    kind: {
      type: String,
      enum: ["regular", "adjustment", "final"],
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "calculated", "submitted", "approved"],
      default: "draft",
    },
    employeeIds: { type: [Schema.Types.ObjectId], default: [] },
    parentRunId: Schema.Types.ObjectId,
    reason: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    preparedBy: { type: Schema.Types.ObjectId, required: true },
    approvedBy: Schema.Types.ObjectId,
    approvedAt: Date,
    submittedAt: Date,
    version: { type: Number, default: 0 },
    policy: Schema.Types.Mixed,
    sourceHash: String,
    journalEntryId: Schema.Types.ObjectId,
    accountingOrigin: String,
    adjustments: { type: [Schema.Types.Mixed], default: [] },
    items: { type: [Schema.Types.Mixed], default: [] },
    totals: Schema.Types.Mixed,
  },
  [
    [
      { businessId: 1, branchId: 1, month: 1, kind: 1 },
      { unique: true, partialFilterExpression: { kind: "regular" } },
    ],
  ],
);
// A unique daily claim prevents overlap between regular and final settlement base pay.
export const PayrollDayClaim = model(
  "PayrollDayClaim",
  {
    ...employee,
    dateKey: { type: String, required: true },
    runId: { type: Schema.Types.ObjectId, required: true },
  },
  [[{ businessId: 1, employeeId: 1, dateKey: 1 }, { unique: true }]],
);
export const PayrollPayment = model(
  "PayrollPayment",
  {
    ...employee,
    runId: { type: Schema.Types.ObjectId, required: true },
    amountMinor: { ...money, min: 1 },
    dateKey: { type: String, required: true },
    method: { type: String, enum: ["cash", "bank"], required: true },
    reference: { type: String, required: true },
    key: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    reversedAt: Date,
    reversedBy: Schema.Types.ObjectId,
    reversalReason: String,
  },
  [[{ businessId: 1, key: 1 }, { unique: true }]],
);
export const PayrollAudit = model("PayrollAudit", {
  actorId: { type: Schema.Types.ObjectId, required: true },
  actorName: String,
  reasonProvided: Boolean,
  action: { type: String, required: true },
  targetId: String,
  reason: { type: String, required: true },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
});

export const payrollModels = [
  PayrollPolicy,
  SalaryStructure,
  PayrollRequest,
  PayrollLoan,
  PayrollLoanMovement,
  PayrollCommission,
  PayrollRun,
  PayrollDayClaim,
  PayrollPayment,
  PayrollAudit,
];
