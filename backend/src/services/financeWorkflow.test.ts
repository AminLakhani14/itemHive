import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import financeRoutes from '../routes/financeRoutes';
import expenseRoutes from '../routes/expenseRoutes';
import { payrollRouter, myPayrollRouter } from '../routes/payrollRoutes';
import authRoutes from '../routes/authRoutes';
import settingsRoutes from '../routes/settingsRoutes';
import posShiftRoutes from '../routes/posShiftRoutes';
import userRoutes from '../routes/userRoutes';
import User from '../models/User';
import Business from '../models/Business';
import Employee from '../models/Employee';
import Attendance from '../models/Attendance';
import Expense from '../models/Expense';
import POSShift from '../models/POSShift';
import { FinanceAccount, JournalEntry, financeModels } from '../models/Finance';
import { PayrollLoan, PayrollPolicy, SalaryStructure, payrollModels } from '../models/Payroll';
import { ADMIN_SCREEN_PERMISSIONS, type AdminScreenPermission } from '../utils/screenPermissions';
import { businessDate, validateJournalLines } from './financeService';
import { dateKeys, defaultSchedule } from './payrollCalculator';

test('journal amounts reject imbalance, invalid integers and two-sided lines', () => {
  for (const lines of [[{ debitMinor: 1, creditMinor: 1 }, { debitMinor: 0, creditMinor: 1 }], [{ debitMinor: 1.1, creditMinor: 0 }, { debitMinor: 0, creditMinor: 1.1 }], [{ debitMinor: 2, creditMinor: 0 }, { debitMinor: 0, creditMinor: 1 }]]) assert.throws(() => validateJournalLines(lines));
});
test('finance, expenses, employee requests and payroll reconcile in an isolated replica set', { timeout: process.env.FINANCE_PREVIEW === '1' ? 1_200_000 : 300_000 }, async t => {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { downloadDir: '../.cache/mongodb-binaries' } });
  await mongoose.connect(replica.getUri(), { dbName: 'itemhive_finance_test_' + randomUUID().replaceAll('-', '') });
  const app = express(); app.use(cors()); app.use(express.json({ limit: '3mb' }));
  app.use('/api/finance', financeRoutes); app.use('/api/expenses', expenseRoutes); app.use('/api/payroll', payrollRouter); app.use('/api/me/payroll', myPayrollRouter);
  app.use('/api/auth', authRoutes); app.use('/api/settings', settingsRoutes); app.use('/api/users', userRoutes);
  app.use('/api/pos-shifts', posShiftRoutes);
  app.get('/health', (_req, res) => res.json({ mode: 'disposable finance QA', database: 'Connected' }));
  const server = app.listen(process.env.FINANCE_PREVIEW === '1' ? 5052 : 0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as any).port + '/api';
  try {
    for (const model of [...financeModels, ...payrollModels, Expense, Employee, Attendance, POSShift]) await model.createIndexes();
    const business = await Business.create({ name: 'Finance QA Workspace', slug: randomUUID() });
    const foreign = await Business.create({ name: 'Other QA Workspace', slug: randomUUID() });
    const account = (name: string, role: 'user' | 'admin' | 'super_admin', permissions: readonly AdminScreenPermission[] | null, businessId = business._id) => User.create({ name, email: name.toLowerCase() + '@finance.example.com', password: 'FinanceTest!234', role, screenPermissions: permissions ? [...permissions] : null, businessId });
    const preparer = await account('Preparer', 'admin', ADMIN_SCREEN_PERMISSIONS);
    const reviewer = await account('Reviewer', 'admin', ADMIN_SCREEN_PERMISSIONS);
    const owner = await account('Owner', 'super_admin', null);
    const staff = await account('Employee', 'user', ['self_payroll', 'self_leave', 'self_loan', 'self_overtime', 'finance_expense_create']);
    const denied = await account('Denied', 'admin', null);
    const other = await account('Outsider', 'admin', ADMIN_SCREEN_PERMISSIONS, foreign._id);
    const employee = await Employee.create({ businessId: business._id, userId: staff._id, employeeCode: 'EMP-QA', fullName: 'QA Employee', joiningDate: '2026-01-01', payrollEnrolled: true, salary: 3000 });
    await PayrollPolicy.create({ businessId: business._id, enabled: true, confirmed: true, currency: 'PKR', timeZone: 'Asia/Karachi' });
    await SalaryStructure.create({ businessId: business._id, employeeId: employee._id, effectiveDate: '2026-01-01', baseMinor: 300000, salaryType: 'monthly', schedule: defaultSchedule, reason: 'QA structure', createdBy: preparer._id, components: [{ name: 'Employer contribution', kind: 'employer', mode: 'fixed', value: 10, prorate: false }, { name: 'Withholding', kind: 'deduction', mode: 'fixed', value: 20, prorate: false }] });
    const request = async (user: any, method: string, path: string, body?: any) => {
      const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET || 'secret'), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, data: await response.json() as any };
    };
    const ok = async (user: any, method: string, path: string, body?: any) => { const r = await request(user, method, path, body); assert.ok(r.status >= 200 && r.status < 300, `${method} ${path}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
    const today = businessDate();
    const date = '2026-09-15';
    let accounts: any[] = []; let expense: any; let loan: any; let run: any; let customAccount: any;
    await t.test('explicit sharing protects direct APIs, including personal features', async () => {
      for (const path of ['/finance/accounts', '/finance/reports?from=2026-01-01&to=2026-12-31&currency=PKR', '/expenses', '/me/payroll']) assert.equal((await request(denied, 'GET', path)).status, 403);
      assert.equal((await request(staff, 'GET', '/finance/accounts')).status, 403);
      assert.equal((await request(staff, 'GET', '/payroll/runs')).status, 403);
      const grants = await ok(owner, 'PATCH', '/users/' + staff._id + '/permissions', { screenPermissions: ['self_leave', 'finance_pay'] });
      assert.deepEqual(grants.user.screenPermissions, ['self_leave']);
      assert.equal((await request(staff, 'GET', '/me/payroll')).status, 403);
      assert.equal((await request(staff, 'POST', '/me/payroll/requests', { kind: 'loan', reason: 'Denied feature', data: { amount: 10, installment: 1, startMonth: '2026-09' } })).status, 403);
      const own = await ok(staff, 'GET', '/me/payroll/requests-meta'); assert.deepEqual(own.kinds, ['leave']); assert.deepEqual(own.loans, []);
      await ok(owner, 'PATCH', '/users/' + staff._id + '/permissions', { screenPermissions: ['self_payroll', 'self_leave', 'self_loan', 'self_overtime', 'finance_expense_create'] });
    });
    await t.test('setup is explicit, tenant scoped and cannot replay or reinitialize', async () => {
      await ok(preparer, 'POST', '/finance/initialize', { cutoverDate: '2000-01-01', reason: 'Reviewed test cutover' });
      assert.equal((await request(preparer, 'POST', '/finance/initialize', { cutoverDate: date, reason: 'Repeated setup' })).status, 400);
      accounts = (await ok(preparer, 'GET', '/finance/accounts')).accounts;
      assert.equal((await ok(other, 'GET', '/finance/accounts')).accounts.length, 0);
      assert.equal(await JournalEntry.countDocuments(), 0);
      assert.ok(accounts.some(a => a.systemKey === 'salary_payable'));
    });
    const by = (key: string) => accounts.find(a => a.systemKey === key)._id;
    await t.test('salary setup and enrollment persist through the same APIs used by both screens', async () => {
      const fresh = await Employee.create({ businessId: business._id, employeeCode: 'EMP-ENROLL', fullName: 'Enrollment QA Employee', joiningDate: '2026-01-01', salary: 2500 });
      const before = await ok(preparer, 'GET', '/payroll/employees/' + fresh._id); assert.equal(before.profile.payrollEnrolled, false); assert.equal(before.profile.joiningDate, '2026-01-01');
      const profile = { payrollEnrolled: true, payrollRevision: before.profile.payrollRevision, department: '', employmentEndDate: '', paymentMethod: 'cash', bankName: '', bankAccount: '', reason: 'Enroll with reviewed salary' };
      assert.equal((await request(preparer, 'PUT', '/payroll/employees/' + fresh._id, profile)).status, 400);
      await ok(preparer, 'POST', '/payroll/employees/' + fresh._id + '/structures', { effectiveDate: fresh.joiningDate, base: 2500, salaryType: 'monthly', commissionPercent: 0, schedule: defaultSchedule, components: [], reason: 'Opening salary effective at joining' });
      const current = await ok(preparer, 'GET', '/payroll/employees/' + fresh._id);
      await ok(preparer, 'PUT', '/payroll/employees/' + fresh._id, { ...profile, payrollRevision: current.profile.payrollRevision });
      const list = await ok(preparer, 'GET', '/payroll/employees'); assert.equal(list.find((e: any) => e._id === String(fresh._id)).payrollEnrolled, true);
      const saved = await ok(preparer, 'GET', '/payroll/employees/' + fresh._id); assert.equal(saved.profile.payrollEnrolled, true);
      assert.equal((await request(preparer, 'PUT', '/payroll/employees/' + fresh._id, { ...profile, payrollRevision: current.profile.payrollRevision })).status, 400);
    });
    await t.test('account hierarchy, tenant references and protected mappings cannot be corrupted', async () => {
      const body = { code: '5099', name: 'Testing', type: 'expense', parentId: '', posting: true, active: true, reason: 'New category' };
      const a = await ok(preparer, 'POST', '/finance/accounts', body);
      customAccount = a;
      assert.equal((await request(preparer, 'POST', '/finance/accounts', body)).status, 409);
      assert.equal((await request(preparer, 'PUT', '/finance/accounts/' + a._id, { ...body, version: a.version, parentId: a._id })).status, 400);
      assert.equal((await request(other, 'PUT', '/finance/accounts/' + a._id, { ...body, version: a.version })).status, 400);
      const cash = accounts.find(a => a.systemKey === 'cash');
      assert.equal((await request(preparer, 'PUT', '/finance/accounts/' + cash._id, { code: cash.code, name: cash.name, type: cash.type, parentId: cash.parentId, posting: true, active: false, reason: 'Disable protected', version: cash.version })).status, 400);
    });
    const draft = () => ({ title: 'QA supplies', category: 'Supplies', dateKey: date, payee: 'QA Vendor', reference: randomUUID(), notes: 'Receipt reviewed', currency: 'PKR', amount: 100, accountId: by('operating_expense'), key: randomUUID() });
    await t.test('expense drafts support exact retries, edits, duplicate invoices and tenant isolation', async () => {
      const body = draft(); expense = await ok(staff, 'POST', '/expenses', body);
      assert.equal((await request(staff, 'POST', '/expenses', { ...body, key: randomUUID(), amount: 1.001 })).status, 400);
      assert.equal((await ok(staff, 'POST', '/expenses', body))._id, expense._id);
      assert.equal((await request(staff, 'POST', '/expenses', { ...body, amount: 101 })).status, 409);
      assert.equal((await request(staff, 'POST', '/expenses', { ...body, key: randomUUID() })).status, 409);
      assert.equal((await request(other, 'GET', '/expenses/' + expense._id)).status, 404);
      const { key, ...edit } = body;
      expense = await ok(staff, 'PUT', '/expenses/' + expense._id, { ...edit, title: 'Edited QA supplies', version: expense.version });
      assert.equal(expense.title, 'Edited QA supplies');
      assert.equal((await request(staff, 'GET', '/expenses?view=approvals')).status, 403);
    });
    const decide = (user: any, action: string, e = expense) => ok(user, 'POST', '/expenses/' + e._id + '/decision', { action, version: e.version, reason: 'QA ' + action, ...(action === 'void' ? { dateKey: date } : {}) });
    await t.test('return, resubmit and independent approval create a single balanced accrual', async () => {
      expense = await decide(staff, 'submit'); expense = await decide(reviewer, 'return'); assert.equal(expense.status, 'rejected'); expense = await decide(staff, 'submit');
      assert.equal((await request(staff, 'POST', '/expenses/' + expense._id + '/decision', { action: 'approve', version: expense.version, reason: 'Self approval' })).status, 403);
      expense = await decide(reviewer, 'approve'); assert.ok(expense.journalEntryId);
      const j = await JournalEntry.findById(expense.journalEntryId); assert.equal(j!.lines.reduce((n, l) => n + l.debitMinor - l.creditMinor, 0), 0);
      assert.equal((await request(reviewer, 'POST', '/expenses/' + expense._id + '/decision', { action: 'approve', version: expense.version - 1, reason: 'Retry' })).status, 409);
      assert.equal(await JournalEntry.countDocuments({ source: 'expense' }), 1);
    });
    await t.test('concurrent payments never overpay, retries never duplicate and reversals restore liability', async () => {
      const pay = { amount: 60, method: 'cash', dateKey: date, reference: 'PAY-QA', version: expense.version };
      const result = await Promise.all([request(reviewer, 'POST', '/expenses/' + expense._id + '/payments', { ...pay, key: randomUUID() }), request(reviewer, 'POST', '/expenses/' + expense._id + '/payments', { ...pay, key: randomUUID() })]);
      assert.equal(result.filter(r => r.status === 200).length, 1); expense = result.find(r => r.status === 200)!.data; assert.equal(expense.outstandingMinor, 4000);
      const p = expense.payments[0]; const retry = await ok(reviewer, 'POST', '/expenses/' + expense._id + '/payments', { ...pay, key: p.key }); assert.equal(retry.payments.length, 1);
      assert.equal((await request(reviewer, 'POST', '/expenses/' + expense._id + '/payments', { ...pay, amount: 41, version: expense.version, key: randomUUID() })).status, 400);
      expense = await ok(reviewer, 'POST', `/expenses/${expense._id}/payments/${p._id}/reverse`, { version: expense.version, reason: 'QA reversal', dateKey: date }); assert.equal(expense.outstandingMinor, 10000);
      expense = await decide(reviewer, 'void'); assert.equal(expense.status, 'cancelled');
      const report = await ok(reviewer, 'GET', '/finance/reports?from=2000-01-01&to=2099-12-31&currency=PKR'); assert.ok(report.rows.every((r: any) => r.balanceMinor === 0));
    });
    await t.test('journal preparation, editing, review and reversal preserve balance and control accounts', async () => {
      const body = { key: randomUUID(), dateKey: date, currency: 'PKR', description: 'Manual correction QA', lines: [{ accountId: customAccount._id, debitMinor: 10000, creditMinor: 0 }, { accountId: by('bank'), debitMinor: 0, creditMinor: 10000 }] };
      assert.equal((await request(preparer, 'POST', '/finance/journals', { ...body, lines: [{ ...body.lines[0], accountId: by('salary_payable') }, body.lines[1]] })).status, 400);
      assert.equal((await request(preparer, 'POST', '/finance/journals', { ...body, lines: [{ ...body.lines[0], debitMinor: 9000 }, body.lines[1]] })).status, 400);
      let j = await ok(preparer, 'POST', '/finance/journals', body); assert.equal((await ok(preparer, 'POST', '/finance/journals', body))._id, j._id);
      j = await ok(preparer, 'PUT', '/finance/journals/' + j._id, { ...body, version: j.version, reason: 'Correct description', description: 'Edited cash transfer' });
      j = await ok(preparer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'submit', reason: 'Reviewed draft' });
      assert.equal((await request(preparer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'post', reason: 'Self approve' })).status, 400);
      j = await ok(reviewer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'post', reason: 'Independent review' });
      assert.equal((await request(preparer, 'PUT', '/finance/journals/' + j._id, { ...body, version: j.version, reason: 'Rewrite posted' })).status, 400);
      assert.equal((await request(reviewer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'reverse', reason: 'Invalid earlier reversal', dateKey: '2026-09-14' })).status, 400);
      await ok(preparer, 'PUT', '/finance/accounts/' + customAccount._id, { code: customAccount.code, name: customAccount.name, type: customAccount.type, parentId: '', posting: true, active: false, reason: 'Account retired after posting', version: customAccount.version });
      j = await ok(reviewer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'reverse', reason: 'QA reverse after account retirement', dateKey: date }); assert.ok(j.reversedBy);
    });
    await t.test('personal leave is isolated and manager requests need independent approval', async () => {
      const body = { kind: 'leave', data: { startDate: '2026-11-02', endDate: '2026-11-02', leaveType: 'unpaid', fraction: 0.5 }, reason: 'QA half day' };
      const keyed = { ...body, key: randomUUID(), employeeId: new mongoose.Types.ObjectId().toString() };
      const r = await ok(staff, 'POST', '/me/payroll/requests', keyed); assert.equal(r.employeeId, String(employee._id));
      assert.equal((await ok(staff, 'POST', '/me/payroll/requests', keyed))._id, r._id);
      await ok(reviewer, 'POST', '/payroll/requests/' + r._id + '/decision', { status: 'approved', reason: 'QA accepted' });
      const own = await ok(staff, 'GET', '/me/payroll/requests-meta'); assert.ok(own.requests.some((x: any) => x._id === r._id));
      const manager = await ok(preparer, 'POST', '/payroll/requests', { ...body, data: { ...body.data, startDate: '2026-11-03', endDate: '2026-11-03' }, employeeId: String(employee._id) });
      assert.equal((await request(preparer, 'POST', '/payroll/requests/' + manager._id + '/decision', { status: 'approved', reason: 'Own approval' })).status, 400);
      await ok(reviewer, 'POST', '/payroll/requests/' + manager._id + '/decision', { status: 'approved', reason: 'Independent decision' });
    });
    await t.test('loan approval, cash disbursement and direct repayment post only actual movements', async () => {
      const r = await ok(staff, 'POST', '/me/payroll/requests', { kind: 'loan', data: { amount: 1000, installment: 100, startMonth: '2026-09' }, reason: 'QA loan' });
      await ok(reviewer, 'POST', '/payroll/requests/' + r._id + '/decision', { status: 'approved', reason: 'QA accepted loan' });
      loan = await PayrollLoan.findOne({ requestId: r._id }); assert.equal(loan.balanceMinor, 0);
      const body = { kind: 'disbursement', reference: 'LOAN-QA', key: randomUUID(), reason: 'Cash issued' };
      await ok(preparer, 'POST', '/payroll/loans/' + loan._id + '/movements', body); await ok(preparer, 'POST', '/payroll/loans/' + loan._id + '/movements', body);
      assert.equal(await JournalEntry.countDocuments({ source: 'employee_loan' }), 1);
      await ok(preparer, 'POST', '/payroll/loans/' + loan._id + '/movements', { kind: 'repayment', amount: 100, reference: 'REPAY-QA', key: randomUUID(), reason: 'Cash received' });
    });
    await t.test('payroll approval, recoveries, salary payments and reversals match ledger balances', async () => {
      await Attendance.insertMany(dateKeys('2026-09-01', '2026-09-30').map(dateKey => ({ businessId: business._id, employeeId: employee._id, dateKey, checkIn: dateKey + 'T04:00:00Z', checkOut: dateKey + 'T12:00:00Z', timeZone: 'Asia/Karachi' })));
      run = await ok(preparer, 'POST', '/payroll/runs', { month: '2026-09', kind: 'regular', employeeIds: [String(employee._id)], reason: 'QA September pay' });
      run = await ok(preparer, 'POST', `/payroll/runs/${run._id}/calculate`, { version: run.version, reason: 'QA calculate' }); assert.deepEqual(run.items[0].exceptions, []);
      run = await ok(preparer, 'POST', `/payroll/runs/${run._id}/submit`, { version: run.version, reason: 'QA submit' });
      run = await ok(reviewer, 'POST', `/payroll/runs/${run._id}/approve`, { version: run.version, reason: 'QA independent approve' }); assert.ok(run.journalEntryId);
      const body = { reason: 'QA salary', payments: [{ runId: run._id, employeeId: String(employee._id), amount: 500, method: 'bank', dateKey: today, reference: 'SALARY-QA', key: randomUUID() }] };
      const paid = await ok(preparer, 'POST', '/payroll/payments', body); await ok(preparer, 'POST', '/payroll/payments', body);
      assert.equal(await JournalEntry.countDocuments({ source: 'payroll_payment' }), 1);
      await ok(preparer, 'POST', '/payroll/payments/' + paid[0]._id + '/reverse', { reason: 'QA salary reversal' });
      const report = await ok(reviewer, 'GET', '/finance/reports?from=2000-01-01&to=2099-12-31&currency=PKR');
      const row = (key: string) => report.rows.find((r: any) => r._id === by(key));
      assert.equal(row('salary_payable').balanceMinor, -run.totals.netMinor); assert.equal(row('payroll_expense').balanceMinor, run.totals.employerCostMinor);
      const outstanding = await PayrollLoan.findById(loan._id); assert.equal(row('employee_loans').balanceMinor, outstanding!.balanceMinor);
      assert.equal(report.rows.reduce((n: number, r: any) => n + r.balanceMinor, 0), 0);
    });
    await t.test('closed periods block postings atomically and reopen preserves audit', async () => {
      await ok(reviewer, 'POST', '/finance/periods', { month: '2026-09', closed: true, reason: 'QA close' });
      assert.equal((await request(preparer, 'POST', '/finance/journals', { key: randomUUID(), dateKey: date, currency: 'PKR', description: 'Closed period attempt', lines: [{ accountId: by('cash'), debitMinor: 100, creditMinor: 0 }, { accountId: by('bank'), debitMinor: 0, creditMinor: 100 }] })).status, 400);
      await ok(reviewer, 'POST', '/finance/periods', { month: '2026-09', closed: false, reason: 'QA reopen' }); const periods = await ok(reviewer, 'GET', '/finance/periods'); assert.deepEqual(periods[0].history.map((h: any) => h.action), ['closed', 'reopened']);
    });
    await t.test('closing a month racing expense posting cannot let a later posting escape the lock', async () => {
      let e = await ok(staff, 'POST', '/expenses', { ...draft(), dateKey: '2026-08-15' });
      e = await ok(staff, 'POST', '/expenses/' + e._id + '/decision', { version: e.version, action: 'submit' });
      const [posted, closed] = await Promise.all([
        request(reviewer, 'POST', '/expenses/' + e._id + '/decision', { version: e.version, action: 'approve', reason: 'Concurrent review' }),
        request(reviewer, 'POST', '/finance/periods', { month: '2026-08', closed: true, reason: 'Concurrent close' }),
      ]);
      assert.equal(closed.status, 200);
      assert.ok([200, 400].includes(posted.status));
      const stored = await Expense.findById(e._id);
      assert.equal(stored!.status, posted.status === 200 ? 'approved' : 'submitted');
      assert.equal(await JournalEntry.countDocuments({ sourceId: e._id }), posted.status === 200 ? 1 : 0);
      assert.equal((await request(preparer, 'POST', '/finance/journals', { key: randomUUID(), dateKey: '2026-08-16', currency: 'PKR', description: 'After racing close', lines: [{ accountId: by('cash'), debitMinor: 100, creditMinor: 0 }, { accountId: by('bank'), debitMinor: 0, creditMinor: 100 }] })).status, 400);
    });
    await t.test('reviewed opening allocations settle historical payables without recording old costs again', async () => {
      const baseline = await ok(reviewer, 'GET', '/finance/reports?from=2000-01-01&to=2099-12-31&currency=PKR');
      const originalPayable = baseline.rows.find((r: any) => r._id === by('expense_payable'))?.balanceMinor || 0;
      const legacy = await Expense.create({ businessId: business._id, key: randomUUID(), title: 'Historical rent payable', category: 'Rent', dateKey: '1999-12-01', currency: 'PKR', amountMinor: 2000, status: 'approved', createdBy: staff._id, createdByName: staff.name });
      let j = await ok(preparer, 'POST', '/finance/journals', { key: randomUUID(), dateKey: '2000-01-01', currency: 'PKR', opening: true, description: 'Reviewed historical payable', lines: [{ accountId: by('opening_equity'), debitMinor: 2000, creditMinor: 0 }, { accountId: by('expense_payable'), debitMinor: 0, creditMinor: 2000 }] });
      j = await ok(preparer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'submit', reason: 'Opening balance review' });
      j = await ok(reviewer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'post', reason: 'Opening approved' });
      const sources = await ok(preparer, 'GET', '/finance/opening-sources'); assert.ok(sources.expenses.some((e: any) => e._id === String(legacy._id)));
      assert.equal((await request(preparer, 'POST', '/finance/opening-sources', { journalId: j._id, expenseIds: [], runIds: [], loanIds: [], reason: 'Incomplete allocation' })).status, 400);
      j = await ok(preparer, 'POST', '/finance/opening-sources', { journalId: j._id, expenseIds: [String(legacy._id)], runIds: [], loanIds: [], reason: 'Matched vendor balance' });
      const linked = await ok(staff, 'GET', '/expenses/' + legacy._id); assert.equal(linked.accountingOrigin, 'opening');
      const paid = await ok(reviewer, 'POST', '/expenses/' + legacy._id + '/payments', { version: linked.version, key: randomUUID(), amount: 20, dateKey: today, method: 'bank', reference: 'Historical payable settled' }); assert.equal(paid.outstandingMinor, 0);
      assert.equal((await request(reviewer, 'POST', '/finance/journals/' + j._id + '/decision', { version: j.version, action: 'reverse', dateKey: today, reason: 'Orphan linked source' })).status, 400);
      const report = await ok(reviewer, 'GET', '/finance/reports?from=2000-01-01&to=2099-12-31&currency=PKR'); assert.equal(report.rows.find((r: any) => r._id === by('expense_payable')).balanceMinor, originalPayable);
    });
    await t.test('POS drawer expenses and refunds retain original and current shift links', async () => {
      let e = await ok(staff, 'POST', '/expenses', { ...draft(), dateKey: today });
      e = await ok(staff, 'POST', '/expenses/' + e._id + '/decision', { version: e.version, action: 'submit' });
      e = await ok(reviewer, 'POST', '/expenses/' + e._id + '/decision', { version: e.version, action: 'approve', reason: 'Drawer expense review' });
      const pay = { version: e.version, amount: 10, key: randomUUID(), dateKey: today, method: 'pos_drawer', reference: 'Drawer paid-out QA' };
      assert.equal((await request(reviewer, 'POST', '/expenses/' + e._id + '/payments', pay)).status, 409);
      const first = await POSShift.create({ businessId: business._id, shiftCode: 'QA-DRAWER-1', currency: 'PKR', registerName: 'QA register', openingCash: 100, openedBy: reviewer._id, openedByName: reviewer.name });
      e = await ok(reviewer, 'POST', '/expenses/' + e._id + '/payments', pay); assert.equal(e.payments[0].shiftId, String(first._id));
      const closed = await ok(reviewer, 'POST', '/pos-shifts/close', { countedCash: 90 });
      assert.equal(closed.report.totals.expensePaidOut, 10); assert.equal(closed.report.totals.expectedDrawerCash, 90);
      const second = await POSShift.create({ businessId: business._id, shiftCode: 'QA-DRAWER-2', currency: 'PKR', registerName: 'QA register', openingCash: 100, openedBy: reviewer._id, openedByName: reviewer.name });
      e = await ok(reviewer, 'POST', `/expenses/${e._id}/payments/${e.payments[0]._id}/reverse`, { version: e.version, dateKey: today, reason: 'Return cash to current drawer' });
      assert.equal(e.payments[0].reversalShiftId, String(second._id)); assert.equal((await POSShift.findById(first._id))!.activityVersion, 1); assert.equal((await POSShift.findById(second._id))!.activityVersion, 1);
      assert.equal((await POSShift.findById(first._id))!.finalReport!.totals.expectedDrawerCash, 90);
      const current = await ok(reviewer, 'GET', '/pos-shifts/x-report'); assert.equal(current.report.totals.expenseRefunds, 10); assert.equal(current.report.totals.expectedDrawerCash, 110);
      const report = await ok(reviewer, 'GET', '/finance/reports?from=2000-01-01&to=2099-12-31&currency=PKR'); assert.equal(report.rows.find((r: any) => r._id === by('pos_drawer')).balanceMinor, 0);
    });
    await t.test('older invoices remain visible across approval and payment queues with a separate open accounting date', async () => {
      let e = await ok(staff, 'POST', '/expenses', { ...draft(), dateKey: '1999-12-20', amount: 33.25 });
      e = await ok(staff, 'POST', '/expenses/' + e._id + '/decision', { version: e.version, action: 'submit' });
      const approval = await ok(reviewer, 'GET', '/expenses?view=approvals&limit=100'); assert.ok(approval.rows.some((r: any) => r._id === e._id));
      e = await ok(reviewer, 'POST', '/expenses/' + e._id + '/decision', { version: e.version, action: 'approve', dateKey: today, reason: 'Reviewed old invoice, outside opening balances' }); assert.equal(e.postingDateKey, today); assert.equal(e.dateKey, '1999-12-20');
      const pending = await ok(reviewer, 'GET', '/expenses?view=payments&paymentStatus=outstanding&limit=100'); assert.ok(pending.rows.some((r: any) => r._id === e._id));
      e = await ok(reviewer, 'POST', '/expenses/' + e._id + '/payments', { version: e.version, amount: 33.25, key: randomUUID(), method: 'bank', dateKey: today, reference: 'Full historical invoice payment' }); assert.equal(e.outstandingMinor, 0);
      const paid = await ok(reviewer, 'GET', '/expenses?view=payments&paymentStatus=paid&limit=100'); assert.ok(paid.rows.some((r: any) => r._id === e._id));
      const unpaid = await ok(reviewer, 'GET', '/expenses?view=payments&paymentStatus=outstanding&limit=100'); assert.ok(!unpaid.rows.some((r: any) => r._id === e._id));
      e = await ok(reviewer, 'POST', `/expenses/${e._id}/payments/${e.payments[0]._id}/reverse`, { version: e.version, dateKey: today, reason: 'Restore historical invoice outstanding' }); assert.equal(e.outstandingMinor, 3325);
    });
    await t.test('client feature grants isolate request types, loan operations, reversals and reopening', async () => {
      const leaveReviewer = await account('LeaveOnly', 'admin', ['payroll_leave_requests']);
      const leave = await ok(leaveReviewer, 'GET', '/payroll/requests'); assert.ok(leave.every((r: any) => r.kind === 'leave'));
      await ok(leaveReviewer, 'GET', '/payroll/request-employees');
      assert.equal((await request(leaveReviewer, 'POST', '/payroll/requests', { employeeId: String(employee._id), kind: 'loan', reason: 'Forbidden type', data: { amount: 100, installment: 10, startMonth: '2026-10' } })).status, 403);
      assert.equal((await request(leaveReviewer, 'GET', '/payroll/runs')).status, 403);
      const loanOperator = await account('LoansOnly', 'admin', ['payroll_loans_view', 'payroll_loans_manage']);
      await ok(loanOperator, 'GET', '/payroll/loans'); await ok(loanOperator, 'GET', '/payroll/employees');
      assert.equal((await request(loanOperator, 'GET', '/payroll/runs')).status, 403); assert.equal((await request(loanOperator, 'GET', '/payroll/employees/' + employee._id)).status, 403);
      const cashier = await account('CashierOnly', 'admin', ['finance_pay']);
      const privateDraft = await ok(staff, 'POST', '/expenses', { ...draft(), title: 'Private pending draft' });
      assert.equal((await request(cashier, 'GET', '/expenses/' + privateDraft._id)).status, 404);
      assert.equal((await ok(cashier, 'GET', '/expenses?search=Private')).total, 0);
      assert.equal((await request(cashier, 'POST', `/expenses/${expense._id}/payments/${expense.payments[0]._id}/reverse`, { version: expense.version, dateKey: today, reason: 'Unauthorized reversal' })).status, 403);
      const closer = await account('CloseOnly', 'admin', ['finance_period_close']);
      assert.equal((await request(closer, 'POST', '/finance/periods', { month: '2026-08', closed: false, reason: 'Unauthorized reopen' })).status, 403);
      const reverser = await account('SalaryReverseOnly', 'admin', ['payroll_payment_reverse']);
      await ok(reverser, 'GET', '/payroll/payments'); assert.equal((await request(reverser, 'GET', '/payroll/runs')).status, 403);
    });
    if (process.env.FINANCE_PREVIEW === '1') {
      await Employee.create({ businessId: business._id, employeeCode: 'EMP-BROWSER', fullName: 'Enrollment Browser QA', joiningDate: '2026-01-01', salary: 2500, payrollEnrolled: false });
      await account('SetupOnly', 'admin', ['payroll_settings']);
      console.log('Disposable preview ready at http://127.0.0.1:5052. Synthetic accounts: owner@finance.example.com, preparer@finance.example.com, reviewer@finance.example.com, employee@finance.example.com; password FinanceTest!234');
      await new Promise<void>(resolve => app.post('/__preview/close', (_req, res) => { res.json({ closed: true }); resolve(); }));
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await mongoose.disconnect(); await replica.stop(); }
});
