import type { SalaryStructure } from '../types/payroll';

export type SalaryDraft = Omit<SalaryStructure, '_id' | 'baseMinor' | 'reason'> & { base: number };

export function salaryAt(structures: SalaryStructure[], day: string) {
    return structures.filter(s => s.effectiveDate <= day).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

export function salaryDraftError(s: SalaryDraft, allowZero: boolean, existing: SalaryStructure[], joiningDate?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.effectiveDate) || Number.isNaN(Date.parse(s.effectiveDate)) || new Date(s.effectiveDate).toISOString().slice(0, 10) !== s.effectiveDate) return 'Choose a valid salary start date.';
    if (joiningDate && s.effectiveDate > joiningDate) return 'Opening salary must start on or before the joining date.';
    if (existing.some(v => v.effectiveDate === s.effectiveDate)) return 'A salary already starts on this date. Choose another date.';
    const amount = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 && /^\d+(\.\d{1,2})?$/.test(String(n));
    if (!amount(s.base)) return 'Enter a basic salary with no more than 2 decimal places.';
    if (s.base === 0 && !allowZero) return 'Basic salary must be above zero. Zero pay is disabled in Payroll Settings.';
    if (!Number.isFinite(s.commissionPercent) || s.commissionPercent < 0 || s.commissionPercent > 100) return 'Commission must be between 0 and 100%.';
    const schedule = s.schedule;
    if (!schedule.workingDays.length || new Set(schedule.workingDays).size !== schedule.workingDays.length || schedule.workingDays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Select valid working days in Work hours & leave rules.';
    const time = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    if (!time(schedule.startTime) || !time(schedule.endTime)) return 'Enter valid shift start and end times.';
    const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    if (!Number.isInteger(schedule.breakMinutes) || schedule.breakMinutes < 0 || schedule.breakMinutes > 720 || !Number.isInteger(schedule.graceMinutes) || schedule.graceMinutes < 0 || schedule.graceMinutes > 120) return 'Use whole minutes: break 0–720, grace 0–120.';
    if ((minutes(schedule.endTime) - minutes(schedule.startTime) + 1440) % 1440 <= schedule.breakMinutes) return 'The shift must include paid time after the break.';
    if (s.components.length > 50 || s.components.some(c => !c.name.trim() || c.name.length > 500 || !amount(c.value))) return 'Check allowance and deduction names and amounts (up to 2 decimals).';
    if (Object.values(s.leaveRules || {}).some(r => [r.annualDays, r.openingDays, r.carryLimit].some(n => !Number.isFinite(n) || n < 0 || n > 366))) return 'Leave days must be between 0 and 366.';
    return '';
}
