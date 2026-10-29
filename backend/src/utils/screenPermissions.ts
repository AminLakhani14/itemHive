export const ADMIN_SCREEN_PERMISSIONS = [
    'self_payroll', 'self_leave', 'self_loan', 'self_overtime',
    'finance_expense_create', 'finance_accounts', 'finance_settings', 'finance_journal_view', 'finance_journal_prepare', 'finance_journal_approve', 'finance_reports', 'finance_period_close',
    'finance_view', 'finance_expense_approve', 'finance_pay',
    'finance_expense_reverse', 'finance_expense_void', 'finance_period_reopen',
    'payroll_payment_reverse', 'payroll_leave_requests', 'payroll_loan_requests', 'payroll_work_requests', 'payroll_loans_view', 'payroll_loans_manage',
    'payroll_view', 'payroll_prepare', 'payroll_approve', 'payroll_pay', 'payroll_reports', 'payroll_settings', 'payroll_hr',
    'dashboard',
    'pos',
    'inventory',
    'inventory_categories',
    'inventory_add',
    'inventory_import',
    'inventory_units',
    'inventory_requests',
    'inventory_reduce',
    'orders',
    'digital_menus',
    'transactions',
    'customers',
    'customer_records',
    'credits',
    'installments',
    'reports',
    'notes',
    'notifications',
    'employees',
    'attendance',
    'team',
    'organization',
    'settings',
] as const;

export type AdminScreenPermission = typeof ADMIN_SCREEN_PERMISSIONS[number];

export const isAdminScreenPermission = (value: unknown): value is AdminScreenPermission =>
    typeof value === 'string' && ADMIN_SCREEN_PERMISSIONS.includes(value as AdminScreenPermission);

