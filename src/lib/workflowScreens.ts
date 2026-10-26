import type { ScreenPermission } from './screenPermissions';
export interface WorkflowScreen { path: string; title: string; description: string; permissions: ScreenPermission[] }
export const payrollScreens: WorkflowScreen[] = [
  { path: '/payroll/settings', title: 'Payroll Settings', description: 'Set currency, work hours, holidays and leave days.', permissions: ['payroll_settings'] },
  { path: '/payroll/employees', title: 'Employee Salaries', description: 'Add salaries and enroll employees for payroll.', permissions: ['payroll_view', 'payroll_settings'] },
  { path: '/payroll/leave-requests', title: 'Leave Requests', description: 'Request leave and check available days.', permissions: ['payroll_hr', 'payroll_leave_requests'] },
  { path: '/payroll/loan-requests', title: 'Loan & Advance Requests', description: 'Review loan amounts and repayment plans.', permissions: ['payroll_hr', 'payroll_loan_requests'] },
  { path: '/payroll/work-requests', title: 'Overtime & Attendance Requests', description: 'Review overtime and attendance before calculating pay.', permissions: ['payroll_hr', 'payroll_work_requests'] },
  { path: '/payroll/loans', title: 'Loan Payments & Recovery', description: 'Record loan payments, repayments and balances.', permissions: ['payroll_view', 'payroll_loans_view', 'payroll_loans_manage'] },
  { path: '/payroll/runs', title: 'Salary Runs & Approvals', description: 'Calculate and submit salaries. A Super Admin or an admin with Payroll: Approve can approve them.', permissions: ['payroll_view', 'payroll_prepare', 'payroll_approve'] },
  { path: '/payroll/payments', title: 'Salary Payments', description: 'Record salary payments or reverse a mistake.', permissions: ['payroll_pay', 'payroll_payment_reverse'] },
  { path: '/payroll/reports', title: 'Payroll Expense & Reports', description: 'View salary costs, leave, commissions and loan repayments.', permissions: ['payroll_reports'] },
];
export const expenseScreens: WorkflowScreen[] = [
  { path: '/finance/my-expenses', title: 'My Expenses', description: 'Add an expense and receipt, then send it for approval.', permissions: ['finance_expense_create'] },
  { path: '/finance/expense-approvals', title: 'Expense Approvals', description: 'Approve, reject or return expenses for changes.', permissions: ['finance_expense_approve'] },
  { path: '/finance/expense-payments', title: 'Expense Payments', description: 'Record approved expense payments from cash, bank or the POS drawer.', permissions: ['finance_pay', 'finance_expense_reverse', 'finance_expense_void'] },
  { path: '/finance/expenses', title: 'Expense Register', description: 'View expenses, receipts and unpaid amounts.', permissions: ['finance_view'] },
];
export const financeScreens: WorkflowScreen[] = [
  { path: '/finance/accounts', title: 'Chart of Accounts', description: 'Set the finance start date and manage accounts.', permissions: ['finance_accounts', 'finance_settings'] },
  { path: '/finance/journals', title: 'Journals & Opening Balances', description: 'Create journal entries and send them to another admin for approval.', permissions: ['finance_journal_view', 'finance_journal_prepare', 'finance_journal_approve'] },
  { path: '/finance/opening-balances', title: 'Opening Balance Allocation', description: 'Match old unpaid salaries, expenses and loans to opening balances.', permissions: ['finance_settings'] },
  { path: '/finance/reports', title: 'Accounting Reports', description: 'View balances, income, expenses and account history.', permissions: ['finance_reports'] },
  { path: '/finance/periods', title: 'Period Close', description: 'Close a month to stop new entries, or reopen it with a reason.', permissions: ['finance_period_close', 'finance_period_reopen'] },
];
export const personalScreens: WorkflowScreen[] = [
  { path: '/my/payslips', title: 'My Payslips', description: 'View approved salary slips and download a PDF.', permissions: ['self_payroll'] },
  { path: '/my/salary-payments', title: 'My Salary Payments', description: 'View your salary payment dates and references.', permissions: ['self_payroll'] },
  { path: '/my/leave-requests', title: 'My Leave Requests', description: 'Check leave balances and request full or half-day leave.', permissions: ['self_leave'] },
  { path: '/my/loan-requests', title: 'My Loan & Advance Requests', description: 'Request a loan and track approval and repayments.', permissions: ['self_loan'] },
  { path: '/my/overtime-requests', title: 'My Overtime Requests', description: 'Request overtime and track approval.', permissions: ['self_overtime'] },
];

export const workflowGroups = [
  { id: 'payroll', title: 'Payroll', path: '/payroll', screens: payrollScreens },
  { id: 'personal', title: 'My Payroll', path: '/my', screens: personalScreens },
  { id: 'expenses', title: 'Expenses', path: '/expenses', screens: expenseScreens },
  { id: 'finance', title: 'Finance', path: '/finance', screens: financeScreens },
] as const;
export type WorkflowArea = typeof workflowGroups[number]['id'];

const nextPaths: Record<string, string> = {
  '/payroll/settings': '/payroll/employees',
  '/payroll/employees': '/payroll/runs',
  '/payroll/runs': '/payroll/payments',
  '/payroll/payments': '/payroll/reports',
  '/finance/my-expenses': '/finance/expense-approvals',
  '/finance/expense-approvals': '/finance/expense-payments',
  '/finance/expense-payments': '/finance/expenses',
  '/finance/accounts': '/finance/journals',
  '/finance/journals': '/finance/opening-balances',
  '/finance/opening-balances': '/finance/reports',
  '/finance/reports': '/finance/periods',
};
export const nextWorkflowScreen = (path: string) => workflowGroups.flatMap(g => [...g.screens]).find(s => s.path === nextPaths[path]);
