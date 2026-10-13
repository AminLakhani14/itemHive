import React from 'react';
import axios from 'axios';
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Snackbar,
    Stack,
    Switch,
    Tab,
    Tabs,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { Edit3, Eye, EyeOff, IdCard, Info, KeyRound, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { AppDispatch, RootState } from '../../store';
import { fetchSettings } from '../../features/settings/settingsSlice';
import type { BusinessType } from '../../types/businessType';
import type { User, UserRole } from '../../features/auth/authSlice';
import api from '../../api/axios';
import CreateLoginDialog, { type LoginTarget } from '../../components/Employees/CreateLoginDialog';
import { hasExplicitScreenPermission, hasScreenAccess } from '../../lib/screenPermissions';
import { getInitials } from '../../lib/employees';

const EmployeeProfilePage = React.lazy(() => import('../Employees/EmployeeProfilePage'));

interface UsersPage {
    users: User[];
    total: number;
}

type UsersResponse = UsersPage | User[];

interface ApiErrorResponse {
    message?: string;
    details?: string;
}

interface AccountDraft {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    businessId: string;
    userCreationLimit: string;
}

interface CreateAccountDraft {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    businessId: string;
    businessName: string;
}

interface UnlinkedEmployee extends LoginTarget {
    employeeCode: string;
    designation: string;
    photo: string;
}

interface BusinessOption {
    id: string;
    name: string;
    isLegacy?: boolean;
}

const roleLabel = (role: User['role']) =>
    role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'User';

const getApiErrorMessage = (error: unknown, fallback: string) => {
    if (!axios.isAxiosError<ApiErrorResponse>(error)) return fallback;
    return error.response?.data?.message || error.response?.data?.details || fallback;
};

const BusinessLabel = () => (
    <Stack direction="row" spacing={0.5} alignItems="center">
        <span>Business</span>
        <Tooltip title="To edit or delete a business, go to Settings → Business Management." arrow>
            <Info size={16} aria-label="Business management information" />
        </Tooltip>
    </Stack>
);

const TeamManagementPage: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { user: currentUser } = useSelector((state: RootState) => state.auth);
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const navigate = useNavigate();
    const canOpenEmployees = hasScreenAccess(currentUser, 'employees');
    // Employee profiles belong to the workspace being viewed; a super admin can be viewing another shop.
    const activeBusinessId = localStorage.getItem('itemhive-workspace-id') || currentUser?.businessId || '';
    const [unlinkedEmployees, setUnlinkedEmployees] = React.useState<UnlinkedEmployee[]>([]);
    const [loginTarget, setLoginTarget] = React.useState<LoginTarget | null>(null);
    const [users, setUsers] = React.useState<User[]>([]);
    const [businesses, setBusinesses] = React.useState<BusinessOption[]>([]);
    const [businessTypes, setBusinessTypes] = React.useState<BusinessType[]>([]);
    const [businessTypesLoading, setBusinessTypesLoading] = React.useState(true);
    const [businessTypesError, setBusinessTypesError] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [savingId, setSavingId] = React.useState('');
    const [filters, setFilters] = React.useState({ account: '', business: '', role: '', userLimit: '' });
    const [businessSort, setBusinessSort] = React.useState<'asc' | 'desc'>('asc');
    const trimmedLimit = filters.userLimit.trim();
    const limitFilterInvalid = Boolean(trimmedLimit && trimmedLimit !== '-' && (!/^\d+$/.test(trimmedLimit) || !Number.isSafeInteger(Number(trimmedLimit))));
    const changeFilter = (key: keyof typeof filters, value: string) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(0);
    };
    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(20);
    const [total, setTotal] = React.useState(0);
    const [settingsUserId, setSettingsUserId] = React.useState('');
    const settingsUser = users.find((user) => user.id === settingsUserId);
    const [settingsTab, setSettingsTab] = React.useState<'settings' | 'account' | 'employee'>('settings');
    const [profileBusy, setProfileBusy] = React.useState(false);
    const [profileOpened, setProfileOpened] = React.useState(false);
    const settingsBusy = Boolean(savingId) || profileBusy;
    const canManageSettings = isSuperAdmin && settingsUser?.role !== 'super_admin';
    const workspaceSettingsApply = settingsUser?.role === 'admin' || settingsUser?.role === 'super_admin';
    const canManageWorkspaceSettings = isSuperAdmin && workspaceSettingsApply;
    const [editingUser, setEditingUser] = React.useState<User | null>(null);
    const [deletingUser, setDeletingUser] = React.useState<User | null>(null);
    const [monthlyPaymentEnabled, setMonthlyPaymentEnabled] = React.useState(false);
    const [monthlyPaymentPaid, setMonthlyPaymentPaid] = React.useState(false);
    const [monthlyPaymentDate, setMonthlyPaymentDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [draft, setDraft] = React.useState<AccountDraft>({ name: '', email: '', password: '', role: 'user', businessId: '', userCreationLimit: '0' });
    const [showPassword, setShowPassword] = React.useState(false);
    const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
    const [createSaving, setCreateSaving] = React.useState(false);
    const [deleteSaving, setDeleteSaving] = React.useState(false);
    const [showCreatePassword, setShowCreatePassword] = React.useState(false);
    const [createDraft, setCreateDraft] = React.useState<CreateAccountDraft>({
        name: '',
        email: '',
        password: '',
        role: isSuperAdmin ? 'admin' : 'user',
        businessId: '',
        businessName: '',
    });
    const [snack, setSnack] = React.useState('');
    const [error, setError] = React.useState('');
    const usersRequestVersion = React.useRef(0);

    const loadUsers = React.useCallback(async () => {
        const requestVersion = ++usersRequestVersion.current;
        if (limitFilterInvalid) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');

        try {
            const response = await api.get<UsersResponse>('/users', {
                params: {
                    page: page + 1, limit: rowsPerPage, businessSort,
                    account: filters.account.trim() || undefined,
                    business: filters.business.trim() || undefined,
                    role: filters.role || undefined,
                    userLimit: filters.userLimit.trim() || undefined,
                },
            });
            if (requestVersion !== usersRequestVersion.current) return;
            const nextUsers = Array.isArray(response.data) ? response.data : response.data.users || [];
            setUsers(nextUsers);
            setTotal(Array.isArray(response.data) ? nextUsers.length : response.data.total || 0);
        } catch (requestError: unknown) {
            if (requestVersion !== usersRequestVersion.current) return;
            setError(getApiErrorMessage(requestError, 'Unable to load team members right now.'));
        } finally {
            if (requestVersion === usersRequestVersion.current) setLoading(false);
        }
    }, [page, rowsPerPage, filters, businessSort, limitFilterInvalid]);

    React.useEffect(() => {
        const timeoutId = window.setTimeout(loadUsers, 250);
        return () => {
            window.clearTimeout(timeoutId);
            usersRequestVersion.current += 1;
        };
    }, [loadUsers]);

    const loadUnlinkedEmployees = React.useCallback(async () => {
        try {
            const response = await api.get<UnlinkedEmployee[]>('/users/unlinked-employees');
            setUnlinkedEmployees(response.data || []);
        } catch {
            setUnlinkedEmployees([]);
        }
    }, []);

    React.useEffect(() => {
        loadUnlinkedEmployees();
        window.addEventListener('itemhive-workspace-changed', loadUnlinkedEmployees);
        return () => window.removeEventListener('itemhive-workspace-changed', loadUnlinkedEmployees);
    }, [loadUnlinkedEmployees]);

    const handleLoginCreated = async () => {
        setLoginTarget(null);
        setSnack('Login created. Open Manage to set their rights.');
        await Promise.all([loadUsers(), loadUnlinkedEmployees()]);
    };

    const loadBusinesses = React.useCallback(async () => {
        if (!isSuperAdmin) {
            setBusinesses([]);
            return;
        }

        try {
            const response = await api.get<BusinessOption[]>('/users/businesses');
            setBusinesses(response.data || []);
        } catch {
            setBusinesses([]);
        }
    }, [isSuperAdmin]);

    React.useEffect(() => {
        loadBusinesses();
    }, [loadBusinesses]);

    const loadBusinessTypes = React.useCallback(async () => {
        setBusinessTypesLoading(true);
        setBusinessTypesError('');
        try {
            const response = await api.get<BusinessType[]>('/users/business-types');
            setBusinessTypes(response.data);
        } catch (requestError: unknown) {
            setBusinessTypesError(getApiErrorMessage(requestError, 'Unable to load business types.'));
        } finally {
            setBusinessTypesLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadBusinessTypes();
        window.addEventListener('itemhive-business-types-updated', loadBusinessTypes);
        return () => window.removeEventListener('itemhive-business-types-updated', loadBusinessTypes);
    }, [loadBusinessTypes]);

    const handleStatusChange = async (target: User, updates: { isActive?: boolean; isVisible?: boolean; installmentAccess?: boolean; discountAccess?: boolean; digitalMenuAccess?: 'none' | 'menu' | 'pos'; businessTypeId?: string }) => {
        setSavingId(target.id);
        setError('');
        try {
            await api.patch(`/users/${target.id}/status`, updates);
            await loadUsers();
            if (typeof updates.businessTypeId === 'string' && target.businessId === activeBusinessId) {
                dispatch(fetchSettings());
            }
            setSnack('Account updated successfully.');
            return true;
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to update this account.'));
            return false;
        } finally {
            setSavingId('');
        }
    };

    const openAccountSettings = (target: User) => {
        loadBusinessTypes();
        setError('');
        setSettingsTab('settings');
        setProfileOpened(false);
        setSettingsUserId(target.id);
        setMonthlyPaymentEnabled(Boolean(target.monthlyPayment?.enabled));
        setMonthlyPaymentPaid(Boolean(target.monthlyPayment?.paidAt) && !target.monthlyPayment?.overdue);
        setMonthlyPaymentDate(target.monthlyPayment?.paidAt?.slice(0, 10) || new Date().toISOString().slice(0, 10));
        setShowPassword(false);
        setEditingUser(target);
        setDraft({
            name: target.name,
            email: target.email,
            password: target.visiblePassword || '',
            role: target.role,
            businessId: target.businessId || '',
            userCreationLimit: String(target.userCreationLimit ?? 0),
        });
    };

    const openCreateDialog = () => {
        setShowCreatePassword(false);
        setCreateDraft({
            name: '',
            email: '',
            password: '',
            role: isSuperAdmin ? 'admin' : 'user',
            businessId: '',
            businessName: '',
        });
        setCreateDialogOpen(true);
    };

    const createAccount = async (event: React.FormEvent) => {
        event.preventDefault();
        setCreateSaving(true);
        setError('');

        try {
            await api.post('/auth/register', {
                name: createDraft.name,
                email: createDraft.email,
                password: createDraft.password,
                role: createDraft.role,
                businessId: isSuperAdmin && createDraft.businessId !== '__new__' ? createDraft.businessId : undefined,
                businessName: isSuperAdmin && createDraft.businessId === '__new__' ? createDraft.businessName : undefined,
            });
            setCreateDialogOpen(false);
            await loadUsers();
            await loadBusinesses();
            await loadUnlinkedEmployees();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setSnack('Account created successfully.');
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to create this account.'));
        } finally {
            setCreateSaving(false);
        }
    };

    const saveAccount = async () => {
        if (!editingUser) return;

        setSavingId(editingUser.id);
        try {
            await api.patch(`/users/${editingUser.id}/account`, {
                name: draft.name,
                email: draft.email,
                password: draft.password,
                role: draft.role,
                businessId: draft.businessId,
            });
            if (draft.role === 'admin') {
                await api.patch(`/users/${editingUser.id}/limit`, {
                    userCreationLimit: Number(draft.userCreationLimit || 0),
                });
            }
            setSettingsTab('settings');
            await loadUsers();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setSnack('Account details updated successfully.');
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to update this account.'));
        } finally {
            setSavingId('');
        }
    };

    const deleteAccount = async () => {
        if (!deletingUser) return;

        setDeleteSaving(true);
        setError('');

        try {
            await api.delete(`/users/${deletingUser.id}`);
            setDeletingUser(null);
            await loadUsers();
            await loadUnlinkedEmployees();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setSnack('Account deleted successfully.');
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to delete this account.'));
        } finally {
            setDeleteSaving(false);
        }
    };

    const saveMonthlyPayment = async () => {
        if (!settingsUser) return;
        setSavingId(settingsUser.id);
        setError('');
        try {
            await api.patch(`/users/${settingsUser.id}/monthly-payment`, {
                enabled: monthlyPaymentEnabled,
                paid: monthlyPaymentPaid,
                paidAt: new Date(`${monthlyPaymentDate}T12:00:00`).toISOString(),
            });
            await loadUsers();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setSnack('Monthly payment updated successfully.');
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to update monthly payment.'));
        } finally {
            setSavingId('');
        }
    };

    return (
        <Box>
            <Snackbar open={Boolean(snack)} autoHideDuration={2600} onClose={() => setSnack('')} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
                <Alert onClose={() => setSnack('')} severity="success" sx={{ width: '100%' }}>{snack}</Alert>
            </Snackbar>

            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight={800}>Team Management</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {isSuperAdmin
                            ? 'Search and manage shop accounts from one scalable grid.'
                            : `You can create users up to your assigned limit of ${currentUser?.userCreationLimit ?? 0}.`}
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={openCreateDialog} sx={{ borderRadius: 2, fontWeight: 800 }}>
                    {isSuperAdmin ? 'Create Account' : 'Add User'}
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ verticalAlign: 'top', minWidth: 210 }}>
                                <Stack spacing={1} sx={{ py: 1 }}>
                                    <span>Account</span>
                                    <TextField size="small" type="search" placeholder="Name or email" value={filters.account} onChange={(event) => changeFilter('account', event.target.value)} inputProps={{ 'aria-label': 'Filter accounts by name or email' }} />
                                </Stack>
                            </TableCell>
                            <TableCell sortDirection={businessSort} sx={{ verticalAlign: 'top', minWidth: 220 }}>
                                <Stack spacing={1} sx={{ py: 1 }}>
                                    <TableSortLabel active direction={businessSort} sx={{ flexDirection: 'row', alignSelf: 'flex-start', whiteSpace: 'nowrap' }} onClick={() => { setBusinessSort((current) => current === 'asc' ? 'desc' : 'asc'); setPage(0); }}><BusinessLabel /></TableSortLabel>
                                    <TextField size="small" type="search" placeholder="Business name" value={filters.business} onChange={(event) => changeFilter('business', event.target.value)} inputProps={{ 'aria-label': 'Filter by business name' }} />
                                </Stack>
                            </TableCell>
                            <TableCell sx={{ verticalAlign: 'top', minWidth: 160 }}>
                                <Stack spacing={1} sx={{ py: 1 }}>
                                    <span>Role</span>
                                    <TextField select size="small" value={filters.role} onChange={(event) => changeFilter('role', event.target.value)} SelectProps={{ displayEmpty: true, inputProps: { 'aria-label': 'Filter by role' } }}>
                                        <MenuItem value="">All roles</MenuItem>
                                        <MenuItem value="super_admin">Super Admin</MenuItem>
                                        <MenuItem value="admin">Admin</MenuItem>
                                        <MenuItem value="user">User</MenuItem>
                                    </TextField>
                                </Stack>
                            </TableCell>
                            <TableCell align="center" sx={{ verticalAlign: 'top', minWidth: 140 }}>
                                <Stack spacing={1} sx={{ py: 1 }}>
                                    <span>User Limit</span>
                                    <TextField size="small" type="search" placeholder="Limit or -" value={filters.userLimit} onChange={(event) => changeFilter('userLimit', event.target.value)} error={limitFilterInvalid} helperText={limitFilterInvalid ? 'Enter a whole number or -' : undefined} inputProps={{ 'aria-label': 'Filter by user limit; use - for not applicable' }} />
                                </Stack>
                            </TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 8 }}><CircularProgress size={30} /></TableCell>
                            </TableRow>
                        )}
                        {!loading && users.map((teamUser) => {
                            const isBusy = savingId === teamUser.id;
                            const canDelete = teamUser.id !== currentUser?.id && (
                                isSuperAdmin
                                    ? teamUser.role !== 'super_admin'
                                    : teamUser.role === 'user'
                            );
                            return (
                                <TableRow key={teamUser.id} hover>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={800}>{teamUser.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">{teamUser.email}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={800}>{teamUser.businessName || '-'}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip icon={<ShieldCheck size={14} />} label={roleLabel(teamUser.role)} color={teamUser.role === 'user' ? 'default' : 'primary'} size="small" />
                                    </TableCell>
                                    <TableCell align="center">{teamUser.role === 'admin' ? teamUser.userCreationLimit ?? 0 : '-'}</TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <Button size="small" variant="outlined" startIcon={<Edit3 size={15} />} onClick={() => openAccountSettings(teamUser)} disabled={isBusy} aria-label={`Manage ${teamUser.name}`}>
                                                Manage
                                            </Button>
                                            {canDelete && (
                                                <Button
                                                    size="small"
                                                    color="error"
                                                    variant="outlined"
                                                    startIcon={<Trash2 size={15} />}
                                                    onClick={() => setDeletingUser(teamUser)}
                                                    disabled={deleteSaving}
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {!loading && !users.length && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                                    <Users size={34} style={{ opacity: 0.45, marginBottom: 8 }} />
                                    <Typography variant="body2" color="text.secondary">No matching accounts found.</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    component="div"
                    count={total}
                    page={page}
                    onPageChange={(_, nextPage) => setPage(nextPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(event) => {
                        setRowsPerPage(Number(event.target.value));
                        setPage(0);
                    }}
                    rowsPerPageOptions={[10, 20, 50, 100]}
                />
            </TableContainer>

            {unlinkedEmployees.length > 0 && (
                <Card variant="outlined" sx={{ mt: 3, borderRadius: 3 }}>
                    <CardContent>
                        <Typography variant="h6" fontWeight={800}>Employees without a login</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {isSuperAdmin ? 'In the workspace you are viewing, these' : 'These'} employees have a profile in Employees but cannot sign in yet.
                            Create a login to give them access, then open Manage to set their rights.
                        </Typography>
                        <Stack spacing={1}>
                            {unlinkedEmployees.map((employee) => (
                                <Stack key={employee._id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                                    <Avatar src={employee.photo || undefined} sx={{ width: 36, height: 36, fontSize: 14, fontWeight: 800, bgcolor: 'primary.main' }}>
                                        {getInitials(employee.fullName)}
                                    </Avatar>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography variant="body2" fontWeight={800} noWrap>{employee.fullName}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {employee.employeeCode}{employee.designation ? ` · ${employee.designation}` : ''}
                                        </Typography>
                                    </Box>
                                    {canOpenEmployees && (
                                        <Button size="small" startIcon={<IdCard size={15} />} onClick={() => navigate(`/employees/${employee._id}`)}>Profile</Button>
                                    )}
                                    <Button size="small" variant="contained" startIcon={<KeyRound size={15} />} onClick={() => setLoginTarget(employee)}>
                                        Create Login
                                    </Button>
                                </Stack>
                            ))}
                        </Stack>
                    </CardContent>
                </Card>
            )}

            <Dialog open={Boolean(settingsUser)} onClose={() => !settingsBusy && setSettingsUserId('')} fullWidth maxWidth={settingsTab === 'employee' ? 'lg' : 'sm'}>
                <DialogTitle>Account Settings</DialogTitle>
                <Tabs value={settingsTab} onChange={(_, value) => { setSettingsTab(value); if (value === 'employee') setProfileOpened(true); }} variant="scrollable" scrollButtons="auto" sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Tab value="settings" label="Access & Settings" disabled={settingsBusy} />
                    {canManageSettings && <Tab value="account" label="Account Details" disabled={settingsBusy} />}
                    {canOpenEmployees && settingsUser?.employeeId && settingsUser.businessId === activeBusinessId && <Tab value="employee" label="Employee Profile" disabled={settingsBusy} />}
                </Tabs>
                <DialogContent>
                    {settingsUser && (
                        <Stack spacing={2} sx={{ pt: 1, display: settingsTab === 'settings' ? undefined : 'none' }}>
                            <Box>
                                <Typography variant="h6" fontWeight={800}>{settingsUser.name}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{settingsUser.email}</Typography>
                                <Typography variant="body2" color="text.secondary">{settingsUser.businessName || '-'} · {roleLabel(settingsUser.role)}</Typography>
                            </Box>
                            {error && <Alert severity="error">{error}</Alert>}
                            <Divider />
                            <Typography variant="subtitle2" fontWeight={800}>Account access</Typography>
                            <Typography variant="caption" color="text.secondary">Switch changes are saved automatically.</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                                <FormControlLabel label="Active" control={<Switch checked={Boolean(settingsUser.isActive)} disabled={!canManageSettings || settingsBusy} onChange={(_, checked) => handleStatusChange(settingsUser, { isActive: checked })} />} />
                                <FormControlLabel label="Visible" control={<Switch checked={Boolean(settingsUser.isVisible)} disabled={!canManageSettings || settingsBusy} onChange={(_, checked) => handleStatusChange(settingsUser, { isVisible: checked })} />} />
                                <FormControlLabel label={hasExplicitScreenPermission(settingsUser, 'installments') ? 'Installments (enabled in Permissions)' : 'Installments'} control={<Switch checked={Boolean(settingsUser.installmentAccess)} disabled={!canManageSettings || settingsBusy || hasExplicitScreenPermission(settingsUser, 'installments')} onChange={(_, checked) => handleStatusChange(settingsUser, { installmentAccess: checked })} />} />
                                <Box>
                                    <FormControlLabel label={hasExplicitScreenPermission(settingsUser, 'settings') ? 'Discount Access (enabled in Permissions)' : 'Discount Access'} control={<Switch checked={Boolean(settingsUser.discountAccess)} disabled={!canManageSettings || settingsUser.role !== 'admin' || settingsBusy || hasExplicitScreenPermission(settingsUser, 'settings')} onChange={(_, checked) => handleStatusChange(settingsUser, { discountAccess: checked })} />} />
                                    {settingsUser.role !== 'admin' && <Typography variant="caption" color="text.secondary" display="block">Managed on the business admin account.</Typography>}
                                </Box>
                            </Box>
                            {businessTypesError && <Alert severity="error" action={<Button size="small" onClick={loadBusinessTypes}>Retry</Button>}>{businessTypesError}</Alert>}
                            <TextField select fullWidth label="Business Type" value={settingsUser.businessTypeId || (settingsUser.restaurantEnabled ? 'restaurant' : '')} disabled={!canManageWorkspaceSettings || settingsBusy || businessTypesLoading || Boolean(businessTypesError)} onChange={(event) => handleStatusChange(settingsUser, { businessTypeId: event.target.value })} helperText={!workspaceSettingsApply ? 'Managed on the business admin account.' : 'Restaurant / KOT enables restaurant features. Manage available types in Settings → Business Types.'}>
                                <MenuItem value="">Not assigned</MenuItem>
                                {businessTypes.map((type) => <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>)}
                                {(settingsUser.businessTypeId || settingsUser.restaurantEnabled) && !businessTypes.some((type) => type.id === (settingsUser.businessTypeId || 'restaurant')) && <MenuItem value={settingsUser.businessTypeId || 'restaurant'} disabled>{settingsUser.restaurantEnabled ? 'Restaurant / KOT' : 'Selected business type'}</MenuItem>}
                            </TextField>
                            <Divider />
                            <TextField select fullWidth label="Digital Menu Access" value={settingsUser.digitalMenuAccess || 'none'} disabled={!canManageSettings || settingsBusy || (settingsUser.role === 'admin' && settingsUser.screenPermissions != null)} onChange={(event) => handleStatusChange(settingsUser, { digitalMenuAccess: event.target.value as 'none' | 'menu' | 'pos' })} helperText={settingsUser.role === 'admin' && settingsUser.screenPermissions != null ? 'Access is controlled in Permission Management.' : settingsUser.role === 'super_admin' ? 'Assigned to admin and user accounts.' : 'Changes are saved automatically.'}>
                                <MenuItem value="none">No access</MenuItem>
                                <MenuItem value="menu">Menu only — manage and show QR menus</MenuItem>
                                <MenuItem value="pos">Menu + Add to POS — send table bills to billing</MenuItem>
                            </TextField>
                            <Stack spacing={1.5}>
                                <Typography variant="subtitle2" fontWeight={800}>Monthly Payment</Typography>
                                <Typography variant="caption" color={settingsUser.monthlyPayment?.overdue ? 'error.main' : 'text.secondary'}>
                                    {!workspaceSettingsApply ? 'Managed on the business admin account.' : !settingsUser.monthlyPayment?.enabled ? 'Tracking is off' : settingsUser.monthlyPayment.overdue ? 'Payment overdue' : settingsUser.monthlyPayment.paidAt ? `Paid: ${new Date(settingsUser.monthlyPayment.paidAt).toLocaleDateString()}` : 'Payment pending'}
                                </Typography>
                                <FormControlLabel control={<Switch checked={monthlyPaymentEnabled} disabled={!canManageWorkspaceSettings || settingsBusy} onChange={(_, checked) => setMonthlyPaymentEnabled(checked)} />} label="Track monthly payment" />
                                <FormControlLabel control={<Switch checked={monthlyPaymentPaid} disabled={!canManageWorkspaceSettings || settingsBusy || !monthlyPaymentEnabled} onChange={(_, checked) => setMonthlyPaymentPaid(checked)} />} label="Payment received" />
                                <TextField label="Payment date" type="date" value={monthlyPaymentDate} disabled={!canManageWorkspaceSettings || settingsBusy || !monthlyPaymentEnabled || !monthlyPaymentPaid} onChange={(event) => setMonthlyPaymentDate(event.target.value)} InputLabelProps={{ shrink: true }} />
                                <Typography variant="caption" color="text.secondary">If tracking is enabled and a payment remains unpaid for one full month, an overdue notification will be shown.</Typography>
                                {isSuperAdmin && <Button variant="outlined" onClick={saveMonthlyPayment} disabled={!canManageWorkspaceSettings || settingsBusy} sx={{ alignSelf: 'flex-start' }}>Save Monthly Payment</Button>}
                            </Stack>
                        </Stack>
                    )}
                    {settingsUser && canManageSettings && (
                        <Box hidden={settingsTab !== 'account'}>
                            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                            <Box component="fieldset" disabled={settingsBusy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                                <Stack spacing={2} sx={{ pt: 1 }}>
                                    <TextField label="Full Name" name="account-name" autoComplete="off" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
                                    <TextField label="Login Email / ID" name="account-email" type="email" autoComplete="off" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
                                    <TextField
                                        select
                                        label="Role"
                                        value={draft.role}
                                        onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}
                                        required
                                    >
                                        <MenuItem value="super_admin">Super Admin</MenuItem>
                                        <MenuItem value="admin">Administrator</MenuItem>
                                        <MenuItem value="user">User</MenuItem>
                                    </TextField>
                                    {draft.role !== 'super_admin' && (
                                        <TextField
                                            select
                                            label={<BusinessLabel />}
                                            value={draft.businessId}
                                            onChange={(event) => setDraft({ ...draft, businessId: event.target.value })}
                                            helperText="Move this account to an existing shop/workspace."
                                            required
                                        >
                                            {businesses.map((business) => (
                                                <MenuItem key={business.id} value={business.id}>
                                                    {business.name}{business.isLegacy ? ' (Default)' : ''}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    )}
                                    <TextField
                                        label="Password"
                                        name="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={draft.password}
                                        onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                                        helperText={editingUser?.visiblePassword ? 'Use the eye icon to view or update this password.' : 'Old password is not available. Enter a new password to reset it.'}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton
                                                        onClick={() => setShowPassword((visible) => !visible)}
                                                        edge="end"
                                                        size="small"
                                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                    >
                                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                    {draft.role === 'admin' && (
                                        <TextField label="User Creation Limit" type="number" value={draft.userCreationLimit} onChange={(event) => setDraft({ ...draft, userCreationLimit: event.target.value })} inputProps={{ min: 0 }} />
                                    )}
                                </Stack>
                            </Box>
                        </Box>
                    )}
                    {profileOpened && canOpenEmployees && settingsUser?.employeeId && settingsUser.businessId === activeBusinessId && (
                        <Box hidden={settingsTab !== 'employee'} sx={{ pt: 2 }}>
                            <React.Suspense fallback={<Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}>
                                <EmployeeProfilePage key={settingsUser.employeeId} employeeId={settingsUser.employeeId} embedded onManageTeam={() => setSettingsTab('settings')} onBusyChange={setProfileBusy} />
                            </React.Suspense>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    {settingsTab === 'account' && canManageSettings && <Button variant="contained" onClick={saveAccount} disabled={settingsBusy}>Save Account Details</Button>}
                    <Button onClick={() => setSettingsUserId('')} disabled={settingsBusy}>Close</Button>
                </DialogActions>
            </Dialog>

            <CreateLoginDialog employee={loginTarget} onClose={() => setLoginTarget(null)} onCreated={handleLoginCreated} />

            <Dialog open={createDialogOpen} onClose={() => !createSaving && setCreateDialogOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{isSuperAdmin ? 'Create Account' : 'Add User'}</DialogTitle>
                <Box component="form" onSubmit={createAccount}>
                    <DialogContent>
                        <Stack spacing={2} sx={{ pt: 1 }}>
                            <TextField
                                label="Full Name"
                                name="new-account-name"
                                autoComplete="off"
                                value={createDraft.name}
                                onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })}
                                required
                                disabled={createSaving}
                            />
                            <TextField
                                label="Login Email / ID"
                                name="new-account-email"
                                type="email"
                                autoComplete="off"
                                value={createDraft.email}
                                onChange={(event) => setCreateDraft({ ...createDraft, email: event.target.value })}
                                required
                                disabled={createSaving}
                            />
                            <TextField
                                select
                                label="Role"
                                value={createDraft.role}
                                onChange={(event) => setCreateDraft({ ...createDraft, role: event.target.value as UserRole, businessId: '' })}
                                required
                                disabled={createSaving || !isSuperAdmin}
                            >
                                {isSuperAdmin && <MenuItem value="admin">Administrator</MenuItem>}
                                {isSuperAdmin && <MenuItem value="super_admin">Super Admin</MenuItem>}
                                <MenuItem value="user">User</MenuItem>
                            </TextField>
                            {isSuperAdmin && createDraft.role !== 'super_admin' && (
                                <TextField
                                    select
                                    label={<BusinessLabel />}
                                    value={createDraft.businessId}
                                    onChange={(event) => setCreateDraft({ ...createDraft, businessId: event.target.value })}
                                    helperText="Choose which shop/workspace this account belongs to."
                                    required
                                    disabled={createSaving}
                                >
                                    {createDraft.role === 'admin' && <MenuItem value="__new__">Create new business</MenuItem>}
                                    {businesses.map((business) => (
                                        <MenuItem key={business.id} value={business.id}>
                                            {business.name}{business.isLegacy ? ' (Default)' : ''}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}
                            {isSuperAdmin && createDraft.businessId === '__new__' && (
                                <TextField
                                    label="Shop Name"
                                    name="new-account-shop"
                                    autoComplete="off"
                                    value={createDraft.businessName}
                                    onChange={(event) => setCreateDraft({ ...createDraft, businessName: event.target.value })}
                                    helperText="A separate workspace will be created for this shop."
                                    required
                                    disabled={createSaving}
                                />
                            )}
                            <TextField
                                label="Password"
                                name="new-account-password"
                                type={showCreatePassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                value={createDraft.password}
                                onChange={(event) => setCreateDraft({ ...createDraft, password: event.target.value })}
                                required
                                disabled={createSaving}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                onClick={() => setShowCreatePassword((visible) => !visible)}
                                                edge="end"
                                                size="small"
                                                aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showCreatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setCreateDialogOpen(false)} disabled={createSaving}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={createSaving}>
                            {createSaving ? 'Creating...' : 'Create Account'}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <Dialog open={Boolean(deletingUser)} onClose={() => !deleteSaving && setDeletingUser(null)} fullWidth maxWidth="xs">
                <DialogTitle>Delete Account</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary">
                        Delete {deletingUser?.name}? This account will no longer be able to log in.
                        {deletingUser?.employeeId ? ' Their employee profile and attendance history are kept in Employees.' : ''}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeletingUser(null)} disabled={deleteSaving}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={deleteAccount} disabled={deleteSaving}>
                        {deleteSaving ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default TeamManagementPage;
