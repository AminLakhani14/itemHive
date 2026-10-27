import type { PayrollEmployee, PayrollPayment, PayrollRun } from '../types/payroll';

export function validMoneyAmount(value: string | number, maximum = 1_000_000_000) {
  return /^\d+(\.\d{1,2})?$/.test(String(value)) && Number(value) > 0 && Number(value) <= maximum;
}

// Run lists contain the approved snapshot; current payments are a separate feed.
export function runOutstanding(run: PayrollRun, payments: PayrollPayment[]) {
  const paid = payments.filter(p => p.runId === run._id && !p.reversedAt).reduce((sum, p) => sum + p.amountMinor, 0);
  return Math.max(0, (run.totals?.netMinor || 0) - paid);
}

export function eligibleRunEmployees(employees: PayrollEmployee[], month: string, kind: string, parent?: PayrollRun) {
  return employees.filter(e => {
    if (!e.payrollEnrolled) return false;
    // Adjustments may correct an earlier run after an employee has left.
    if (kind === 'adjustment') return !!parent?.employeeIds.includes(e._id);
    if (!e.joiningDate || e.joiningDate.slice(0, 7) > month || (e.employmentEndDate && e.employmentEndDate.slice(0, 7) < month)) return false;
    return kind !== 'final' || e.employmentEndDate?.slice(0, 7) === month;
  });
}
