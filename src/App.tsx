import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './store';
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import getAppTheme from './theme/theme';
import { useSelector } from 'react-redux';
import type { RootState } from './store';
import ScrollToTop from './components/Common/ScrollToTop';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from './store';
import { fetchSettings } from './features/settings/settingsSlice';
import { logout, refreshCurrentUser } from './features/auth/authSlice';
import { hasScreenAccess } from './lib/screenPermissions';
import { payrollScreens, financeScreens, personalScreens, expenseScreens } from './lib/workflowScreens';
import { notificationScreenPermissions } from './lib/workflowNotifications';

// Lazy load pages for better performance i LOVE YOU
import Login from './pages/Auth/Login';
const Dashboard = React.lazy(() => import('./pages/Dashboard/Dashboard'));
const ProductList = React.lazy(() => import('./pages/Inventory/ProductList'));
const AddProduct = React.lazy(() => import('./pages/Inventory/AddProduct'));
const ImportProducts = React.lazy(() => import('./pages/Inventory/ImportProducts'));
const ReduceStock = React.lazy(() => import('./pages/Inventory/ReduceStock'));
const ProductUnitsPage = React.lazy(() => import('./pages/Inventory/ProductUnitsPage'));
const POSTerminal = React.lazy(() => import('./pages/POS/POSTerminal'));
const TransactionHistory = React.lazy(() => import('./pages/Transactions/TransactionHistory'));
const ReportsPage = React.lazy(() => import('./pages/Reports/ReportsPage'));
const Signup = React.lazy(() => import('./pages/Auth/Signup'));
const OrderDesk = React.lazy(() => import('./pages/Orders/OrderDesk'));
const OrderDraftsPage = React.lazy(() => import('./pages/Orders/OrderDraftsPage'));
const POSShiftReportsPage = React.lazy(() => import('./pages/POS/POSShiftReportsPage'));
const SettingsPage = React.lazy(() => import('./pages/Settings/SettingsPage'));
const ThemeSettingsPage = React.lazy(() => import('./pages/Settings/ThemeSettingsPage'));
const ProfilePage = React.lazy(() => import('./pages/Profile/ProfilePage'));
const CustomersPage = React.lazy(() => import('./pages/Customers/CustomersPage'));
const CustomerRecordsPage = React.lazy(() => import('./pages/Customers/CustomerRecordsPage'));
const CreditCustomersPage = React.lazy(() => import('./pages/Credit/CreditCustomersPage'));
const InstallmentsPage = React.lazy(() => import('./pages/Installments/InstallmentsPage'));
const EmployeesPage = React.lazy(() => import('./pages/Employees/EmployeesPage'));
const EmployeeProfilePage = React.lazy(() => import('./pages/Employees/EmployeeProfilePage'));
const AttendancePage = React.lazy(() => import('./pages/Attendance/AttendancePage'));
const PayrollPage = React.lazy(() => import('./pages/Payroll/PayrollPage'));
const MyPayrollPage = React.lazy(() => import('./pages/Payroll/MyPayrollPage'));
const WorkflowHomePage = React.lazy(() => import('./pages/Payroll/WorkflowHomePage'));
const RequestsPage = React.lazy(() => import('./pages/Payroll/RequestsPage'));
const AccountsPage = React.lazy(() => import('./pages/Finance/AccountsPage'));
const OpeningSourcesPage = React.lazy(() => import('./pages/Finance/OpeningSourcesPage'));
const JournalsPage = React.lazy(() => import('./pages/Finance/JournalsPage'));
const FinanceReportsPage = React.lazy(() => import('./pages/Finance/FinanceReportsPage'));
const PeriodsPage = React.lazy(() => import('./pages/Finance/PeriodsPage'));
const WorkflowManualPage = React.lazy(() => import('./pages/Payroll/WorkflowManualPage'));
const ExpensesPage = React.lazy(() => import('./pages/Finance/ExpensesPage'));
const NotificationsPage = React.lazy(() => import('./pages/Notifications/NotificationsPage'));
const StickyNotes = React.lazy(() => import('./pages/Notes/StickyNotes'));
const TeamManagementPage = React.lazy(() => import('./pages/Admin/TeamManagementPage'));
const CreateClientPage = React.lazy(() => import('./pages/Admin/CreateClientPage'));
const EditClientPage = React.lazy(() => import('./pages/Admin/EditClientPage'));
const ManageAccountPage = React.lazy(() => import('./pages/Admin/ManageAccountPage'));
const SignupRequestsPage = React.lazy(() => import('./pages/Admin/SignupRequestsPage'));
const InventoryRequestsPage = React.lazy(() => import('./pages/Inventory/InventoryRequestsPage'));
const VendorsPage = React.lazy(() => import('./pages/Inventory/VendorsPage'));
const VendorHistoryPage = React.lazy(() => import('./pages/Inventory/VendorHistoryPage'));
const PermissionManagementPage = React.lazy(() => import('./pages/Admin/PermissionManagementPage'));
const OrganizationOverviewPage = React.lazy(() => import('./pages/Organization/OrganizationOverviewPage'));
const DepartmentsPage = React.lazy(() => import('./pages/Organization/DepartmentsPage'));
const BranchesPage = React.lazy(() => import('./pages/Organization/BranchesPage'));
const FiscalYearsPage = React.lazy(() => import('./pages/Organization/FiscalYearsPage'));
const AccessDeniedPage = React.lazy(() => import('./pages/Auth/AccessDeniedPage'));
const DigitalMenusPage = React.lazy(() => import('./pages/DigitalMenus/DigitalMenusPage'));
const CreateDigitalMenuPage = React.lazy(() => import('./pages/DigitalMenus/CreateDigitalMenuPage'));
const PublicMenuPage = React.lazy(() => import('./pages/DigitalMenus/PublicMenuPage'));
// Keep route elements stable during color previews. Only theme consumers need updates.
const AppThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const mode = useSelector((state: RootState) => state.theme.mode);
  const appearance = useSelector((state: RootState) => {
    const preview = state.themePreview.value;
    return preview && preview.userId === state.auth.user?.id
      ? preview.appearance
      : state.auth.user?.appearance;
  });
  const theme = React.useMemo(() => getAppTheme(mode, appearance), [mode, appearance]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

const HomeRoute = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  if (hasScreenAccess(user, 'dashboard')) return <Dashboard />;
  for (const [path, screens] of [['/payroll', payrollScreens], ['/finance', financeScreens], ['/my', personalScreens], ['/expenses', expenseScreens]] as const) {
    if (screens.some(screen => screen.permissions.some(permission => hasScreenAccess(user, permission)))) return <Navigate to={path} replace />;
  }
  return <Navigate to="/profile" replace />;
};

const AppContent: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const themeManaged = useSelector((state: RootState) => Boolean(state.auth.user?.themeManaged));
  const { app } = useSelector((state: RootState) => state.settings);


  useEffect(() => {
    if (isAuthenticated) {
      dispatch(refreshCurrentUser());
      dispatch(fetchSettings());
    }
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    const handleAuthExpired = () => dispatch(logout());
    window.addEventListener('itemhive-auth-expired', handleAuthExpired);
    return () => window.removeEventListener('itemhive-auth-expired', handleAuthExpired);
  }, [dispatch]);

  return (
    <AppThemeProvider>
      <BrowserRouter>
        <ScrollToTop />
        <React.Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/menu/:token" element={<PublicMenuPage />} />

            <Route path="/" element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }>
              <Route index element={<HomeRoute />} />
              <Route path="inventory" element={<ProtectedRoute requiredScreen="inventory"><ProductList /></ProtectedRoute>} />
              <Route path="inventory/categories" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="inventory_categories"><Navigate to="/settings#categories" replace /></ProtectedRoute>} />
              <Route path="inventory/add" element={<ProtectedRoute requiredScreen="inventory_add"><AddProduct /></ProtectedRoute>} />
              <Route path="inventory/import" element={<ProtectedRoute requiredScreen="inventory_import"><ImportProducts /></ProtectedRoute>} />
              <Route path="inventory/units" element={<ProtectedRoute requiredScreen="inventory_units"><ProductUnitsPage /></ProtectedRoute>} />
              <Route path="inventory/requests" element={<ProtectedRoute requiredScreen="inventory_requests"><InventoryRequestsPage /></ProtectedRoute>} />
              <Route path="vendors" element={<ProtectedRoute requiredScreen="inventory_requests"><VendorsPage /></ProtectedRoute>} />
              <Route path="vendor-history" element={<ProtectedRoute requiredScreen="inventory_requests"><VendorHistoryPage /></ProtectedRoute>} />
              <Route path="inventory/reduce" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="inventory_reduce">
                  <ReduceStock />
                </ProtectedRoute>
              } />
              <Route path="pos" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="pos">
                  <POSTerminal />
                </ProtectedRoute>
              } />
              <Route path="orders" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="orders">
                  <OrderDesk />
                </ProtectedRoute>
              } />
              <Route path="digital-menus" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="digital_menus" requireDigitalMenuAccess><DigitalMenusPage /></ProtectedRoute>} />
              <Route path="digital-menus/create" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="digital_menus" requireDigitalMenuAccess><CreateDigitalMenuPage /></ProtectedRoute>} />
              <Route path="digital-menus/:id/edit" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="digital_menus" requireDigitalMenuAccess><CreateDigitalMenuPage /></ProtectedRoute>} />
              <Route path="digital-menus/:id/preview" element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="digital_menus" requireDigitalMenuAccess><PublicMenuPage /></ProtectedRoute>} />
              <Route path="transactions" element={<ProtectedRoute requiredScreen="transactions"><TransactionHistory /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="reports"><ReportsPage /></ProtectedRoute>} />
              <Route path="notes" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="notes">
                  <StickyNotes />
                </ProtectedRoute>
              } />
              <Route path="customers" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="customers">
                  <CustomersPage />
                </ProtectedRoute>
              } />
              <Route path="customer-records" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="customer_records">
                  <CustomerRecordsPage />
                </ProtectedRoute>
              } />
              <Route path="credits" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="credits">
                  <CreditCustomersPage />
                </ProtectedRoute>
              } />
              <Route path="installments" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requireInstallmentAccess requiredScreen="installments">
                  <InstallmentsPage />
                </ProtectedRoute>
              } />
              <Route path="employees" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="employees">
                  <EmployeesPage />
                </ProtectedRoute>
              } />
              <Route path="payroll" element={<ProtectedRoute><WorkflowHomePage area="payroll" /></ProtectedRoute>} />
              <Route path="payroll/employees" element={<ProtectedRoute requiredScreens={["payroll_view","payroll_settings"]}><PayrollPage key="payroll/employees" section="overview" /></ProtectedRoute>} />
              <Route path="payroll/runs" element={<ProtectedRoute requiredScreens={["payroll_view","payroll_prepare","payroll_approve"]}><PayrollPage key="payroll/runs" section="runs" /></ProtectedRoute>} />
              <Route path="payroll/loans" element={<ProtectedRoute requiredScreens={["payroll_view","payroll_loans_view","payroll_loans_manage"]}><PayrollPage key="payroll/loans" section="loans" /></ProtectedRoute>} />
              <Route path="payroll/payments" element={<ProtectedRoute requiredScreens={["payroll_pay","payroll_payment_reverse"]}><PayrollPage key="payroll/payments" section="payments" /></ProtectedRoute>} />
              <Route path="payroll/reports" element={<ProtectedRoute requiredScreens={["payroll_reports"]}><PayrollPage key="payroll/reports" section="reports" /></ProtectedRoute>} />
              <Route path="payroll/settings" element={<ProtectedRoute requiredScreens={["payroll_settings"]}><PayrollPage key="payroll/settings" section="settings" /></ProtectedRoute>} />
              <Route path="payroll/leave-requests" element={<ProtectedRoute requiredScreens={["payroll_hr","payroll_leave_requests"]}><RequestsPage key="payroll/leave-requests" kind="leave" self={false} /></ProtectedRoute>} />
              <Route path="payroll/loan-requests" element={<ProtectedRoute requiredScreens={["payroll_hr","payroll_loan_requests"]}><RequestsPage key="payroll/loan-requests" kind="loan" self={false} /></ProtectedRoute>} />
              <Route path="payroll/work-requests" element={<ProtectedRoute requiredScreens={["payroll_hr","payroll_work_requests"]}><RequestsPage key="payroll/work-requests" kind="work" self={false} /></ProtectedRoute>} />
              <Route path="my/leave-requests" element={<ProtectedRoute requiredScreen="self_leave"><RequestsPage key="my/leave-requests" kind="leave" self={true} /></ProtectedRoute>} />
              <Route path="my/loan-requests" element={<ProtectedRoute requiredScreen="self_loan"><RequestsPage key="my/loan-requests" kind="loan" self={true} /></ProtectedRoute>} />
              <Route path="my/overtime-requests" element={<ProtectedRoute requiredScreen="self_overtime"><RequestsPage key="my/overtime-requests" kind="work" self={true} /></ProtectedRoute>} />
              <Route path="finance" element={<ProtectedRoute><WorkflowHomePage area="finance" /></ProtectedRoute>} />
              <Route path="finance/accounts" element={<ProtectedRoute requiredScreens={["finance_accounts","finance_settings"]}><AccountsPage /></ProtectedRoute>} />
              <Route path="finance/opening-balances" element={<ProtectedRoute requiredScreen="finance_settings"><OpeningSourcesPage /></ProtectedRoute>} />
              <Route path="finance/journals" element={<ProtectedRoute requiredScreens={["finance_journal_view","finance_journal_prepare","finance_journal_approve"]}><JournalsPage /></ProtectedRoute>} />
              <Route path="finance/reports" element={<ProtectedRoute requiredScreens={["finance_reports"]}><FinanceReportsPage /></ProtectedRoute>} />
              <Route path="finance/periods" element={<ProtectedRoute requiredScreens={["finance_period_close","finance_period_reopen"]}><PeriodsPage /></ProtectedRoute>} />
              <Route path="finance/expenses" element={<ProtectedRoute requiredScreen="finance_view"><ExpensesPage key="finance/expenses" view="register" /></ProtectedRoute>} />
              <Route path="finance/my-expenses" element={<ProtectedRoute requiredScreen="finance_expense_create"><ExpensesPage key="finance/my-expenses" view="mine" /></ProtectedRoute>} />
              <Route path="finance/expense-approvals" element={<ProtectedRoute requiredScreen="finance_expense_approve"><ExpensesPage key="finance/expense-approvals" view="approvals" /></ProtectedRoute>} />
              <Route path="finance/expense-payments" element={<ProtectedRoute requiredScreens={["finance_pay","finance_expense_reverse","finance_expense_void"]}><ExpensesPage key="finance/expense-payments" view="payments" /></ProtectedRoute>} />
              <Route path="my" element={<ProtectedRoute><WorkflowHomePage area="personal" /></ProtectedRoute>} />
              <Route path="my-payroll" element={<ProtectedRoute requiredScreen="self_payroll"><Navigate replace to="/my/payslips" /></ProtectedRoute>} />
              <Route path="my/payslips" element={<ProtectedRoute requiredScreen="self_payroll"><MyPayrollPage key="my/payslips" /></ProtectedRoute>} />
              <Route path="my/salary-payments" element={<ProtectedRoute requiredScreen="self_payroll"><MyPayrollPage key="my/salary-payments" section="payments" /></ProtectedRoute>} />
              <Route path="expenses" element={<ProtectedRoute><WorkflowHomePage area="expenses" /></ProtectedRoute>} />
              <Route path="workflow-manual" element={<ProtectedRoute><WorkflowManualPage /></ProtectedRoute>} />
              {/* One route for "new" and saved profiles keeps the page mounted when a new profile gets its id. */}
              <Route path="employees/:id" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="employees">
                  <EmployeeProfilePage />
                </ProtectedRoute>
              } />
              <Route path="attendance" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="attendance">
                  <AttendancePage />
                </ProtectedRoute>
              } />
              <Route path="notifications" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreens={notificationScreenPermissions}>
                  <NotificationsPage />
                </ProtectedRoute>
              } />
              <Route path="team" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="team">
                  <TeamManagementPage />
                </ProtectedRoute>
              } />
              <Route path="team/create-client" element={<ProtectedRoute allowedRoles={['super_admin']}><CreateClientPage /></ProtectedRoute>} />
              <Route path="team/clients/:id" element={<ProtectedRoute allowedRoles={['super_admin']}><EditClientPage /></ProtectedRoute>} />
              <Route path="team/accounts/:id" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="team"><ManageAccountPage /></ProtectedRoute>} />
              <Route path="organization" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="organization"><OrganizationOverviewPage /></ProtectedRoute>} />
              <Route path="organization/departments" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="organization"><DepartmentsPage /></ProtectedRoute>} />
              <Route path="organization/branches" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="organization"><BranchesPage /></ProtectedRoute>} />
              <Route path="organization/fiscal-years" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} requiredScreen="organization"><FiscalYearsPage /></ProtectedRoute>} />
              <Route path="order-drafts" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="pos">
                  <OrderDraftsPage />
                </ProtectedRoute>
              } />
              <Route path="pos-reports" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="pos">
                  <POSShiftReportsPage />
                </ProtectedRoute>
              } />
              <Route path="permission-management" element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <PermissionManagementPage />
                </ProtectedRoute>
              } />
              <Route path="signup-requests" element={
                app.autoRegistrationEnabled
                  ? <Navigate to="/settings" replace />
                  : <ProtectedRoute allowedRoles={['super_admin']}>
                      <SignupRequestsPage />
                    </ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']} requiredScreen="settings">
                  <SettingsPage />
                </ProtectedRoute>
              } />
              <Route path="theme-settings" element={themeManaged ? <Navigate to="/" replace /> : <ThemeSettingsPage />} />
              <Route path="profile" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'user']}>
                  <ProfilePage />
                </ProtectedRoute>
              } />
              <Route path="access-denied" element={<AccessDeniedPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </BrowserRouter>
    </AppThemeProvider>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <AppContent />
      </PersistGate>
    </Provider>
  );
};

export default App;
