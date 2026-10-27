import type { User } from '../features/auth/authSlice';

export const ADMIN_SCREEN_PERMISSIONS = [
    { key: 'self_payroll', label: 'My Payslips & Payments', group: 'Employee Self Service' },
    { key: 'self_leave', label: 'My Leave Requests', group: 'Employee Self Service' },
    { key: 'self_loan', label: 'My Loan & Advance Requests', group: 'Employee Self Service' },
    { key: 'self_overtime', label: 'My Overtime Requests', group: 'Employee Self Service' },
    { key: 'finance_expense_create', label: 'Expenses: Create & Submit Own', group: 'Finance' },
    { key: 'finance_accounts', label: 'Chart of Accounts: View', group: 'Finance' },
    { key: 'finance_settings', label: 'Finance: Setup & Manage Accounts', group: 'Finance' },
    { key: 'finance_journal_view', label: 'Journals: View', group: 'Finance' },
    { key: 'finance_journal_prepare', label: 'Journals: Prepare', group: 'Finance' },
    { key: 'finance_journal_approve', label: 'Journals: Post & Reverse', group: 'Finance' },
    { key: 'finance_reports', label: 'Finance: Accounting Reports', group: 'Finance' },
    { key: 'finance_period_close', label: 'Finance: Close Periods', group: 'Finance' },
    { key: 'finance_view', label: 'Finance: View All Expenses', group: 'Finance' },
    { key: 'finance_expense_approve', label: 'Finance: Approve Expenses', group: 'Finance' },
    { key: 'finance_pay', label: 'Finance: Expense Payments', group: 'Finance' },
    { key: 'finance_expense_reverse', label: 'Expenses: Reverse Payments', group: 'Finance' },
    { key: 'finance_expense_void', label: 'Expenses: Void Approved Costs', group: 'Finance' },
    { key: 'finance_period_reopen', label: 'Finance: Reopen Closed Periods', group: 'Finance' },
    { key: 'payroll_payment_reverse', label: 'Payroll: Reverse Salary Payments', group: 'Payroll' },
    { key: 'payroll_leave_requests', label: 'HR: Leave Requests', group: 'Payroll' },
    { key: 'payroll_loan_requests', label: 'HR: Loan & Advance Requests', group: 'Payroll' },
    { key: 'payroll_work_requests', label: 'HR: Overtime & Attendance Requests', group: 'Payroll' },
    { key: 'payroll_loans_view', label: 'Loans: View Balances & Movements', group: 'Payroll' },
    { key: 'payroll_loans_manage', label: 'Loans: Disburse, Repay & Cancel', group: 'Payroll' },
    { key: 'payroll_view', label: 'Payroll: View', group: 'Payroll' },
    { key: 'payroll_prepare', label: 'Payroll: Prepare', group: 'Payroll' },
    { key: 'payroll_approve', label: 'Payroll: Approve', group: 'Payroll' },
    { key: 'payroll_pay', label: 'Payroll: Payments', group: 'Payroll' },
    { key: 'payroll_reports', label: 'Payroll: Reports', group: 'Payroll' },
    { key: 'payroll_settings', label: 'Payroll: Settings & Salaries', group: 'Payroll' },
    { key: 'payroll_hr', label: 'HR: All Request Types (broad access)', group: 'Payroll' },
    { key: 'dashboard', label: 'Dashboard', group: 'Overview' },
    { key: 'pos', label: 'POS Terminal', group: 'Sales' },
    { key: 'orders', label: 'Order Desk', group: 'Sales' },
    { key: 'digital_menus', label: 'Digital Menus', group: 'Sales' },
    { key: 'transactions', label: 'Transactions', group: 'Sales' },
    { key: 'inventory', label: 'Inventory', group: 'Inventory' },
    { key: 'inventory_categories', label: 'Categories', group: 'Inventory' },
    { key: 'inventory_add', label: 'Add Product', group: 'Inventory' },
    { key: 'inventory_import', label: 'Import Products', group: 'Inventory' },
    { key: 'inventory_units', label: 'Product Units', group: 'Inventory' },
    { key: 'inventory_requests', label: 'Inventory Requests', group: 'Inventory' },
    { key: 'inventory_reduce', label: 'Reduce Stock', group: 'Inventory' },
    { key: 'customers', label: 'Customers', group: 'Customers & Credit' },
    { key: 'customer_records', label: 'Customer Records', group: 'Customers & Credit' },
    { key: 'credits', label: 'Credit Customers', group: 'Customers & Credit' },
    { key: 'installments', label: 'Installments', group: 'Customers & Credit' },
    { key: 'reports', label: 'Reports', group: 'Operations' },
    { key: 'notes', label: 'Sticky Notes', group: 'Operations' },
    { key: 'notifications', label: 'Notifications', group: 'Operations' },
    { key: 'employees', label: 'Employee Profiles', group: 'HR & Attendance' },
    { key: 'attendance', label: 'Attendance', group: 'HR & Attendance' },
    { key: 'team', label: 'Team Management', group: 'Administration' },
    { key: 'organization', label: 'Organization', group: 'Administration' },
    { key: 'settings', label: 'Settings', group: 'Administration' },
] as const;

export type ScreenPermission = typeof ADMIN_SCREEN_PERMISSIONS[number]['key'];

export const ALL_ADMIN_SCREEN_KEYS = ADMIN_SCREEN_PERMISSIONS.map((permission) => permission.key);

// Finance and payroll actions are granted one by one; viewing never implies approval or payment rights.
export const toggleScreenPermission = (current: ScreenPermission[], key: ScreenPermission): ScreenPermission[] =>
    current.includes(key) ? current.filter((item) => item !== key) : [...current, key];

export const hasExplicitScreenPermission =(user: User | null | undefined, permission: ScreenPermission) =>
    user?.role === 'admin' && Boolean(user.screenPermissions?.includes(permission));

export const hasInstallmentAccess = (user: User | null | undefined, installmentsEnabled?: boolean) =>
    user?.role === 'super_admin' || hasExplicitScreenPermission(user, 'installments') || Boolean(installmentsEnabled && user?.installmentAccess);

export const getDigitalMenuAccess = (user: User | null | undefined): 'none' | 'menu' | 'pos' => {
    if (!user) return 'none';
    if (user.role === 'super_admin') return 'pos';
    if (user.role === 'admin' && user.screenPermissions != null) {
        if (!user.screenPermissions.includes('digital_menus')) return 'none';
        return 'pos';
    }
    return user.digitalMenuAccess || 'none';
};

export const hasScreenAccess = (user: User | null | undefined, permission: ScreenPermission) => {
    if (!user) return false;
    if (permission.startsWith('self_') || permission === 'finance_expense_create') return user.role === 'super_admin' || Boolean(user.screenPermissions?.includes(permission));
    if (permission.startsWith('payroll_') || permission.startsWith('finance_')) return user.role === 'super_admin' || (user.role === 'admin' && Boolean(user.screenPermissions?.includes(permission)));
    if (!user || user.role !== 'admin') return true;
    // Organization was always available before client onboarding introduced its control.
    if (permission === 'organization' && (user.screenPermissionsVersion ?? 1) < 3) return true;
    // null/undefined preserves full access for existing Admin accounts until
    // the Super Admin explicitly saves a permission assignment.
    return user.screenPermissions == null || user.screenPermissions.includes(permission);
};

