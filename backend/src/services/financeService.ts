import mongoose from 'mongoose';
import { FinanceAccount, FinancePolicy, FinancePeriod, JournalEntry } from '../models/Finance';
import { validDate } from './payrollCalculator';

export const accountSeeds = [
  ['1000', 'Assets', 'asset', '', false], ['1010', 'Cash', 'asset', 'cash', true, '1000'], ['1020', 'Bank', 'asset', 'bank', true, '1000'],
  ['1030', 'POS Drawer', 'asset', 'pos_drawer', true, '1000'], ['1100', 'Employee Loans & Advances', 'asset', 'employee_loans', true, '1000'],
  ['1200', 'Customer Receivables', 'asset', '', true, '1000'], ['1300', 'Inventory', 'asset', '', true, '1000'],
  ['1400', 'Prepaid Expenses', 'asset', '', true, '1000'], ['1500', 'Fixed Assets', 'asset', '', true, '1000'], ['1510', 'Accumulated Depreciation', 'asset', '', true, '1000'],
  ['2000', 'Liabilities', 'liability', '', false], ['2010', 'Expense Payable', 'liability', 'expense_payable', true, '2000'],
  ['2020', 'Salary Payable', 'liability', 'salary_payable', true, '2000'],
  ['2030', 'Payroll Deductions Payable', 'liability', 'deductions_payable', true, '2000'],
  ['2040', 'Employer Contributions Payable', 'liability', 'employer_payable', true, '2000'],
  ['2050', 'Supplier Payables', 'liability', '', true, '2000'], ['2060', 'Tax Payable', 'liability', '', true, '2000'],
  ['3000', 'Equity', 'equity', '', false], ['3010', 'Opening Equity', 'equity', 'opening_equity', true, '3000'],
  ['3020', 'Owner Capital', 'equity', '', true, '3000'], ['3030', 'Owner Drawings', 'equity', '', true, '3000'],
  ['4000', 'Income', 'income', '', false], ['4010', 'Other Income', 'income', '', true, '4000'],
  ['4020', 'Sales', 'income', '', true, '4000'], ['4030', 'Sales Returns & Discounts', 'income', '', true, '4000'],
  ['5000', 'Expenses', 'expense', '', false], ['5010', 'Payroll Expense', 'expense', 'payroll_expense', true, '5000'],
  ['5020', 'Operating Expenses', 'expense', 'operating_expense', true, '5000'],
  ['5030', 'Rent', 'expense', '', true, '5000'], ['5040', 'Utilities', 'expense', '', true, '5000'], ['5050', 'Supplies', 'expense', '', true, '5000'],
  ['5060', 'Cost of Goods Sold', 'expense', '', true, '5000'], ['5070', 'Transport', 'expense', '', true, '5000'],
  ['5080', 'Marketing', 'expense', '', true, '5000'], ['5090', 'Repairs & Maintenance', 'expense', '', true, '5000'],
  ['5100', 'Bank & Platform Fees', 'expense', '', true, '5000'], ['5110', 'Depreciation', 'expense', '', true, '5000'],
] as const;
export const financeTenant = (businessId: string) => ({ businessId: new mongoose.Types.ObjectId(businessId) });
export function businessDate(timeZone = 'Asia/Karachi') {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validateJournalLines(lines: Array<{ debitMinor: number; creditMinor: number }>) {
  if (lines.length < 2 || lines.length > 100) throw new Error('A journal needs between 2 and 100 lines');
  let debit = 0, credit = 0;
  for (const l of lines) {
    if (![l.debitMinor, l.creditMinor].every(n => Number.isSafeInteger(n) && n >= 0) || (l.debitMinor > 0) === (l.creditMinor > 0)) throw new Error('Each line needs either a debit or a credit in exact minor units');
    debit += l.debitMinor; credit += l.creditMinor;
  }
  if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit !== credit) throw new Error('Journal debits and credits must balance');
}
export async function lockFinance(businessId: string, dateKey: string, session: mongoose.ClientSession) {
  if (!validDate(dateKey)) throw new Error('Invalid accounting date');
  // One tenant lock serializes posting, account edits and period closure.
  const policy = await FinancePolicy.findOneAndUpdate(financeTenant(businessId), { $inc: { lock: 1 } }, { returnDocument: 'after', session });
  if (!policy) throw new Error('Initialize finance in Chart of Accounts first');
  if (dateKey < policy.cutoverDate) throw new Error('Accounting date precedes the finance starting date');
  if (await FinancePeriod.exists({ ...financeTenant(businessId), month: dateKey.slice(0, 7), closed: true }).session(session)) throw new Error('Accounting period is closed');
  return policy;
}
export async function snapshotLines(businessId: string, lines: any[], session: mongoose.ClientSession, system = false, allowInactive = false) {
  validateJournalLines(lines);
  const result = [];
  for (const line of lines) {
    const a = await FinanceAccount.findOne({ ...financeTenant(businessId), _id: line.accountId, ...(!allowInactive ? { active: true } : {}), posting: true }).session(session);
    if (!a) throw new Error('Choose an active posting account in this business');
    if (!system && ['expense_payable', 'salary_payable', 'employee_loans'].includes(a.systemKey || '')) throw new Error('Control accounts require a source transaction; use a reviewed opening journal for opening balances');
    result.push({ accountId: a._id, code: a.code, name: a.name, type: a.type, debitMinor: line.debitMinor, creditMinor: line.creditMinor });
  }
  return result;
}
export async function systemAccount(businessId: string, systemKey: string, session: mongoose.ClientSession) {
  const a = await FinanceAccount.findOne({ ...financeTenant(businessId), systemKey, active: true, posting: true }).session(session);
  if (!a) throw new Error(`Finance account missing: ${systemKey}`);
  return a._id;
}
export async function postSource(input: { businessId: string; actorId: string; key: string; dateKey: string; currency: string; description: string; source: string; sourceId: string; lines: any[] }, session: mongoose.ClientSession) {
  const existing = await JournalEntry.findOne({ ...financeTenant(input.businessId), key: input.key }).session(session);
  if (existing) {
    const values = (lines: any[]) => JSON.stringify(lines.map(l => ({ accountId: String(l.accountId), debitMinor: l.debitMinor, creditMinor: l.creditMinor })));
    if (existing.source !== input.source || existing.sourceId !== input.sourceId || existing.currency !== input.currency || existing.dateKey !== input.dateKey || values(existing.lines as any) !== values(input.lines)) throw new Error('Posting key already belongs to a different financial event');
    return existing;
  }
  await lockFinance(input.businessId, input.dateKey, session);
  const lines = await snapshotLines(input.businessId, input.lines, session, true, input.key.startsWith('reverse:'));
  const [entry] = await JournalEntry.create([{ ...input, lines, createdBy: input.actorId, postedBy: input.actorId, postedAt: new Date(), status: 'posted', history: [{ action: 'posted', actorId: input.actorId, at: new Date(), reason: input.description }] }], { session });
  return entry;
}
export async function sourceSettlement(businessId: string, actorId: string, key: string, dateKey: string, currency: string, description: string, source: string, sourceId: string, amountMinor: number, debitKey: string, creditKey: string, session: mongoose.ClientSession) {
  if (amountMinor === 0) return;
  return postSource({ businessId, actorId, key, dateKey, currency, description, source, sourceId, lines: [
    { accountId: await systemAccount(businessId, debitKey, session), debitMinor: amountMinor, creditMinor: 0 },
    { accountId: await systemAccount(businessId, creditKey, session), debitMinor: 0, creditMinor: amountMinor },
  ] }, session);
}
export async function reverseSource(businessId: string, actorId: string, key: string, dateKey: string, reason: string, session: mongoose.ClientSession) {
  const original = await JournalEntry.findOne({ ...financeTenant(businessId), key, status: 'posted' }).session(session);
  if (!original) return; // Historical subledger payments have no ledger posting to reverse.
  if (original.reversedBy) return;
  if (dateKey < original.dateKey) throw new Error('Reversal date cannot precede the original accounting date');
  const result = await postSource({ businessId, actorId, key: `reverse:${key}`, dateKey, currency: original.currency, description: reason, source: original.source, sourceId: original.sourceId || '', lines: original.lines.map(l => ({ accountId: l.accountId, debitMinor: l.creditMinor, creditMinor: l.debitMinor })) }, session);
  result.reversalOf = original._id; await result.save({ session });
  original.reversedBy = result._id; await original.save({ session });
}
