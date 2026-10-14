import type { ScreenPermission } from './screenPermissions';
export interface WorkflowScreen { path: string; title: string; description: string; permissions: ScreenPermission[] }
export const payrollScreens: WorkflowScreen[] = [
  { path: '/payroll/settings', title: '1. Payroll Settings', description: 'Confirm currency, working rules, holidays and leave entitlements.', permissions: ['payroll_settings'] },
  { path: '/payroll/employees', title: '2. Employee Salaries', description: 'Enroll employees and maintain salary history and schedules.', permissions: ['payroll_view', 'payroll_settings'] },
  { path: '/payroll/leave-requests', title: 'Leave Requests', description: 'Submit and review leave, including half days and balance checks.', permissions: ['payroll_hr', 'payroll_leave_requests'] },
  { path: '/payroll/loan-requests', title: 'Loan & Advance Requests', description: 'Review requested amounts, installments and recovery start dates.', permissions: ['payroll_hr', 'payroll_loan_requests'] },
  { path: '/payroll/work-requests', title: 'Overtime & Attendance Requests', description: 'Resolve work and attendance exceptions before calculating pay.', permissions: ['payroll_hr', 'payroll_work_requests'] },
  { path: '/payroll/loans', title: 'Loan Disbursements & Recovery', description: 'Disburse approved loans, record repayments and inspect balances.', permissions: ['payroll_view', 'payroll_loans_view', 'payroll_loans_manage'] },
  { path: '/payroll/runs', title: '3. Salary Runs & Approvals', description: 'Create, calculate, submit and independently approve monthly pay.', permissions: ['payroll_view', 'payroll_prepare', 'payroll_approve'] },
  { path: '/payroll/payments', title: '4. Salary Payments', description: 'Record partial or full payments and controlled reversals.', permissions: ['payroll_pay', 'payroll_payment_reverse'] },
  { path: '/payroll/reports', title: 'Payroll Expense & Reports', description: 'Review approved salary costs, leave, commissions and loan recovery.', permissions: ['payroll_reports'] },
];
export const financeScreens: WorkflowScreen[] = [
  { path: '/finance/accounts', title: '1. Chart of Accounts', description: 'Set the accounting starting date and organize group and posting accounts.', permissions: ['finance_accounts', 'finance_settings'] },
  { path: '/finance/opening-balances', title: 'Opening Balance Allocation', description: 'Link reviewed historical salary, expense and loan balances to a posted opening journal.', permissions: ['finance_settings'] },
  { path: '/finance/expenses', title: 'Expense Register', description: 'Review business expenses, receipts, categories and payment balances.', permissions: ['finance_view'] },
  { path: '/finance/my-expenses', title: '2. My Expense Submissions', description: 'Create a draft, attach evidence, choose its account and submit for review.', permissions: ['finance_expense_create'] },
  { path: '/finance/expense-approvals', title: '3. Expense Approvals', description: 'Approve, return or reject another person’s submitted expense.', permissions: ['finance_expense_approve'] },
  { path: '/finance/expense-payments', title: '4. Expense Payments', description: 'Settle approved expenses from cash, bank or the open POS drawer.', permissions: ['finance_pay', 'finance_expense_reverse', 'finance_expense_void'] },
  { path: '/finance/journals', title: 'Journals & Opening Balances', description: 'Prepare balanced entries, review postings and record reversals.', permissions: ['finance_journal_view', 'finance_journal_prepare', 'finance_journal_approve'] },
  { path: '/finance/reports', title: 'Accounting Reports', description: 'Trial balance, income and expenses, balance sheet and account ledger.', permissions: ['finance_reports'] },
  { path: '/finance/periods', title: 'Period Close', description: 'Lock a reviewed month or reopen it with a recorded reason.', permissions: ['finance_period_close', 'finance_period_reopen'] },
];
export const personalScreens: WorkflowScreen[] = [
  { path: '/my-payroll', title: 'My Payslips & Payments', description: 'View released salary slips and recorded payments.', permissions: ['self_payroll'] },
  { path: '/my/leave-requests', title: 'My Leave Requests', description: 'Check leave balances and request full or half-day leave.', permissions: ['self_leave'] },
  { path: '/my/loan-requests', title: 'My Loan & Advance Requests', description: 'Request an amount and repayment schedule; track approval and outstanding loans.', permissions: ['self_loan'] },
  { path: '/my/overtime-requests', title: 'My Overtime Requests', description: 'Request approval of extra work and track decisions.', permissions: ['self_overtime'] },
  { path: '/finance/my-expenses', title: 'My Expenses', description: 'Submit receipts and track expense approval and reimbursement.', permissions: ['finance_expense_create'] },
];
