import React from 'react';
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
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
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { BriefcaseBusiness, Edit3, KeyRound, ScanFace, Search, Trash2, UserRoundPlus } from 'lucide-react';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../../api/axios';
import useAppCurrency from '../../hooks/useAppCurrency';
import type { RootState } from '../../store';
import { getRegionalIdLabel } from '../../lib/regional';
import { compactPayrollSx } from '../../components/Payroll/PayrollLayout';
import { getInitials } from '../../lib/employees';
import DesignationManagerDialog from '../../components/Employees/DesignationManagerDialog';
import { SALARY_TYPE_LABELS, type Designation, type Employee, type EmployeeStatus } from '../../types/employee';

const getErrorMessage = (error: unknown, fallback: string) =>
    (error as AxiosError<{ message?: string }>).response?.data?.message || fallback;

const EmployeesPage: React.FC = () => {
    const navigate = useNavigate();
    const { formatCurrency } = useAppCurrency();
    const { country } = useSelector((state: RootState) => state.settings);
    const regionalIdLabel = getRegionalIdLabel(country);
    const [employees, setEmployees] = React.useState<Employee[]>([]);
    const [designations, setDesignations] = React.useState<Designation[]>([]);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [designationFilter, setDesignationFilter] = React.useState('all');
    const [statusFilter, setStatusFilter] = React.useState<EmployeeStatus | 'all'>('active');
    const [deleteTarget, setDeleteTarget] = React.useState<Employee | null>(null);
    const [designationsOpen, setDesignationsOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [successMessage, setSuccessMessage] = React.useState('');
    const [page, setPage] = React.useState(0);
    const [limit, setLimit] = React.useState(25);
    const generation = React.useRef(0);
    const context = React.useRef(0);

    const loadData = React.useCallback(async () => {
        const current = ++generation.current;
        setLoading(true);
        setError('');
        try {
            const [employeesResponse, designationsResponse] = await Promise.all([
                api.get('/employees'),
                api.get('/employees/designations'),
            ]);
            if (current !== generation.current) return;
            setEmployees(employeesResponse.data || []);
            setDesignations(designationsResponse.data || []);
        } catch (fetchError: unknown) {
            if (current === generation.current) setError(getErrorMessage(fetchError, 'Unable to load employees.'));
        } finally {
            if (current === generation.current) setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void loadData();
        const changed = () => { context.current++; setSaving(false); setEmployees([]); setDesignations([]); setDeleteTarget(null); setDesignationsOpen(false); setSuccessMessage(''); setSearchTerm(''); setDesignationFilter('all'); setStatusFilter('active'); setPage(0); void loadData(); };
        window.addEventListener('itemhive-workspace-changed', changed);
        const updated = () => { void loadData(); };
        window.addEventListener('itemhive-payroll-profile-updated', updated);
        return () => { context.current++; generation.current++; window.removeEventListener('itemhive-workspace-changed', changed); window.removeEventListener('itemhive-payroll-profile-updated', updated); };
    }, [loadData]);
    React.useEffect(() => setPage(0), [searchTerm, designationFilter, statusFilter]);

    const designationOptions = React.useMemo(
        () => Array.from(new Set(employees.map((employee) => employee.designation).filter(Boolean))).sort(),
        [employees]
    );

    const filteredEmployees = React.useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return employees.filter((employee) => {
            if (statusFilter !== 'all' && employee.status !== statusFilter) return false;
            if (designationFilter !== 'all' && employee.designation !== designationFilter) return false;
            if (!query) return true;
            return [employee.fullName, employee.employeeCode, employee.cnic, employee.phoneNumber, employee.designation, employee.fatherName]
                .some((value) => value?.toLowerCase().includes(query));
        });
    }, [employees, searchTerm, statusFilter, designationFilter]);

    const safePage = Math.min(page, Math.max(0, Math.ceil(filteredEmployees.length / limit) - 1));

    const stats = React.useMemo(() => {
        const active = employees.filter((employee) => employee.status === 'active');
        return {
            total: employees.length,
            active: active.length,
            faceRegistered: active.filter((employee) => employee.hasFace).length,
            monthlyPayroll: active
                .filter((employee) => employee.salaryType === 'monthly')
                .reduce((sum, employee) => sum + Number(employee.salary || 0), 0),
        };
    }, [employees]);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        const current = context.current;
        setSaving(true);
        setError('');
        try {
            await api.delete(`/employees/${deleteTarget._id}`);
            if (current !== context.current) return;
            setEmployees((current) => current.filter((employee) => employee._id !== deleteTarget._id));
            setSuccessMessage('Employee deleted.');
            setDeleteTarget(null);
        } catch (deleteError: unknown) {
            if (current === context.current) setError(getErrorMessage(deleteError, 'Unable to delete employee.'));
        } finally {
            if (current === context.current) setSaving(false);
        }
    };

    const statCards = [
        { label: 'Employees', value: stats.total, color: 'text.primary' },
        { label: 'Active', value: stats.active, color: 'success.main' },
        { label: 'Face Registered', value: `${stats.faceRegistered} / ${stats.active}`, color: 'info.main' },
        { label: 'Monthly base salaries', value: formatCurrency(stats.monthlyPayroll, { minimumFractionDigits: 0, maximumFractionDigits: 0 }), color: 'primary.main' },
    ];

    return (
        <Box sx={compactPayrollSx}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
                <Box>
                    <Typography variant="h4" fontWeight={800}>Employees</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Employee profiles, designations, salaries, documents, and face registration for attendance.
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', '& .MuiButton-root': { flex: { xs: '1 1 150px', sm: '0 0 auto' } } }}>
                    <Button variant="outlined" startIcon={<BriefcaseBusiness size={18} />} onClick={() => setDesignationsOpen(true)} sx={{ fontWeight: 800, borderRadius: '8px' }}>
                        Designations
                    </Button>
                    <Button variant="contained" startIcon={<UserRoundPlus size={18} />} onClick={() => navigate('/employees/new')} sx={{ fontWeight: 800, borderRadius: '8px' }}>
                        Add Employee
                    </Button>
                </Stack>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            <Grid container spacing={1.5} sx={{ mb: 2 }}>
                {statCards.map((card) => (
                    <Grid key={card.label} size={{ xs: 6, md: 3 }}>
                        <Card sx={{ borderRadius: '8px' }}>
                            <CardContent>
                                <Typography variant="body2" color="text.secondary">{card.label}</Typography>
                                <Typography variant="h6" fontWeight={800} color={card.color} sx={{ overflowWrap: 'anywhere' }}>{card.value}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Card sx={{ borderRadius: '8px', overflow: 'hidden' }}>
                <CardContent sx={{ '&&&': { p: 0 } }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder={`Search by name, code, ${regionalIdLabel}, phone, or designation...`}
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search size={18} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <TextField size="small" select label="Designation" value={designationFilter} onChange={(event) => setDesignationFilter(event.target.value)} sx={{ minWidth: 200 }}>
                            <MenuItem value="all">All designations</MenuItem>
                            {designationOptions.map((designation) => <MenuItem key={designation} value={designation}>{designation}</MenuItem>)}
                        </TextField>
                        <TextField size="small" select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as EmployeeStatus | 'all')} sx={{ minWidth: 160 }}>
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="inactive">Inactive</MenuItem>
                            <MenuItem value="all">All</MenuItem>
                        </TextField>
                    </Stack>

                    <TableContainer sx={{ overflowX: 'auto' }}>
                        <Table size="small" sx={{ minWidth: 1080 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 800 }}>EMPLOYEE</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>{regionalIdLabel.toUpperCase()}</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>DESIGNATION</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>PHONE</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>SALARY</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>FACE</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>LOGIN</TableCell>
                                    <TableCell sx={{ fontWeight: 800 }}>STATUS</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 800 }}>ACTIONS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredEmployees.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 8 }}>
                                            <Typography color="text.secondary">
                                                {loading ? 'Loading employees...' : employees.length === 0 ? 'No employees yet. Add your first employee profile.' : 'No employees match these filters.'}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredEmployees.slice(safePage * limit, (safePage + 1) * limit).map((employee) => (
                                        <TableRow key={employee._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/employees/${employee._id}`)}>
                                            <TableCell>
                                                <Stack direction="row" spacing={1.5} alignItems="center">
                                                    <Avatar src={employee.photo || undefined} sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontWeight: 800 }}>
                                                        {getInitials(employee.fullName)}
                                                    </Avatar>
                                                    <Box>
                                                        <Typography fontWeight={800}>{employee.fullName}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{employee.employeeCode}</Typography>
                                                    </Box>
                                                </Stack>
                                            </TableCell>
                                            <TableCell>{employee.cnic}</TableCell>
                                            <TableCell>{employee.designation ? <Chip size="small" label={employee.designation} /> : '-'}</TableCell>
                                            <TableCell>{employee.phoneNumber || '-'}</TableCell>
                                            <TableCell>
                                                <Typography fontWeight={800}>
                                                    {formatCurrency(employee.salary, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">{SALARY_TYPE_LABELS[employee.salaryType]}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    icon={<ScanFace size={14} />}
                                                    color={employee.hasFace ? 'success' : 'warning'}
                                                    variant={employee.hasFace ? 'filled' : 'outlined'}
                                                    label={employee.hasFace ? 'Registered' : 'Not registered'}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {employee.account ? (
                                                    <Tooltip title={`Signs in as ${employee.account.email}. Rights are managed in Team.`}>
                                                        <Chip
                                                            size="small"
                                                            icon={<KeyRound size={14} />}
                                                            color={employee.account.isActive ? 'primary' : 'default'}
                                                            label={employee.account.isActive ? 'Active login' : 'Login disabled'}
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <Typography variant="caption" color="text.secondary">No login</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Chip size="small" color={employee.status === 'active' ? 'success' : 'default'} label={employee.status === 'active' ? 'Active' : 'Inactive'} />
                                            </TableCell>
                                            <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                                                <Tooltip title="Open profile">
                                                    <IconButton size="small" color="primary" onClick={() => navigate(`/employees/${employee._id}`)}>
                                                        <Edit3 size={17} />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete employee">
                                                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(employee)}>
                                                        <Trash2 size={17} />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <TablePagination component="div" count={filteredEmployees.length} page={safePage} rowsPerPage={limit} rowsPerPageOptions={[10, 25, 50, 100]} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={e => { setLimit(Number(e.target.value)); setPage(0); }} />
                </CardContent>
            </Card>

            <DesignationManagerDialog
                open={designationsOpen}
                designations={designations}
                onClose={() => setDesignationsOpen(false)}
                onChange={setDesignations}
            />

            <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 800 }}>Delete Employee</DialogTitle>
                <DialogContent>
                    <Typography color="text.secondary">
                        Delete {deleteTarget?.fullName}? Their documents, attendance history, and leaves are deleted too
                        {deleteTarget?.account ? `, and their login (${deleteTarget.account.email}) is removed from Team` : ''}.
                        To keep their history, set the profile to Inactive instead.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" color="error" startIcon={<Trash2 size={18} />} onClick={handleDelete} disabled={saving}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={Boolean(successMessage)}
                autoHideDuration={2500}
                onClose={() => setSuccessMessage('')}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert severity="success" variant="filled" onClose={() => setSuccessMessage('')}>
                    {successMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default EmployeesPage;
