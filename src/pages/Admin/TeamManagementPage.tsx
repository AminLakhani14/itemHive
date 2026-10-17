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
    IconButton,
    InputAdornment,
    MenuItem,
    Snackbar,
    Stack,
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
    alpha,
    type Theme,
} from '@mui/material';
import { Building2, Edit3, Eye, EyeOff, IdCard, KeyRound, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../store';
import type { User, UserRole } from '../../features/auth/authSlice';
import api from '../../api/axios';
import CreateLoginDialog, { type LoginTarget } from '../../components/Employees/CreateLoginDialog';
import BusinessLabel from '../../components/Common/BusinessLabel';
import { hasScreenAccess } from '../../lib/screenPermissions';
import { getInitials } from '../../lib/employees';

interface UsersPage {
    users: User[];
    total: number;
}

type UsersResponse = UsersPage | User[];

interface ApiErrorResponse {
    message?: string;
    details?: string;
}

interface CreateAccountDraft {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    businessId: string;
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

// Square icon buttons with the same half-strength border as the page's outlined buttons.
const rowActionSx = (tone: 'primary' | 'error') => ({
    width: 36, height: 36, border: '1px solid', borderRadius: 2,
    borderColor: (theme: Theme) => alpha(theme.palette[tone].main, 0.5),
    '&:hover': { borderColor: `${tone}.main` },
});

const roleLabel = (role: User['role']) =>
    role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'User';

const getApiErrorMessage = (error: unknown, fallback: string) => {
    if (!axios.isAxiosError<ApiErrorResponse>(error)) return fallback;
    return error.response?.data?.message || error.response?.data?.details || fallback;
};

const TeamManagementPage: React.FC = () => {
    const { user: currentUser } = useSelector((state: RootState) => state.auth);
    const isSuperAdmin = currentUser?.role === 'super_admin';
    const navigate = useNavigate();
    const canOpenEmployees = hasScreenAccess(currentUser, 'employees');
    const [unlinkedEmployees, setUnlinkedEmployees] = React.useState<UnlinkedEmployee[]>([]);
    const [loginTarget, setLoginTarget] = React.useState<LoginTarget | null>(null);
    const [users, setUsers] = React.useState<User[]>([]);
    const [businesses, setBusinesses] = React.useState<BusinessOption[]>([]);
    const [loading, setLoading] = React.useState(true);
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
    const [deletingUser, setDeletingUser] = React.useState<User | null>(null);
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

    // Client details belong to a business with its own workspace, rather than the shared default one.
    const clientBusinessIds = React.useMemo(() => new Set(businesses.filter((business) => !business.isLegacy).map((business) => business.id)), [businesses]);

    const openCreateDialog = () => {
        setShowCreatePassword(false);
        setCreateDraft({
            name: '',
            email: '',
            password: '',
            role: isSuperAdmin ? 'admin' : 'user',
            businessId: '',
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
                businessId: isSuperAdmin ? createDraft.businessId || undefined : undefined,
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
                <Stack direction="row" spacing={1}>
                    {isSuperAdmin && <Button variant="outlined" startIcon={<UserPlus size={18} />} onClick={openCreateDialog}>Add Account</Button>}
                    <Button variant="contained" startIcon={<UserPlus size={18} />} onClick={isSuperAdmin ? () => navigate('/team/create-client') : openCreateDialog} sx={{ borderRadius: 2, fontWeight: 800 }}>
                        {isSuperAdmin ? 'Create Client' : 'Add User'}
                    </Button>
                </Stack>
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
                            const canEditClient = isSuperAdmin && teamUser.role === 'admin' && clientBusinessIds.has(teamUser.businessId || '');
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
                                        {teamUser.branchName && <Typography variant="caption" color="text.secondary">{teamUser.branchName}</Typography>}
                                    </TableCell>
                                    <TableCell>
                                        <Chip icon={<ShieldCheck size={14} />} label={roleLabel(teamUser.role)} color={teamUser.role === 'user' ? 'default' : 'primary'} size="small" />
                                    </TableCell>
                                    <TableCell align="center">{teamUser.role === 'admin' ? teamUser.userCreationLimit ?? 0 : '-'}</TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            {canEditClient && (
                                                <Tooltip title="Edit Client" arrow>
                                                    <IconButton size="small" color="primary" sx={rowActionSx('primary')} onClick={() => navigate(`/team/clients/${teamUser.businessId}`)} aria-label={`Edit client ${teamUser.businessName || teamUser.name}`}>
                                                        <Building2 size={17} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title="Manage" arrow>
                                                <IconButton size="small" color="primary" sx={rowActionSx('primary')} onClick={() => navigate(`/team/accounts/${teamUser.id}`)} aria-label={`Manage ${teamUser.name}`}>
                                                    <Edit3 size={17} />
                                                </IconButton>
                                            </Tooltip>
                                            {canDelete && (
                                                <Tooltip title="Delete" arrow>
                                                    {/* A disabled button fires no events, so the span keeps the tooltip working. */}
                                                    <span>
                                                        <IconButton size="small" color="error" sx={rowActionSx('error')} onClick={() => setDeletingUser(teamUser)} disabled={deleteSaving} aria-label={`Delete ${teamUser.name}`}>
                                                            <Trash2 size={17} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
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
                                    {businesses.map((business) => (
                                        <MenuItem key={business.id} value={business.id}>
                                            {business.name}{business.isLegacy ? ' (Default)' : ''}
                                        </MenuItem>
                                    ))}
                                </TextField>
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
