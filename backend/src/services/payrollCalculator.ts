export interface Component {
  name: string;
  kind: "allowance" | "deduction" | "employer";
  mode: "fixed" | "percent";
  value: number;
  prorate: boolean;
}
export interface Schedule {
  workingDays: number[];
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
}
export interface Structure {
  _id?: unknown;
  effectiveDate: string;
  baseMinor: number;
  salaryType: "monthly" | "daily" | "hourly";
  components: Component[];
  commissionPercent: number;
  schedule: Schedule;
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
}
export const defaultSchedule: Schedule = {
  workingDays: [1, 2, 3, 4, 5, 6],
  startTime: "09:00",
  endTime: "17:00",
  breakMinutes: 0,
  graceMinutes: 0,
};
export const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export const dateKeys = (from: string, to: string) => {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new Error("Invalid date range");
  const result: string[] = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= to;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    if (result.length > 366) throw new Error("Date range is too long");
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
};
export const monthRange = (month: string) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Invalid payroll month");
  const [year, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`,
  };
};
// Exact base-10 parsing and rational rounding; no binary float arithmetic for money.
export const scaled = (value: number | string, digits = 2): bigint => {
  const s = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error("Invalid decimal amount");
  const negative = s.startsWith("-");
  const [whole, fraction = ""] = s.replace("-", "").split(".");
  const padded = fraction.padEnd(digits + 1, "0");
  const amount =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(padded.slice(0, digits) || "0") +
    (Number(padded[digits]) >= 5 ? 1n : 0n);
  return negative ? -amount : amount;
};
export const ratio = (numerator: bigint, denominator: bigint) => {
  if (denominator <= 0n) throw new Error("Invalid payroll divisor");
  const sign = numerator < 0n ? -1n : 1n;
  const n = numerator * sign;
  const result = Number(sign * ((n + denominator / 2n) / denominator));
  if (!Number.isSafeInteger(result))
    throw new Error("Payroll amount exceeds safe range");
  return result;
};
export const minor = (value: number | string) => ratio(scaled(value), 1n);
export const percentOf = (amount: number, percent: number) =>
  ratio(BigInt(amount) * scaled(percent, 4), 1_000_000n);
export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export const scheduleMinutes = (s: Schedule) =>
  Math.max(
    0,
    ((minutesOf(s.endTime) - minutesOf(s.startTime) + 1440) % 1440) -
      s.breakMinutes,
  );
export const structureOn = (structures: Structure[], day: string) =>
  structures
    .filter((s) => s.effectiveDate <= day)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];

export interface Input {
  employee: {
    _id: unknown;
    fullName: string;
    employeeCode: string;
    designation: string;
    joiningDate: string;
    employmentEndDate?: string;
    department?: string;
  };
  month: string;
  structures: Structure[];
  policy: {
    timeZone: string;
    holidays: string[];
    overtimeMultiplier: number;
    dailyPaidNonWork: boolean;
    hourlyPaidNonWork: boolean;
    latePenaltyMinor: number;
    earlyPenaltyMinor: number;
    leaveRules: Record<string, { paid: boolean }>;
  };
  records: Array<{
    _id: unknown;
    dateKey: string;
    checkIn?: Date | string;
    checkOut?: Date | string;
  }>;
  leaves: Array<{
    _id: unknown;
    startDate: string;
    endDate: string;
    leaveType: string;
    fraction?: number;
  }>;
  requests: Array<{
    _id: unknown;
    kind: string;
    data: { dateKey?: string; minutes?: number };
  }>;
  commissions: Array<{ _id: unknown; amountMinor: number }>;
  loans: Array<{
    _id: unknown;
    balanceMinor: number;
    installmentMinor: number;
  }>;
  adjustments: Array<{
    kind: string;
    amountMinor: number;
    reason: string;
    loanId?: string;
  }>;
  claimedDays?: string[];
}
export function calculateEmployee(input: Input) {
  const { employee: e, policy: p } = input;
  const range = monthRange(input.month);
  const days = dateKeys(range.from, range.to);
  const lines: Array<{
    name: string;
    kind: string;
    amountMinor: number;
    quantity?: number;
    rate?: number;
    formula: string;
    sourceIds: string[];
    loanId?: string;
  }> = [];
  const exceptions: string[] = [];
  const details: Array<Record<string, unknown>> = [];
  const payableDates: string[] = [];
  const groups = new Map<
    Structure,
    {
      base: bigint;
      denominator: bigint;
      employed: number;
      days: number;
      payableFraction: number;
      regularMinutes: number;
      overtime: number;
      scheduled: number;
    }
  >();
  let penalty = 0;
  const localMinute = (value: Date | string, day: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: p.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const date = `${parts.find((x) => x.type === "year")?.value}-${parts.find((x) => x.type === "month")?.value}-${parts.find((x) => x.type === "day")?.value}`;
    return (
      (+new Date(`${date}T00:00Z`) - +new Date(`${day}T00:00Z`)) / 60000 +
      Number(parts.find((x) => x.type === "hour")?.value) * 60 +
      Number(parts.find((x) => x.type === "minute")?.value)
    );
  };
  for (const day of days) {
    if (
      !e.joiningDate ||
      day < e.joiningDate ||
      (e.employmentEndDate && day > e.employmentEndDate) ||
      input.claimedDays?.includes(day)
    )
      continue;
    const s = structureOn(input.structures, day);
    if (!s) {
      exceptions.push(`${day}: no effective salary structure`);
      continue;
    }
    const schedule = s.schedule;
    const expected = scheduleMinutes(schedule);
    const off =
      !schedule.workingDays.includes(new Date(`${day}T00:00Z`).getUTCDay()) ||
      p.holidays.includes(day);
    const record = input.records.find((r) => r.dateKey === day);
    const leave = input.leaves.find(
      (l) => l.startDate <= day && l.endDate >= day,
    );
    const half = leave?.fraction ?? 1;
    const paidLeave =
      !!leave &&
      !!(s.leaveRules?.[leave.leaveType] || p.leaveRules[leave.leaveType])
        ?.paid;
    const review = input.requests.find(
      (r) => r.kind === "attendance" && r.data.dateKey === day,
    );
    if (record?.checkIn && !record.checkOut && !review)
      exceptions.push(`${day}: missing check-out`);
    if (record?.checkOut && !record.checkIn && !review)
      exceptions.push(`${day}: missing check-in`);
    if (
      record?.checkIn &&
      record.checkOut &&
      new Date(record.checkOut) <= new Date(record.checkIn)
    )
      exceptions.push(`${day}: invalid punches`);
    if (leave && record?.checkIn && half === 1 && !review)
      exceptions.push(`${day}: leave/punch conflict`);
    const worked =
      record?.checkIn && record.checkOut
        ? Math.max(
            0,
            Math.floor(
              (+new Date(record.checkOut) - +new Date(record.checkIn)) / 60000,
            ) - schedule.breakMinutes,
          )
        : 0;
    const approvedOT = input.requests
      .filter((r) => r.kind === "overtime" && r.data.dateKey === day)
      .reduce((n, r) => n + (r.data.minutes || 0), 0);
    if (approvedOT > Math.max(0, worked - (off ? 0 : expected)))
      exceptions.push(`${day}: overtime exceeds worked extra minutes`);
    const overtime = Math.min(approvedOT, worked);
    const regular = Math.min(expected, Math.max(0, worked - overtime));
    const present = Boolean(record?.checkIn && record?.checkOut);
    const monthlyUnits = off
      ? 1
      : leave
        ? (paidLeave ? half : 0) + (present && half < 1 ? 1 - half : 0)
        : present
          ? 1
          : 0;
    const dailyUnits = off
      ? p.dailyPaidNonWork
        ? 1
        : present && worked > overtime
          ? 1
          : 0
      : leave
        ? (paidLeave && p.dailyPaidNonWork ? half : 0) +
          (present ? 1 - half : 0)
        : present
          ? 1
          : 0;
    const paidNonWork = p.hourlyPaidNonWork
      ? off
        ? !present
          ? expected
          : 0
        : paidLeave
          ? expected * half
          : 0
      : 0;
    const hourly = Math.min(expected, regular + paidNonWork);
    let group = groups.get(s);
    if (!group) {
      group = {
        base: 0n,
        denominator:
          s.salaryType === "monthly"
            ? BigInt(days.length * 2)
            : s.salaryType === "daily"
              ? 2n
              : 60n,
        employed: 0,
        days: 0,
        payableFraction: 0,
        regularMinutes: 0,
        overtime: 0,
        scheduled: 0,
      };
      groups.set(s, group);
    }
    const units =
      s.salaryType === "monthly"
        ? monthlyUnits * 2
        : s.salaryType === "daily"
          ? dailyUnits * 2
          : hourly;
    group.base += BigInt(s.baseMinor) * BigInt(Math.round(units));
    group.employed++;
    group.days += dailyUnits;
    group.payableFraction +=
      s.salaryType === "monthly"
        ? monthlyUnits
        : s.salaryType === "daily"
          ? dailyUnits
          : hourly / expected;
    group.regularMinutes += hourly;
    group.overtime += overtime;
    if (!off) group.scheduled += expected;
    if (!off && present) {
      const late =
        localMinute(record!.checkIn!, day) >
        minutesOf(schedule.startTime) + schedule.graceMinutes;
      const early =
        localMinute(record!.checkOut!, day) <
        minutesOf(schedule.endTime) +
          (minutesOf(schedule.endTime) <= minutesOf(schedule.startTime)
            ? 1440
            : 0) -
          schedule.graceMinutes;
      penalty +=
        (late ? p.latePenaltyMinor : 0) + (early ? p.earlyPenaltyMinor : 0);
    }
    payableDates.push(day);
    details.push({
      date: day,
      status: off
        ? "off"
        : leave
          ? leave.leaveType
          : present
            ? "present"
            : "absent",
      workedMinutes: worked,
      regularMinutes: hourly,
      overtimeMinutes: overtime,
      payableUnits: s.salaryType === "monthly" ? monthlyUnits : dailyUnits,
      salaryId: String(s._id),
      recordId: record ? String(record._id) : null,
      leaveId: leave ? String(leave._id) : null,
    });
  }
  for (const [s, g] of groups) {
    const base = ratio(g.base, g.denominator);
    lines.push({
      name: `Base (${s.effectiveDate})`,
      kind: "base",
      amountMinor: base,
      quantity:
        s.salaryType === "hourly"
          ? g.regularMinutes / 60
          : s.salaryType === "daily"
            ? g.days
            : g.employed,
      rate: s.baseMinor,
      formula: `${g.base}/${g.denominator} rounded to minor units`,
      sourceIds: [String(s._id)],
    });
    if (g.overtime) {
      const fullScheduled =
        days.filter(
          (d) =>
            s.schedule.workingDays.includes(
              new Date(`${d}T00:00Z`).getUTCDay(),
            ) && !p.holidays.includes(d),
        ).length * scheduleMinutes(s.schedule);
      const denominator =
        s.salaryType === "monthly"
          ? fullScheduled
          : s.salaryType === "daily"
            ? scheduleMinutes(s.schedule)
            : 60;
      if (!denominator) exceptions.push("No scheduled minutes for overtime");
      else
        lines.push({
          name: "Overtime",
          kind: "overtime",
          amountMinor: ratio(
            BigInt(s.baseMinor) *
              BigInt(g.overtime) *
              scaled(p.overtimeMultiplier, 4),
            BigInt(denominator) * 10000n,
          ),
          quantity: g.overtime,
          formula:
            "base rate × approved overtime minutes × multiplier / scheduled minutes",
          sourceIds: input.requests
            .filter((r) => r.kind === "overtime")
            .map((r) => String(r._id)),
        });
    }
    for (const c of s.components) {
      let amount =
        c.mode === "percent" ? percentOf(base, c.value) : minor(c.value);
      if (c.mode === "fixed")
        amount = ratio(
          BigInt(amount) *
            BigInt(
              c.prorate
                ? Math.round(g.payableFraction * 1_000_000)
                : g.employed * 1_000_000,
            ),
          BigInt(days.length * 1_000_000),
        );
      lines.push({
        name: c.name,
        kind: c.kind,
        amountMinor: amount,
        formula:
          c.mode === "percent"
            ? `${c.value}% of earned base`
            : `fixed ${c.value}, allocated by effective segment${c.prorate ? " and payable days" : ""}`,
        sourceIds: [String(s._id)],
      });
    }
  }
  if (penalty)
    lines.push({
      name: "Late/early penalties",
      kind: "deduction",
      amountMinor: penalty,
      formula: "configured penalty per reviewed working day",
      sourceIds: [],
    });
  for (const c of input.commissions)
    lines.push({
      name: "Sales commission",
      kind: "commission",
      amountMinor: c.amountMinor,
      formula: "net sale after discount × effective commission rate",
      sourceIds: [String(c._id)],
    });
  for (const loan of input.loans) {
    const override = input.adjustments.find(
      (a) => a.kind === "recovery" && a.loanId === String(loan._id),
    );
    const amount = override
      ? override.amountMinor
      : Math.min(loan.installmentMinor, loan.balanceMinor);
    if (amount < 0 || amount > loan.balanceMinor)
      exceptions.push("Invalid loan recovery override");
    lines.push({
      name: "Loan/advance recovery",
      kind: "recovery",
      amountMinor: amount,
      loanId: String(loan._id),
      formula: override
        ? override.reason
        : "scheduled installment capped at outstanding balance",
      sourceIds: [String(loan._id)],
    });
  }
  for (const a of input.adjustments.filter((a) => a.kind !== "recovery"))
    lines.push({
      name: a.reason,
      kind: a.kind,
      amountMinor: a.amountMinor,
      formula: "approved run adjustment",
      sourceIds: [],
    });
  const sum = (kinds: string[]) =>
    lines
      .filter((l) => kinds.includes(l.kind))
      .reduce((n, l) => n + l.amountMinor, 0);
  const grossMinor = sum([
    "base",
    "allowance",
    "overtime",
    "bonus",
    "commission",
    "reimbursement",
    "benefit",
    "encashment",
  ]);
  const deductionsMinor = sum(["deduction", "recovery"]);
  const netMinor = grossMinor - deductionsMinor;
  if (netMinor < 0)
    exceptions.push("Net pay is negative; revise deductions/recoveries");
  if (!e.joiningDate) exceptions.push("Joining date is required");
  return {
    employeeId: String(e._id),
    employeeName: e.fullName,
    employeeCode: e.employeeCode,
    department: e.department || "",
    designation: e.designation,
    lines,
    days: details,
    payableDates,
    exceptions,
    grossMinor,
    deductionsMinor,
    netMinor,
    employerCostMinor: grossMinor + sum(["employer"]),
  };
}
