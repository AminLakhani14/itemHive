import { Router } from 'express';
import { Types } from 'mongoose';
import { protect, type AuthRequest } from '../middleware/auth';
import { canFinancial } from '../middleware/financialAccess';
import type { AdminScreenPermission } from '../utils/screenPermissions';
import Employee from '../models/Employee';
import Expense from '../models/Expense';
import { FinancePeriod, JournalEntry } from '../models/Finance';
import { PayrollAudit, PayrollLoan, PayrollLoanMovement, PayrollPayment, PayrollRequest, PayrollRun } from '../models/Payroll';

interface Notice {
  id: string; title: string; detail: string; path: string;
  category: 'payroll' | 'expense' | 'finance';
  severity: 'warning' | 'success' | 'info'; sortTime: number; time: string;
  requiresAction: boolean;
}

// Use the source documents and their committed history, so failed transactions and
// idempotent retries cannot deliver phantom or duplicate notifications.
export async function workflowNotifications(req: AuthRequest) {
  const userId = req.user!.id;
  const tenant = { businessId: new Types.ObjectId(req.user!.businessId) };
  const can = (key: AdminScreenPermission) => canFinancial(req, key);
  const since = new Date(Date.now() - 30 * 86400_000);
  const notices = new Map<string, Notice>();
  const add = (id: string, title: string, detail: string, path: string, category: Notice['category'], at: any, requiresAction = false, severity: Notice['severity'] = 'info') => {
    const sortTime = new Date(at).getTime();
    if (!Number.isFinite(sortTime) || (!requiresAction && sortTime < since.getTime())) return;
    notices.set(id, { id, title, detail, path, category, sortTime, time: new Date(sortTime).toISOString(), requiresAction, severity: requiresAction ? 'warning' : severity });
  };
  const ownEmployee = await Employee.findOne({ ...tenant, userId }).select('_id').lean();
  const employeeId = ownEmployee?._id;
  const managedKinds = can('payroll_hr') ? ['leave', 'loan', 'advance', 'overtime', 'attendance'] : [
    ...(can('payroll_leave_requests') ? ['leave'] : []), ...(can('payroll_loan_requests') ? ['loan', 'advance'] : []), ...(can('payroll_work_requests') ? ['overtime', 'attendance'] : []),
  ];
  const ownKinds = [...(can('self_leave') ? ['leave'] : []), ...(can('self_loan') ? ['loan', 'advance'] : []), ...(can('self_overtime') ? ['overtime'] : [])];
  const requestPath = (kind: string, personal = false) => personal
    ? `/my/${kind === 'leave' ? 'leave' : ['loan', 'advance'].includes(kind) ? 'loan' : 'overtime'}-requests`
    : `/payroll/${kind === 'leave' ? 'leave' : ['loan', 'advance'].includes(kind) ? 'loan' : 'work'}-requests`;
  const kinds: Record<string, string> = { leave: 'Leave', loan: 'Loan', advance: 'Advance', overtime: 'Overtime', attendance: 'Attendance' };

  await Promise.all([
    (async () => {
      if (!managedKinds.length && !(employeeId && ownKinds.length)) return;
      const pending = managedKinds.length ? await PayrollRequest.find({ ...tenant, status: 'pending', kind: { $in: managedKinds }, createdBy: { $ne: userId }, ...(employeeId ? { employeeId: { $ne: employeeId } } : {}) }).select('kind employeeId createdAt').populate({ path: 'employeeId', select: 'fullName', match: tenant }).sort({ createdAt: 1 }).limit(100).lean() : [];
      for (const r of pending) add(`hr-pending-${r._id}`, `${kinds[r.kind]} request needs approval`, `${r.employeeId?.fullName || 'Employee request'}: review before payroll is calculated.`, requestPath(r.kind), 'payroll', r.createdAt, true);
      const recent = await PayrollRequest.find({ ...tenant, status: { $in: ['approved', 'rejected', 'cancelled'] }, updatedAt: { $gte: since }, $or: [
        ...(managedKinds.length ? [{ kind: { $in: managedKinds }, createdBy: userId }] : []),
        ...(employeeId && ownKinds.length ? [{ employeeId, kind: { $in: ownKinds } }] : []),
      ] }).select('employeeId kind status decidedAt updatedAt decidedBy decisionReason').sort({ updatedAt: -1 }).limit(100).lean();
      for (const r of recent) {
        if (String(r.decidedBy) === userId) continue;
        const personal = String(r.employeeId) === String(employeeId) && ownKinds.includes(r.kind);
        add(`hr-decision-${r._id}-${r.status}`, `${kinds[r.kind]} request ${r.status}`, r.decisionReason || 'Open the request to see the decision.', requestPath(r.kind, personal), 'payroll', r.decidedAt || r.updatedAt, false, r.status === 'approved' ? 'success' : 'warning');
      }
    })(),
    (async () => {
      const view = can('finance_view'), approve = can('finance_expense_approve'), pay = can('finance_pay'), own = can('finance_expense_create');
      const paymentAccess = pay || can('finance_expense_reverse') || can('finance_expense_void');
      if (!view && !approve && !paymentAccess && !own) return;
      if (approve) {
        const rows = await Expense.find({ ...tenant, status: 'submitted', createdBy: { $ne: userId } }).select('title updatedAt').sort({ updatedAt: 1 }).limit(100).lean();
        for (const e of rows) add(`expense-review-${e._id}-${e.updatedAt.getTime()}`, 'Expense needs approval', e.title, '/finance/expense-approvals', 'expense', e.updatedAt, true);
      }
      if (pay) {
        const rows = await Expense.find({ ...tenant, status: 'approved', $expr: { $gt: ['$amountMinor', { $sum: { $map: { input: { $filter: { input: '$payments', as: 'p', cond: { $not: ['$$p.reversedAt'] } } }, as: 'p', in: '$$p.amountMinor' } } }] } }).select('title updatedAt').sort({ updatedAt: 1 }).limit(100).lean();
        for (const e of rows) add(`expense-pay-${e._id}-${e.updatedAt.getTime()}`, 'Expense payment due', e.title, '/finance/expense-payments', 'expense', e.updatedAt, true);
      }
      const access: any[] = [
        ...(view ? [{}] : []), ...(own ? [{ createdBy: userId }] : []),
        ...(approve ? [{ status: { $in: ['submitted', 'approved', 'rejected', 'cancelled'] } }] : []),
        ...(paymentAccess ? [{ status: { $in: ['approved', 'cancelled'] } }] : []),
      ];
      const rows = await Expense.find({ ...tenant, updatedAt: { $gte: since }, $or: access }).select('title createdBy status history').sort({ updatedAt: -1 }).limit(100).lean();
      const labels: Record<string, string> = { approve: 'Expense approved', reject: 'Expense rejected', return: 'Expense returned for changes', void: 'Expense cancelled', cancel: 'Expense cancelled', payment: 'Expense payment recorded', 'payment reversal': 'Expense payment reversed' };
      for (const e of rows) for (const [i, h] of e.history.entries()) {
        if (!labels[h.action] || String(h.actorId) === userId) continue;
        const path = own && String(e.createdBy) === userId ? '/finance/my-expenses' : view ? '/finance/expenses' : paymentAccess && ['approved', 'cancelled'].includes(e.status) ? '/finance/expense-payments' : '/finance/expense-approvals';
        add(`expense-${e._id}-${i}`, labels[h.action], `${e.title}${h.reason ? ': ' + h.reason : ''}`, path, 'expense', h.at, false, ['approve', 'payment'].includes(h.action) ? 'success' : 'warning');
      }
    })(),
    (async () => {
      const runs = can('payroll_view') || can('payroll_prepare') || can('payroll_approve');
      if (can('payroll_approve')) {
        const pending = await PayrollRun.find({ ...tenant, status: 'submitted' }).select('month submittedAt createdAt').sort({ submittedAt: 1 }).limit(100).lean();
        for (const r of pending) add(`run-review-${r._id}-${new Date(r.submittedAt || r.createdAt).getTime()}`, 'Salary run needs approval', `Review salaries for ${r.month}.`, '/payroll/runs', 'payroll', r.submittedAt || r.createdAt, true);
      }
      if (runs) {
        const audits = await PayrollAudit.find({ ...tenant, action: { $in: ['run.return', 'run.approve'] }, createdAt: { $gte: since }, actorId: { $ne: userId } }).select('action targetId reason createdAt after.createdBy after.preparedBy after.month').sort({ createdAt: -1 }).limit(100).lean();
        for (const a of audits) if (can('payroll_view') || [String(a.after?.createdBy), String(a.after?.preparedBy)].includes(userId)) add(`payroll-${a._id}`, a.action === 'run.return' ? 'Salary run returned for changes' : 'Salary run approved', `${a.after?.month || ''}: ${a.reason}`, '/payroll/runs', 'payroll', a.createdAt, false, a.action === 'run.approve' ? 'success' : 'warning');
      }
      if (employeeId && can('self_payroll')) {
        const slips = await PayrollRun.find({ ...tenant, status: 'approved', 'items.employeeId': String(employeeId), approvedAt: { $gte: since } }).select('month approvedAt').sort({ approvedAt: -1 }).limit(100).lean();
        for (const r of slips) add(`payslip-${r._id}`, 'Your payslip is ready', `Your salary for ${r.month} has been approved.`, '/my/payslips', 'payroll', r.approvedAt, false, 'success');
        const payments = await PayrollPayment.find({ ...tenant, employeeId, updatedAt: { $gte: since } }).select('createdAt reversedAt dateKey').sort({ updatedAt: -1 }).limit(100).lean();
        for (const p of payments) add(`salary-payment-${p._id}-${p.reversedAt ? 'reversed' : 'paid'}`, p.reversedAt ? 'Salary payment reversed' : 'Salary payment recorded', `Open your payments for the entry dated ${p.dateKey}.`, '/my/salary-payments', 'payroll', p.reversedAt || p.createdAt, false, p.reversedAt ? 'warning' : 'success');
        const changes = await PayrollAudit.find({ ...tenant, action: 'employee.payroll', targetId: String(employeeId), actorId: { $ne: userId }, createdAt: { $gte: since } }).select('createdAt before.payrollEnrolled after.payrollEnrolled').sort({ createdAt: -1 }).limit(100).lean();
        for (const a of changes) if (a.before?.payrollEnrolled !== a.after?.payrollEnrolled) add(`enrollment-${a._id}`, a.after?.payrollEnrolled ? 'You are included in payroll' : 'You were removed from payroll', 'Contact your payroll admin if this needs a correction.', '/my/payslips', 'payroll', a.createdAt);
      }
      if (can('payroll_pay') || can('payroll_payment_reverse')) {
        const changes = await PayrollAudit.find({ ...tenant, action: 'payment.reverse', actorId: { $ne: userId }, createdAt: { $gte: since } }).select('createdAt reason').sort({ createdAt: -1 }).limit(100).lean();
        for (const a of changes) add(`salary-reversal-${a._id}`, 'Salary payment reversed', a.reason, '/payroll/payments', 'payroll', a.createdAt, false, 'warning');
      }
      if (can('payroll_loans_manage')) {
        const rows = await PayrollLoan.find({ ...tenant, status: 'approved' }).select('employeeId createdAt').populate({ path: 'employeeId', select: 'fullName', match: tenant }).sort({ createdAt: 1 }).limit(100).lean();
        for (const l of rows) add(`loan-pay-${l._id}`, 'Approved loan needs payment', `${l.employeeId?.fullName || 'Employee loan'}: record the loan or advance payment.`, '/payroll/loans', 'payroll', l.createdAt, true);
      }
      if (can('payroll_pay')) {
        // Match only runs with a real unpaid balance, not every approved run.
        const pending = await PayrollRun.aggregate([
          { $match: { ...tenant, status: 'approved' } },
          { $lookup: { from: PayrollPayment.collection.name, let: { run: '$_id' }, pipeline: [{ $match: { ...tenant, reversedAt: null, $expr: { $eq: ['$runId', '$$run'] } } }, { $group: { _id: null, paid: { $sum: '$amountMinor' } } }], as: 'paid' } },
          { $match: { $expr: { $gt: [{ $sum: '$items.netMinor' }, { $ifNull: [{ $arrayElemAt: ['$paid.paid', 0] }, 0] }] } } },
          { $sort: { approvedAt: 1 } }, { $limit: 100 }, { $project: { month: 1, approvedAt: 1 } },
        ]);
        for (const r of pending) add(`run-pay-${r._id}`, 'Salary payments due', `Unpaid salaries for ${r.month}.`, '/payroll/payments', 'payroll', r.approvedAt, true);
      }
      if (employeeId && can('self_loan')) {
        const rows = await PayrollLoanMovement.find({ ...tenant, employeeId, createdAt: { $gte: since } }).select('kind createdAt').sort({ createdAt: -1 }).limit(100).lean();
        const labels: Record<string, string> = { disbursement: 'Loan payment recorded', repayment: 'Loan repayment recorded', recovery: 'Loan deducted from salary', cancellation: 'Loan cancelled' };
        for (const m of rows) add(`loan-${m._id}`, labels[m.kind], 'Open your loan requests to check the balance.', '/my/loan-requests', 'payroll', m.createdAt, false, m.kind === 'cancellation' ? 'warning' : 'success');
      }
    })(),
    (async () => {
      if (can('finance_journal_approve')) {
        const rows = await JournalEntry.find({ ...tenant, source: { $in: ['manual', 'opening'] }, status: 'submitted', createdBy: { $ne: userId } }).select('description updatedAt').sort({ updatedAt: 1 }).limit(100).lean();
        for (const j of rows) add(`journal-review-${j._id}`, 'Journal needs approval', j.description, '/finance/journals', 'finance', j.updatedAt, true);
      }
      if (can('finance_journal_prepare') || can('finance_journal_view') || can('finance_journal_approve')) {
        const rows = await JournalEntry.find({ ...tenant, source: { $in: ['manual', 'opening'] }, updatedAt: { $gte: since }, ...(!can('finance_journal_view') && !can('finance_journal_approve') ? { createdBy: userId } : {}) }).select('description history').sort({ updatedAt: -1 }).limit(100).lean();
        const labels: Record<string, string> = { post: 'Journal posted', reject: 'Journal rejected', reverse: 'Journal reversed', cancel: 'Journal cancelled' };
        for (const j of rows) for (const [i, h] of j.history.entries()) if (labels[h.action] && String(h.actorId) !== userId) add(`journal-${j._id}-${i}`, labels[h.action], `${j.description}: ${h.reason}`, '/finance/journals', 'finance', h.at, false, h.action === 'post' ? 'success' : 'warning');
      }
      if (can('finance_period_close') || can('finance_period_reopen')) {
        const rows = await FinancePeriod.find({ ...tenant, updatedAt: { $gte: since } }).select('month history').sort({ updatedAt: -1 }).limit(100).lean();
        for (const p of rows) for (const [i, h] of p.history.entries()) if (String(h.actorId) !== userId) add(`period-${p._id}-${i}`, `Finance month ${h.action}`, `${p.month}: ${h.reason}`, '/finance/periods', 'finance', h.at, false, h.action === 'closed' ? 'success' : 'warning');
      }
    })(),
  ]);
  return [...notices.values()].sort((a, b) => Number(b.requiresAction) - Number(a.requiresAction) || b.sortTime - a.sortTime || a.id.localeCompare(b.id));
}

const router = Router();
router.get('/workflow', protect, async (req: AuthRequest, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await workflowNotifications(req));
  } catch (error) {
    console.error('Workflow notifications failed', error);
    res.status(500).json({ message: 'Unable to load payroll and finance notifications. Please retry.' });
  }
});
export default router;
