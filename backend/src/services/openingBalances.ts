import mongoose from 'mongoose';
import Expense from '../models/Expense';
import Employee from '../models/Employee';
import User from '../models/User';
import { PayrollRun, PayrollPayment, PayrollLoan } from '../models/Payroll';
import { FinanceAccount, FinancePolicy, JournalEntry } from '../models/Finance';
import { financeTenant } from './financeService';

export async function openingCandidates(businessId: string, session?: mongoose.ClientSession) {
  const tenant = financeTenant(businessId);
  const expenses = await Expense.find({ ...tenant, status: 'approved', journalEntryId: null }).session(session || null).lean();
  const runs = await PayrollRun.find({ ...tenant, status: 'approved', journalEntryId: null }).session(session || null).lean();
  const payments = await PayrollPayment.find({ ...tenant, reversedAt: { $exists: false }, runId: { $in: runs.map(r => r._id) } }).session(session || null).lean();
  const loans = await PayrollLoan.find({ ...tenant, status: 'disbursed', journalEntryId: null }).session(session || null).lean();
  const employees = await Employee.find({ ...tenant, _id: { $in: loans.map(l => l.employeeId) } }).select('fullName employeeCode').session(session || null).lean();
  return {
    expenses: expenses.map(e => ({ _id: String(e._id), title: e.title, currency: e.currency, outstandingMinor: e.amountMinor - e.payments.filter(p => !p.reversedAt).reduce((n, p) => n + p.amountMinor, 0), version: e.version })).filter(e => e.outstandingMinor > 0),
    runs: runs.map(r => ({ _id: String(r._id), title: `Payroll ${r.month} / ${r.kind}`, currency: r.policy.currency, outstandingMinor: r.items.reduce((n: number, i: any) => n + i.netMinor, 0) - payments.filter(p => String(p.runId) === String(r._id)).reduce((n, p) => n + p.amountMinor, 0), version: r.version })).filter(r => r.outstandingMinor > 0),
    loans: loans.map(l => ({ _id: String(l._id), title: `${l.kind} / ${employees.find(e => String(e._id) === String(l.employeeId))?.fullName || l.employeeId}`, outstandingMinor: l.balanceMinor })),
  };
}
export async function linkOpening(businessId: string, actorId: string, input: { journalId: string; expenseIds: string[]; runIds: string[]; loanIds: string[]; reason: string }) {
  return mongoose.connection.transaction(async session => {
    const actorName = (await User.findById(actorId).select('name').session(session).lean())?.name || 'Recorded user';
    const tenant = financeTenant(businessId);
    const policy = await FinancePolicy.findOneAndUpdate(tenant, { $inc: { lock: 1 } }, { returnDocument: 'after', session });
    if (!policy) throw new Error('Initialize finance first');
    const j = await JournalEntry.findOne({ ...tenant, _id: input.journalId, source: 'opening', status: 'posted', reversedBy: { $exists: false } }).session(session);
    if (!j || j.openingLinks) throw new Error('Choose an unallocated posted opening journal');
    const candidates = await openingCandidates(businessId, session);
    const select = (ids: string[], rows: Array<{ _id: string; outstandingMinor: number; currency?: string }>) => ids.map(id => {
      const row = rows.find(r => r._id === id); if (!row || (row.currency && row.currency !== j.currency)) throw new Error('Selected source changed, is already linked or uses another currency'); return row;
    });
    const expenses = select(input.expenseIds, candidates.expenses), runs = select(input.runIds, candidates.runs), loans = select(input.loanIds, candidates.loans);
    // Loan currency follows the business payroll policy.
    if (loans.length) {
      const { PayrollPolicy } = await import('../models/Payroll');
      const p = await PayrollPolicy.findOne(tenant).session(session);
      if (!p || p.currency !== j.currency) throw new Error('Loan currency must match business payroll currency');
    }
    const mappings = await FinanceAccount.find({ ...tenant, systemKey: { $in: ['expense_payable', 'salary_payable', 'employee_loans'] } }).session(session).lean();
    const balance = (key: string) => j.lines.filter(l => String(l.accountId) === String(mappings.find(a => a.systemKey === key)?._id)).reduce((n, l) => n + l.debitMinor - l.creditMinor, 0);
    const total = (rows: Array<{ outstandingMinor: number }>) => rows.reduce((n, r) => n + r.outstandingMinor, 0);
    if (balance('expense_payable') !== -total(expenses) || balance('salary_payable') !== -total(runs) || balance('employee_loans') !== total(loans)) throw new Error('Opening journal control balances must exactly match the selected outstanding expenses, salaries and loans');
    if (!expenses.length && !runs.length && !loans.length) throw new Error('Select at least one historical source');
    for (const e of expenses) {
      const updated = await Expense.updateOne({ ...tenant, _id: e._id, journalEntryId: null, version: candidates.expenses.find(x => x._id === e._id)!.version }, { $set: { journalEntryId: j._id, accountingOrigin: 'opening' }, $inc: { version: 1 }, $push: { history: { action: 'opening balance linked', actorId, actorName, reason: input.reason, at: new Date() } } }, { session });
      if (updated.modifiedCount !== 1) throw new Error('Expense changed during allocation');
    }
    for (const r of runs) {
      const updated = await PayrollRun.updateOne({ ...tenant, _id: r._id, journalEntryId: null, version: candidates.runs.find(x => x._id === r._id)!.version }, { $set: { journalEntryId: j._id, accountingOrigin: 'opening' }, $inc: { version: 1 } }, { session });
      if (updated.modifiedCount !== 1) throw new Error('Payroll changed during allocation');
    }
    for (const l of loans) {
      const updated = await PayrollLoan.updateOne({ ...tenant, _id: l._id, journalEntryId: null, balanceMinor: l.outstandingMinor }, { $set: { journalEntryId: j._id } }, { session });
      if (updated.modifiedCount !== 1) throw new Error('Loan changed during allocation');
    }
    j.openingLinks = { ...input, at: new Date(), actorId, actorName }; j.history.push({ action: 'opening sources linked', actorId, actorName, reason: input.reason, at: new Date() }); j.version++; await j.save({ session }); return j;
  });
}
