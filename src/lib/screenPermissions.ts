import type { User } from '../features/auth/authSlice';

export const ADMIN_SCREEN_PERMISSIONS = [
    { key: 'finance_view', label: 'Finance: View All Expenses', group: 'Finance' },
    { key: 'finance_expense_approve', label: 'Finance: Approve Expenses', group: 'Finance' },
    { key: 'finance_pay', label: 'Finance: Expense Payments', group: 'Finance' },
    { key: 'payroll_view', label: 'Payroll: View', group: 'Payroll' },
    { key: 'payroll_prepare', label: 'Payroll: Prepare', group: 'Payroll' },
    { key: 'payroll_approve', label: 'Payroll: Approve', group: 'Payroll' },
    { key: 'payroll_pay', label: 'Payroll: Payments', group: 'Payroll' },
    { key: 'payroll_reports', label: 'Payroll: Reports', group: 'Payroll' },
    { key: 'payroll_settings', label: 'Payroll: Settings & Salaries', group: 'Payroll' },
    { key: 'payroll_hr', label: 'Payroll: HR Requests', group: 'Payroll' },
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
    { key: 'settings', label: 'Settings', group: 'Administration' },
] as const;

export type ScreenPermission = typeof ADMIN_SCREEN_PERMISSIONS[number]['key'];

export const ALL_ADMIN_SCREEN_KEYS = ADMIN_SCREEN_PERMISSIONS.map((permission) => permission.key);

export const hasExplicitScreenPermission = (user: User | null | undefined, permission: ScreenPermission) =>
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
    if (permission.startsWith('payroll_') || permission.startsWith('finance_')) return user?.role === 'super_admin' || (user?.role === 'admin' && Boolean(user.screenPermissions?.includes(permission)));
    if (!user || user.role !== 'admin') return true;
    // null/undefined preserves full access for existing Admin accounts until
    // the Super Admin explicitly saves a permission assignment.
    return user.screenPermissions == null || user.screenPermissions.includes(permission);
};

