export const ADMIN_SCREEN_PERMISSIONS = [
    'expenses', 'my_payroll',
    'finance_view', 'finance_expense_approve', 'finance_pay',
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

