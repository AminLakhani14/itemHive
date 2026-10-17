import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateEmployee,
  dateKeys,
  defaultSchedule,
  minor,
  monthRange,
  percentOf,
  type Input,
  type Structure,
} from "./payrollCalculator";

function fixture(
  month = "2026-09",
  salaryType: Structure["salaryType"] = "monthly",
): Input {
  const range = monthRange(month);
  const schedule = { ...defaultSchedule, workingDays: [0, 1, 2, 3, 4, 5, 6] };
  return {
    employee: {
      _id: "employee1",
      fullName: "Test Employee",
      employeeCode: "EMP-1",
      designation: "Sales",
      joiningDate: range.from,
    },
    month,
    structures: [
      {
        _id: "salary1",
        effectiveDate: range.from,
        baseMinor: 300000,
        salaryType,
        commissionPercent: 5,
        schedule,
        components: [],
      },
    ],
    policy: {
      timeZone: "UTC",
      holidays: [],
      overtimeMultiplier: 1,
      dailyPaidNonWork: false,
      hourlyPaidNonWork: false,
      latePenaltyMinor: 0,
      earlyPenaltyMinor: 0,
      leaveRules: { casual: { paid: true }, unpaid: { paid: false } },
    },
    records: dateKeys(range.from, range.to).map((dateKey) => ({
      _id: dateKey,
      dateKey,
      checkIn: `${dateKey}T09:00:00Z`,
      checkOut: `${dateKey}T17:00:00Z`,
    })),
    leaves: [],
    requests: [],
    commissions: [],
    loans: [],
    adjustments: [],
  };
}
test("decimal currency uses exact half-up rounding and safe bounds", () => {
  assert.equal(minor("1.005"), 101);
  assert.equal(minor("0.29"), 29);
  assert.equal(minor("-1.005"), -101);
  assert.equal(percentOf(1999, 2.5), 50);
  assert.throws(() => minor("1e20"));
});
test("paid hourly half-day leave combines with half-day work", () => {
  const f = fixture("2026-09", "hourly");
  f.policy.hourlyPaidNonWork = true;
  f.structures[0].schedule.breakMinutes = 0;
  f.records[0].checkOut = "2026-09-01T13:00:00Z";
  f.leaves = [
    {
      _id: "half",
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      leaveType: "casual",
      fraction: 0.5,
    },
  ];
  assert.equal(calculateEmployee(f).days[0].regularMinutes, 480);
});
test("effective employee leave policy overrides business paid defaults", () => {
  const f = fixture();
  f.records = f.records.filter((r) => r.dateKey !== "2026-09-01");
  f.leaves = [
    {
      _id: "leave",
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      leaveType: "casual",
    },
  ];
  f.structures[0].leaveRules = {
    casual: { paid: false, annualDays: 0, openingDays: 0, carryLimit: 0 },
  };
  assert.equal(calculateEmployee(f).netMinor, 290000);
});
test("fixed allowance proration works independently of zero base and uses hourly payable fractions", () => {
  const monthly = fixture();
  monthly.structures[0].baseMinor = 0;
  monthly.structures[0].components = [
    {
      name: "Allowance",
      kind: "allowance",
      mode: "fixed",
      value: 300,
      prorate: true,
    },
  ];
  assert.equal(calculateEmployee(monthly).grossMinor, 30000);
  const hourly = fixture("2026-09", "hourly");
  hourly.structures[0].components = monthly.structures[0].components;
  hourly.structures[0].schedule.breakMinutes = 0;
  hourly.records = hourly.records.map((r) => ({
    ...r,
    checkOut: `${r.dateKey}T13:00:00Z`,
  }));
  assert.equal(
    calculateEmployee(hourly).lines.find((l) => l.kind === "allowance")!
      .amountMinor,
    15000,
  );
});
test("overnight penalties compare dates as well as local clock time", () => {
  const f = fixture();
  f.structures[0].schedule = {
    ...f.structures[0].schedule,
    startTime: "22:00",
    endTime: "06:00",
    breakMinutes: 0,
  };
  f.records = f.records.map((r) => ({
    ...r,
    checkIn: `${r.dateKey}T22:00:00Z`,
    checkOut: `${dateKeys(r.dateKey, "2026-10-01")[1]}T06:00:00Z`,
  }));
  f.records[0].checkIn = "2026-09-02T00:00:00Z";
  f.policy.latePenaltyMinor = 100;
  f.policy.earlyPenaltyMinor = 200;
  assert.equal(calculateEmployee(f).deductionsMinor, 100);
});
for (const month of ["2024-02", "2026-02", "2026-04", "2026-09", "2026-12"])
  test(`${month}: full monthly salary equals base, irrespective of month length`, () => {
    const result = calculateEmployee(fixture(month));
    assert.equal(result.netMinor, 300000);
    assert.deepEqual(result.exceptions, []);
  });
test("joining and leaving days are included using actual calendar denominator", () => {
  const f = fixture();
  f.employee.joiningDate = "2026-09-11";
  f.employee.employmentEndDate = "2026-09-20";
  const r = calculateEmployee(f);
  assert.equal(r.netMinor, 100000);
  assert.equal(r.payableDates.length, 10);
});
test("effective salary changes split the calendar-month salary", () => {
  const f = fixture();
  f.structures.push({
    ...f.structures[0],
    _id: "salary2",
    effectiveDate: "2026-09-16",
    baseMinor: 600000,
  });
  const r = calculateEmployee(f);
  assert.equal(r.netMinor, 450000);
  assert.equal(r.lines.filter((l) => l.kind === "base").length, 2);
});
test("paid leave, unpaid leave and absence have distinct monetary outcomes", () => {
  const f = fixture();
  f.records = f.records.filter(
    (r) => !["2026-09-01", "2026-09-02", "2026-09-03"].includes(r.dateKey),
  );
  f.leaves = [
    {
      _id: "paid",
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      leaveType: "casual",
    },
    {
      _id: "unpaid",
      startDate: "2026-09-02",
      endDate: "2026-09-02",
      leaveType: "unpaid",
    },
  ];
  assert.equal(calculateEmployee(f).netMinor, 280000);
});
test("half unpaid leave with half attendance deducts only half the monthly day", () => {
  const f = fixture();
  f.leaves = [
    {
      _id: "half",
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      leaveType: "unpaid",
      fraction: 0.5,
    },
  ];
  f.records[0].checkOut = "2026-09-01T13:00:00Z";
  assert.equal(calculateEmployee(f).netMinor, 295000);
});
test("weekly off and holiday days stay paid for monthly employees without punches", () => {
  const f = fixture();
  f.structures[0].schedule.workingDays = [1, 2, 3, 4, 5];
  f.policy.holidays = ["2026-09-01"];
  f.records = f.records.filter(
    (r) =>
      f.structures[0].schedule.workingDays.includes(
        new Date(r.dateKey).getUTCDay(),
      ) && r.dateKey !== "2026-09-01",
  );
  assert.equal(calculateEmployee(f).netMinor, 300000);
});
test("daily staff earn only payable days, with half-day support and optional paid non-work", () => {
  const f = fixture("2026-09", "daily");
  f.structures[0].baseMinor = 10000;
  f.records = f.records.slice(0, 2);
  f.leaves = [
    {
      _id: "paid",
      startDate: "2026-09-03",
      endDate: "2026-09-03",
      leaveType: "casual",
    },
  ];
  assert.equal(calculateEmployee(f).netMinor, 20000);
  f.policy.dailyPaidNonWork = true;
  assert.equal(calculateEmployee(f).netMinor, 30000);
});
test("hourly staff subtract unpaid breaks and never earn unapproved extra hours", () => {
  const f = fixture("2026-09", "hourly");
  f.structures[0].baseMinor = 10000;
  f.structures[0].schedule.breakMinutes = 60;
  f.records = f.records.slice(0, 1);
  f.records[0].checkOut = "2026-09-01T19:00:00Z";
  assert.equal(calculateEmployee(f).netMinor, 70000);
  f.requests = [
    {
      _id: "ot",
      kind: "overtime",
      data: { dateKey: "2026-09-01", minutes: 120 },
    },
  ];
  f.policy.overtimeMultiplier = 1.5;
  assert.equal(calculateEmployee(f).netMinor, 100000);
});
test("overnight punches count on start date with actual elapsed minutes", () => {
  const f = fixture("2026-09", "hourly");
  f.structures[0].baseMinor = 10000;
  f.structures[0].schedule = {
    ...f.structures[0].schedule,
    startTime: "22:00",
    endTime: "06:00",
  };
  f.records = [
    {
      _id: "night",
      dateKey: "2026-09-01",
      checkIn: "2026-09-01T22:00Z",
      checkOut: "2026-09-02T06:00Z",
    },
  ];
  assert.equal(calculateEmployee(f).netMinor, 80000);
});
test("missing punches, overlapping full leave and excessive overtime block submission", () => {
  const f = fixture();
  f.records[0].checkOut = undefined;
  assert.ok(
    calculateEmployee(f).exceptions.some((e) =>
      e.includes("missing check-out"),
    ),
  );
  f.records[0].checkOut = "2026-09-01T17:00Z";
  f.leaves = [
    {
      _id: "l",
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      leaveType: "casual",
    },
  ];
  assert.ok(
    calculateEmployee(f).exceptions.some((e) =>
      e.includes("leave/punch conflict"),
    ),
  );
  f.leaves = [];
  f.requests = [
    {
      _id: "ot",
      kind: "overtime",
      data: { dateKey: "2026-09-01", minutes: 60 },
    },
  ];
  assert.ok(
    calculateEmployee(f).exceptions.some((e) => e.includes("overtime exceeds")),
  );
});
test("gross, deductions, net and employer cost reconcile with commission and loan recovery", () => {
  const f = fixture();
  f.structures[0].components = [
    {
      name: "Allowance",
      kind: "allowance",
      mode: "percent",
      value: 10,
      prorate: true,
    },
    {
      name: "Employer fund",
      kind: "employer",
      mode: "percent",
      value: 5,
      prorate: true,
    },
    {
      name: "Deduction",
      kind: "deduction",
      mode: "fixed",
      value: 100,
      prorate: false,
    },
  ];
  f.commissions = [
    { _id: "sale1", amountMinor: 5000 },
    { _id: "reversal", amountMinor: -1000 },
  ];
  f.loans = [{ _id: "loan1", balanceMinor: 20000, installmentMinor: 10000 }];
  const r = calculateEmployee(f);
  assert.equal(r.grossMinor, 334000);
  assert.equal(r.deductionsMinor, 20000);
  assert.equal(r.netMinor, 314000);
  assert.equal(r.employerCostMinor, 349000);
});
test("negative net and excessive recovery overrides are reported as exceptions", () => {
  const f = fixture();
  f.loans = [{ _id: "loan1", balanceMinor: 900000, installmentMinor: 900000 }];
  assert.ok(
    calculateEmployee(f).exceptions.some((e) => e.includes("negative")),
  );
  f.adjustments = [
    {
      kind: "recovery",
      loanId: "loan1",
      amountMinor: 1000000,
      reason: "override",
    },
  ];
  assert.ok(
    calculateEmployee(f).exceptions.some((e) => e.includes("Invalid loan")),
  );
});
test("prior approved dates cannot be paid again by a final run", () => {
  const f = fixture();
  f.claimedDays = dateKeys("2026-09-01", "2026-09-20");
  const r = calculateEmployee(f);
  assert.equal(r.netMinor, 100000);
  assert.equal(r.payableDates.length, 10);
});
test("adjustment-only run has no base pay or daily claims", () => {
  const f = fixture();
  f.claimedDays = dateKeys("2026-09-01", "2026-09-30");
  f.adjustments = [
    { kind: "bonus", amountMinor: 10000, reason: "Historical correction" },
  ];
  assert.equal(calculateEmployee(f).netMinor, 10000);
  assert.deepEqual(calculateEmployee(f).payableDates, []);
});
test("invalid dates and unsafe month ranges are rejected", () => {
  assert.throws(() => dateKeys("2026-02-30", "2026-03-01"));
  assert.throws(() => monthRange("2026-13"));
});
