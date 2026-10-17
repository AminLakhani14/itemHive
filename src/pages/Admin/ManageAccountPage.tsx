import React from 'react';
import axios from 'axios';
import {
    Alert, Box, Button, Chip, CircularProgress, Divider, FormControlLabel, IconButton, InputAdornment,
    MenuItem, Paper, Snackbar, Stack, Switch, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import type { AppDispatch, RootState } from '../../store';
import { fetchSettings } from '../../features/settings/settingsSlice';
import type { BusinessType } from '../../types/businessType';
import type { User, UserRole } from '../../features/auth/authSlice';
import api from '../../api/axios';
import BusinessLabel from '../../components/Common/BusinessLabel';
import { hasExplicitScreenPermission, hasScreenAccess } from '../../lib/screenPermissions';

const EmployeeProfilePage = React.lazy(() => import('../Employees/EmployeeProfilePage'));

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

interface BusinessOption {
    id: string;
    name: string;
    isLegacy?: boolean;
}

type StatusUpdates = { isActive?: boolean; isVisible?: boolean; installmentAccess?: boolean; discountAccess?: boolean; digitalMenuAccess?: 'none' | 'menu' | 'pos'; businessTypeId?: string };

const roleLabel = (role: User['role']) =>
    role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'User';

const getApiErrorMessage = (error: unknown, fallback: string) => {
    if (!axios.isAxiosError<ApiErrorResponse>(error)) return fallback;
    return error.response?.data?.message || error.response?.data?.details || fallback;
};

const ManageAccountPage: React.FC = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { user: currentUser } = useSelector((state: RootState) => state.auth);
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const canOpenEmployees = hasScreenAccess(currentUser, 'employees');
    // Employee profiles belong to the workspace being viewed; a super admin can be viewing another shop.
    const activeBusinessId = localStorage.getItem('itemhive-workspace-id') || currentUser?.businessId || '';
    const [account, setAccount] = React.useState<User | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState('');
    const [businesses, setBusinesses] = React.useState<BusinessOption[]>([]);
    const [businessTypes, setBusinessTypes] = React.useState<BusinessType[]>([]);
    const [businessTypesLoading, setBusinessTypesLoading] = React.useState(true);
    const [businessTypesError, setBusinessTypesError] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [profileBusy, setProfileBusy] = React.useState(false);
    const [tab, setTab] = React.useState<'settings' | 'account' | 'employee'>('settings');
    const [profileOpened, setProfileOpened] = React.useState(false);
    const [monthlyPaymentEnabled, setMonthlyPaymentEnabled] = React.useState(false);
    const [monthlyPaymentPaid, setMonthlyPaymentPaid] = React.useState(false);
    const [monthlyPaymentDate, setMonthlyPaymentDate] = React.useState(new Date().toISOString().slice(0, 10));
    const [draft, setDraft] = React.useState<AccountDraft>({ name: '', email: '', password: '', role: 'user', businessId: '', userCreationLimit: '0' });
    const [showPassword, setShowPassword] = React.useState(false);
    const [snack, setSnack] = React.useState('');
    const [error, setError] = React.useState('');
    const busy = saving || profileBusy;
    const canManageSettings = isSuperAdmin && account?.role !== 'super_admin';
    const workspaceSettingsApply = account?.role === 'admin' || account?.role === 'super_admin';
    const canManageWorkspaceSettings = isSuperAdmin && workspaceSettingsApply;
    const showEmployeeTab = Boolean(canOpenEmployees && account?.employeeId && account.businessId === activeBusinessId);
    const visibleTab = (tab === 'account' && !canManageSettings) || (tab === 'employee' && !showEmployeeTab) ? 'settings' : tab;

    const fetchAccount = React.useCallback(async () => (await api.get<User>(`/users/${id}`)).data, [id]);
    const reloadAccount = async () => setAccount(await fetchAccount());

    React.useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError('');
        setTab('settings');
        setProfileOpened(false);
        setShowPassword(false);
        fetchAccount()
            .then((target) => {
                if (!active) return;
                setAccount(target);
                // Drafts start from the saved account and keep unsaved edits across later reloads.
                setMonthlyPaymentEnabled(Boolean(target.monthlyPayment?.enabled));
                setMonthlyPaymentPaid(Boolean(target.monthlyPayment?.paidAt) && !target.monthlyPayment?.overdue);
                setMonthlyPaymentDate(target.monthlyPayment?.paidAt?.slice(0, 10) || new Date().toISOString().slice(0, 10));
                setDraft({
                    name: target.name,
                    email: target.email,
                    password: target.visiblePassword || '',
                    role: target.role,
                    businessId: target.businessId || '',
                    userCreationLimit: String(target.userCreationLimit ?? 0),
                });
            })
            .catch((requestError: unknown) => { if (active) setLoadError(getApiErrorMessage(requestError, 'Unable to load this account.')); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [fetchAccount]);

    React.useEffect(() => {
        if (!isSuperAdmin) return;
        api.get<BusinessOption[]>('/users/businesses')
            .then((response) => setBusinesses(response.data || []))
            .catch(() => setBusinesses([]));
    }, [isSuperAdmin]);

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

    const handleStatusChange = async (target: User, updates: StatusUpdates) => {
        setSaving(true);
        setError('');
        try {
            await api.patch(`/users/${target.id}/status`, updates);
            await reloadAccount();
            if (typeof updates.businessTypeId === 'string' && target.businessId === activeBusinessId) {
                dispatch(fetchSettings());
            }
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setSnack('Account updated successfully.');
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to update this account.'));
        } finally {
            setSaving(false);
        }
    };

    const saveAccount = async () => {
        if (!account) return;
        setSaving(true);
        setError('');
        try {
            await api.patch(`/users/${account.id}/account`, {
                name: draft.name,
                email: draft.email,
                password: draft.password,
                role: draft.role,
                businessId: draft.businessId,
            });
            if (draft.role === 'admin') {
                await api.patch(`/users/${account.id}/limit`, {
                    userCreationLimit: Number(draft.userCreationLimit || 0),
                });
            }
            setTab('settings');
            await reloadAccount();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setSnack('Account details updated successfully.');
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to update this account.'));
        } finally {
            setSaving(false);
        }
    };

    const saveMonthlyPayment = async () => {
        if (!account) return;
        setSaving(true);
        setError('');
        try {
            await api.patch(`/users/${account.id}/monthly-payment`, {
                enabled: monthlyPaymentEnabled,
                paid: monthlyPaymentPaid,
                paidAt: new Date(`${monthlyPaymentDate}T12:00:00`).toISOString(),
            });
            await reloadAccount();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setSnack('Monthly payment updated successfully.');
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, 'Unable to update monthly payment.'));
        } finally {
            setSaving(false);
        }
    };

    const backButton = <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate('/team')} disabled={busy} sx={{ mb: 1.5 }}>Team Management</Button>;
    if (loading) return <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box>;
    if (!account) return <Box>{backButton}<Alert severity="error">{loadError || 'Account not found.'}</Alert></Box>;

    return (
        <Box>
            <Snackbar open={Boolean(snack)} autoHideDuration={2600} onClose={() => setSnack('')} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
                <Alert onClose={() => setSnack('')} severity="success" sx={{ width: '100%' }}>{snack}</Alert>
            </Snackbar>

            {backButton}
            <Box sx={{ mb: 3 }}>
                <Typography variant="h4" fontWeight={800}>Account Settings</Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                    <Typography variant="body1" fontWeight={800}>{account.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{account.email} · {account.businessName || '-'}</Typography>
                    <Chip icon={<ShieldCheck size={14} />} label={roleLabel(account.role)} color={account.role === 'user' ? 'default' : 'primary'} size="small" />
                </Stack>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Tabs value={visibleTab} onChange={(_, value) => { setTab(value); if (value === 'employee') setProfileOpened(true); }} variant="scrollable" scrollButtons="auto" sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Tab value="settings" label="Access & Settings" disabled={busy} />
                    {canManageSettings && <Tab value="account" label="Account Details" disabled={busy} />}
                    {showEmployeeTab && <Tab value="employee" label="Employee Profile" disabled={busy} />}
                </Tabs>
                <Box sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack spacing={2} sx={{ maxWidth: 760, display: visibleTab === 'settings' ? undefined : 'none' }}>
                        <Typography variant="subtitle2" fontWeight={800}>Account access</Typography>
                        <Typography variant="caption" color="text.secondary">Switch changes are saved automatically.</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                            <FormControlLabel label="Active" control={<Switch checked={Boolean(account.isActive)} disabled={!canManageSettings || busy} onChange={(_, checked) => handleStatusChange(account, { isActive: checked })} />} />
                            <FormControlLabel label="Visible" control={<Switch checked={Boolean(account.isVisible)} disabled={!canManageSettings || busy} onChange={(_, checked) => handleStatusChange(account, { isVisible: checked })} />} />
                            <FormControlLabel label={hasExplicitScreenPermission(account, 'installments') ? 'Installments (enabled in Permissions)' : 'Installments'} control={<Switch checked={Boolean(account.installmentAccess)} disabled={!canManageSettings || busy || hasExplicitScreenPermission(account, 'installments')} onChange={(_, checked) => handleStatusChange(account, { installmentAccess: checked })} />} />
                            <Box>
                                <FormControlLabel label={hasExplicitScreenPermission(account, 'settings') ? 'Discount Access (enabled in Permissions)' : 'Discount Access'} control={<Switch checked={Boolean(account.discountAccess)} disabled={!canManageSettings || account.role !== 'admin' || busy || hasExplicitScreenPermission(account, 'settings')} onChange={(_, checked) => handleStatusChange(account, { discountAccess: checked })} />} />
                                {account.role !== 'admin' && <Typography variant="caption" color="text.secondary" display="block">Managed on the business admin account.</Typography>}
                            </Box>
                        </Box>
                        {businessTypesError && <Alert severity="error" action={<Button size="small" onClick={loadBusinessTypes}>Retry</Button>}>{businessTypesError}</Alert>}
                        <TextField select fullWidth label="Business Type" value={account.businessTypeId || (account.restaurantEnabled ? 'restaurant' : '')} disabled={!canManageWorkspaceSettings || busy || businessTypesLoading || Boolean(businessTypesError)} onChange={(event) => handleStatusChange(account, { businessTypeId: event.target.value })} helperText={!workspaceSettingsApply ? 'Managed on the business admin account.' : 'Restaurant / KOT enables restaurant features. Manage available types in Settings → Business Types.'}>
                            <MenuItem value="">Not assigned</MenuItem>
                            {businessTypes.map((type) => <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>)}
                            {(account.businessTypeId || account.restaurantEnabled) && !businessTypes.some((type) => type.id === (account.businessTypeId || 'restaurant')) && <MenuItem value={account.businessTypeId || 'restaurant'} disabled>{account.restaurantEnabled ? 'Restaurant / KOT' : 'Selected business type'}</MenuItem>}
                        </TextField>
                        <Divider />
                        <TextField select fullWidth label="Digital Menu Access" value={account.digitalMenuAccess || 'none'} disabled={!canManageSettings || busy || (account.role === 'admin' && account.screenPermissions != null)} onChange={(event) => handleStatusChange(account, { digitalMenuAccess: event.target.value as 'none' | 'menu' | 'pos' })} helperText={account.role === 'admin' && account.screenPermissions != null ? 'Access is controlled in Permission Management.' : account.role === 'super_admin' ? 'Assigned to admin and user accounts.' : 'Changes are saved automatically.'}>
                            <MenuItem value="none">No access</MenuItem>
                            <MenuItem value="menu">Menu only — manage and show QR menus</MenuItem>
                            <MenuItem value="pos">Menu + Add to POS — send table bills to billing</MenuItem>
                        </TextField>
                        <Stack spacing={1.5}>
                            <Typography variant="subtitle2" fontWeight={800}>Monthly Payment</Typography>
                            <Typography variant="caption" color={account.monthlyPayment?.overdue ? 'error.main' : 'text.secondary'}>
                                {!workspaceSettingsApply ? 'Managed on the business admin account.' : !account.monthlyPayment?.enabled ? 'Tracking is off' : account.monthlyPayment.overdue ? 'Payment overdue' : account.monthlyPayment.paidAt ? `Paid: ${new Date(account.monthlyPayment.paidAt).toLocaleDateString()}` : 'Payment pending'}
                            </Typography>
                            <FormControlLabel control={<Switch checked={monthlyPaymentEnabled} disabled={!canManageWorkspaceSettings || busy} onChange={(_, checked) => setMonthlyPaymentEnabled(checked)} />} label="Track monthly payment" />
                            <FormControlLabel control={<Switch checked={monthlyPaymentPaid} disabled={!canManageWorkspaceSettings || busy || !monthlyPaymentEnabled} onChange={(_, checked) => setMonthlyPaymentPaid(checked)} />} label="Payment received" />
                            <TextField label="Payment date" type="date" value={monthlyPaymentDate} disabled={!canManageWorkspaceSettings || busy || !monthlyPaymentEnabled || !monthlyPaymentPaid} onChange={(event) => setMonthlyPaymentDate(event.target.value)} InputLabelProps={{ shrink: true }} />
                            <Typography variant="caption" color="text.secondary">If tracking is enabled and a payment remains unpaid for one full month, an overdue notification will be shown.</Typography>
                            {isSuperAdmin && <Button variant="outlined" onClick={saveMonthlyPayment} disabled={!canManageWorkspaceSettings || busy} sx={{ alignSelf: 'flex-start' }}>Save Monthly Payment</Button>}
                        </Stack>
                    </Stack>

                    {canManageSettings && (
                        <Box hidden={visibleTab !== 'account'} sx={{ maxWidth: 760 }}>
                            <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                                <Stack spacing={2}>
                                    <TextField label="Full Name" name="account-name" autoComplete="off" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
                                    <TextField label="Login Email / ID" name="account-email" type="email" autoComplete="off" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
                                    <TextField select label="Role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })} required>
                                        <MenuItem value="super_admin">Super Admin</MenuItem>
                                        <MenuItem value="admin">Administrator</MenuItem>
                                        <MenuItem value="user">User</MenuItem>
                                    </TextField>
                                    {draft.role !== 'super_admin' && (
                                        <TextField select label={<BusinessLabel />} value={draft.businessId} onChange={(event) => setDraft({ ...draft, businessId: event.target.value })} helperText="Move this account to an existing shop/workspace." required>
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
                                        helperText={account.visiblePassword ? 'Use the eye icon to view or update this password.' : 'Old password is not available. Enter a new password to reset it.'}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton onClick={() => setShowPassword((visible) => !visible)} edge="end" size="small" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                    {draft.role === 'admin' && (
                                        <TextField label="User Creation Limit" type="number" value={draft.userCreationLimit} onChange={(event) => setDraft({ ...draft, userCreationLimit: event.target.value })} inputProps={{ min: 0 }} />
                                    )}
                                    <Button variant="contained" onClick={saveAccount} disabled={busy} sx={{ alignSelf: 'flex-start' }}>Save Account Details</Button>
                                </Stack>
                            </Box>
                        </Box>
                    )}

                    {profileOpened && showEmployeeTab && account.employeeId && (
                        <Box hidden={visibleTab !== 'employee'}>
                            <React.Suspense fallback={<Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box>}>
                                <EmployeeProfilePage key={account.employeeId} employeeId={account.employeeId} embedded onManageTeam={() => setTab('settings')} onBusyChange={setProfileBusy} />
                            </React.Suspense>
                        </Box>
                    )}
                </Box>
            </Paper>
        </Box>
    );
};

export default ManageAccountPage;
