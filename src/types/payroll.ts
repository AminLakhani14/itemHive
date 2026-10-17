export interface PayrollEmployee {
  _id: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  department: string;
  joiningDate: string;
  employmentEndDate: string;
  status: string;
  payrollEnrolled: boolean;
  paymentMethod: "cash" | "bank";
  bankName: string;
  bankAccount: string;
}
export interface PayrollComponent {
  name: string;
  kind: "allowance" | "deduction" | "employer";
  mode: "fixed" | "percent";
  value: number;
  prorate: boolean;
}
export interface PayrollSchedule {
  workingDays: number[];
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
}
export interface SalaryStructure {
  _id: string;
  effectiveDate: string;
  baseMinor: number;
  salaryType: "monthly" | "daily" | "hourly";
  commissionPercent: number;
  components: PayrollComponent[];
  schedule: PayrollSchedule;
  leavePolicyName?: string;
  leaveRules?: Record<
    string,
    {
      paid: boolean;
      annualDays: number;
      openingDays: number;
      carryLimit: number;
    }
  >;
  reason: string;
}
export interface PayrollProfile {
  profile: Pick<
    PayrollEmployee,
    | "_id"
    | "fullName"
    | "payrollEnrolled"
    | "department"
    | "employmentEndDate"
    | "paymentMethod"
    | "bankName"
    | "bankAccount"
  >;
  structures: SalaryStructure[];
  balances: Record<string, number>;
}
export interface PayrollPolicy {
  enabled: boolean;
  confirmed: boolean;
  currency: string;
  timeZone: string;
  overtimeMultiplier: number;
  commissionsEnabled: boolean;
  dailyPaidNonWork: boolean;
  hourlyPaidNonWork: boolean;
  allowZeroPay: boolean;
  latePenaltyMinor: number;
  earlyPenaltyMinor: number;
  holidays: string[];
  leaveRules: Record<
    string,
    {
      paid: boolean;
      annualDays: number;
      openingDays: number;
      carryLimit: number;
    }
  >;
}
export interface PayrollLine {
  name: string;
  kind: string;
  amountMinor: number;
  quantity?: number;
  rate?: number;
  formula: string;
  sourceIds: string[];
  loanId?: string;
}
export interface PayrollItem {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  lines: PayrollLine[];
  days: Array<{
    date: string;
    status: string;
    workedMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    payableUnits: number;
  }>;
  payableDates: string[];
  exceptions: string[];
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
  employerCostMinor: number;
  paidMinor?: number;
  outstandingMinor?: number;
  paymentStatus?: string;
  runId?: string;
  month?: string;
  currency?: string;
  kind?: string;
}
export interface PayrollRun {
  _id: string;
  month: string;
  kind: "regular" | "adjustment" | "final";
  status: "draft" | "calculated" | "submitted" | "approved";
  version: number;
  reason: string;
  employeeIds: string[];
  preparedBy: string;
  createdBy: string;
  approvedBy?: string;
  policy?: PayrollPolicy;
  items: PayrollItem[];
  adjustments: Array<{
    employeeId: string;
    kind: string;
    amountMinor: number;
    reason: string;
    loanId?: string;
  }>;
  totals?: {
    grossMinor: number;
    deductionsMinor: number;
    netMinor: number;
    employerCostMinor: number;
  };
}
export interface PayrollRequest {
  _id: string;
  employeeId: string;
  kind: string;
  status: string;
  reason: string;
  decisionReason?: string;
  data: {
    startDate?: string;
    endDate?: string;
    leaveType?: string;
    fraction?: number;
    dateKey?: string;
    minutes?: number;
    amount?: number;
    installment?: number;
    startMonth?: string;
  };
  createdAt: string;
}
export interface PayrollLoan {
  _id: string;
  employeeId: string;
  kind: string;
  principalMinor: number;
  balanceMinor: number;
  installmentMinor: number;
  status: string;
  startMonth: string;
}
export interface PayrollPayment {
  _id: string;
  runId: string;
  employeeId: string;
  amountMinor: number;
  dateKey: string;
  method: string;
  reference: string;
  key: string;
  reversedAt?: string;
  reversalReason?: string;
}
export interface PayrollMovement {
  _id: string;
  loanId: string;
  employeeId: string;
  kind: string;
  amountMinor: number;
  reason: string;
  createdAt: string;
}
export interface PayrollCommission {
  _id: string;
  employeeId: string;
  saleId: string;
  dateKey: string;
  eligibleMinor: number;
  amountMinor: number;
  percent: number;
  runId?: string;
  reversed: boolean;
}
export interface PayrollAudit {
  _id: string;
  actorId: string;
  action: string;
  targetId: string;
  reason: string;
  createdAt: string;
}
export interface PayrollReport {
  rows: PayrollItem[];
  payments: PayrollPayment[];
  commissions: PayrollCommission[];
  loans: PayrollLoan[];
  movements: PayrollMovement[];
  audit: PayrollAudit[];
  balances: Array<{
    employeeId: string;
    employeeName: string;
    balances: Record<string, number>;
  }>;
}
export interface MyPayroll {
  currency: string;
  employee: { _id: string; fullName: string; employeeCode: string };
  payslips: PayrollItem[];
  payments: PayrollPayment[];
  requests: PayrollRequest[];
  loans: PayrollLoan[];
  balances: Record<string, number>;
}
