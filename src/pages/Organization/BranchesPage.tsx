import React from 'react';
import axios from 'axios';
import {
    Alert, Autocomplete, Avatar, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress,
    Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, InputAdornment, List,
    ListItem, ListItemAvatar, ListItemButton, ListItemText, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Building2, Eye, EyeOff, Pencil, Plus, Search, ShieldPlus, UserPlus, UsersRound } from 'lucide-react';
import api from '../../api/axios';
import OrganizationPageLayout from './OrganizationPageLayout';
import BranchDialog from '../../components/Organization/BranchDialog';
import type { BranchForm } from '../../components/Organization/BranchFields';
import type { BranchesResponse, OrganizationAdmin, OrganizationBranch, OrganizationEmployee } from './organizationTypes';

const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || 'Unable to complete this request.' : 'Unable to complete this request.';
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

export default function BranchesPage() {
    const [data, setData] = React.useState<BranchesResponse>({ branches: [], administrators: [], employees: [] });
    const [loading, setLoading] = React.useState(true);
    const [busyBranch, setBusyBranch] = React.useState('');
    const [error, setError] = React.useState('');
    const [adminDrafts, setAdminDrafts] = React.useState<Record<string, string[]>>({});
    const [employeeBranch, setEmployeeBranch] = React.useState<OrganizationBranch | null>(null);
    const [employeeIds, setEmployeeIds] = React.useState<string[]>([]);
    const [employeeSearch, setEmployeeSearch] = React.useState('');
    const [adminBranch, setAdminBranch] = React.useState<OrganizationBranch | null>(null);
    const [adminDraft, setAdminDraft] = React.useState({ name: '', email: '', password: '' });
    const [showPassword, setShowPassword] = React.useState(false);
    const [branchEditor, setBranchEditor] = React.useState<{ id?: string; form: BranchForm } | null>(null);
    const [branchSaving, setBranchSaving] = React.useState(false);
    const [branchError, setBranchError] = React.useState('');

    const load = React.useCallback(async (changed = false) => {
        setLoading(true); setError('');
        // The top-bar branch switcher lists branches and their administrators.
        if (changed) window.dispatchEvent(new Event('itemhive-branches-updated'));
        try {
            const response = (await api.get<BranchesResponse>('/organization/branches')).data;
            setData(response);
            setAdminDrafts(Object.fromEntries(response.branches.map((branch) => [branch.id, branch.adminUserIds])));
        } catch (requestError) { setError(getError(requestError)); }
        finally { setLoading(false); }
    }, []);
    React.useEffect(() => { void load(); }, [load]);

    const saveAdmins = async (branch: OrganizationBranch) => {
        setBusyBranch(branch.id); setError('');
        try { await api.put(`/organization/branches/${branch.id}/administrators`, { adminUserIds: adminDrafts[branch.id] || [] }); await load(true); }
        catch (requestError) { setError(getError(requestError)); }
        finally { setBusyBranch(''); }
    };
    const openEmployees = (branch: OrganizationBranch) => {
        setEmployeeBranch(branch); setEmployeeIds(data.employees.filter((employee) => employee.branchId === branch.id).map((employee) => employee.id)); setEmployeeSearch('');
    };
    const saveEmployees = async () => {
        if (!employeeBranch) return;
        setBusyBranch(employeeBranch.id); setError('');
        try { await api.put(`/organization/branches/${employeeBranch.id}/employees`, { employeeIds }); setEmployeeBranch(null); await load(true); }
        catch (requestError) { setError(getError(requestError)); }
        finally { setBusyBranch(''); }
    };
    const openAdmin = (branch: OrganizationBranch) => { setAdminBranch(branch); setAdminDraft({ name: '', email: '', password: '' }); setShowPassword(false); };
    const createAdmin = async (event: React.FormEvent) => {
        event.preventDefault(); if (!adminBranch) return;
        setBusyBranch(adminBranch.id); setError('');
        try { await api.post(`/organization/branches/${adminBranch.id}/administrators`, adminDraft); setAdminBranch(null); await load(true); }
        catch (requestError) { setError(getError(requestError)); }
        finally { setBusyBranch(''); }
    };

    // New branches start in the country of the existing branches.
    const openNewBranch = () => {
        setBranchError('');
        setBranchEditor({ form: { name: '', location: '', phone: '', countryCode: data.branches.find((branch) => branch.countryCode)?.countryCode || '', city: '' } });
    };
    const openEditBranch = (branch: OrganizationBranch) => {
        setBranchError('');
        setBranchEditor({ id: branch.id, form: { name: branch.name, location: branch.location, phone: branch.phone, countryCode: branch.countryCode, city: branch.city } });
    };
    const saveBranch = async (form: BranchForm) => {
        if (!branchEditor) return;
        setBranchSaving(true); setBranchError('');
        try {
            if (branchEditor.id) await api.patch(`/organization/branches/${branchEditor.id}`, form);
            else await api.post('/organization/branches', form);
            setBranchEditor(null);
            await load(true);
        } catch (requestError) { setBranchError(getError(requestError)); }
        finally { setBranchSaving(false); }
    };

    const employeesFor = (branchId: string) => data.employees.filter((employee) => employee.branchId === branchId);
    const availableEmployees = employeeBranch ? data.employees.filter((employee) => !employee.branchId || employee.branchId === employeeBranch.id) : [];
    const filteredEmployees = availableEmployees.filter((employee) => [employee.fullName, employee.employeeCode, employee.designation, employee.email].some((value) => value?.toLowerCase().includes(employeeSearch.toLowerCase())));
    const selectedAdmins = (branch: OrganizationBranch): OrganizationAdmin[] => data.administrators.filter((admin) => (adminDrafts[branch.id] || []).includes(admin.id));

    return <OrganizationPageLayout icon={<Building2 />} title="Branches" description="Add branches, manage branch administrators and see the employees assigned to each location."
        action={<Button variant="contained" startIcon={<Plus size={18} />} onClick={openNewBranch} disabled={loading}>Add Branch</Button>}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : data.branches.length === 0 ?
            <Card variant="outlined"><CardContent sx={{ py: 8, textAlign: 'center' }}><Building2 size={42} /><Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>No branches found</Typography><Typography color="text.secondary">Use Add Branch to create the first branch.</Typography></CardContent></Card> :
            <Stack spacing={2.5}>{data.branches.map((branch) => {
                const branchEmployees = employeesFor(branch.id);
                const unchanged = JSON.stringify([...(adminDrafts[branch.id] || [])].sort()) === JSON.stringify([...branch.adminUserIds].sort());
                return <Card key={branch.id} variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
                    <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={2}>
                            <Stack direction="row" spacing={1.5}><Avatar variant="rounded" sx={{ bgcolor: 'primary.main' }}><Building2 size={21} /></Avatar><Box><Typography variant="h6" fontWeight={900}>{branch.name}</Typography><Typography variant="body2" color="text.secondary">{[branch.location, [branch.city, branch.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'No address recorded'}</Typography><Typography variant="caption" color="text.secondary">{branch.phone}</Typography></Box></Stack>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Chip icon={<UsersRound size={15} />} label={`${branchEmployees.length} employee${branchEmployees.length === 1 ? '' : 's'}`} /><Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => openEditBranch(branch)}>Edit</Button><Button variant="outlined" startIcon={<UserPlus size={17} />} onClick={() => openEmployees(branch)}>Assign employees</Button></Stack>
                        </Stack>
                        <Divider sx={{ my: 2.5 }} />
                        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'flex-start' }}>
                            <Autocomplete multiple fullWidth options={data.administrators} value={selectedAdmins(branch)} getOptionLabel={(option) => `${option.name} · ${option.email}`} isOptionEqualToValue={(option, value) => option.id === value.id}
                                onChange={(_event, values) => setAdminDrafts((current) => ({ ...current, [branch.id]: values.map((value) => value.id) }))}
                                renderInput={(params) => <TextField {...params} label="Branch administrators" helperText="The same administrator can manage multiple branches." />}
                                renderTags={(values, getTagProps) => values.map((value, index) => <Chip {...getTagProps({ index })} key={value.id} label={value.name} />)} />
                            <Button variant="contained" onClick={() => void saveAdmins(branch)} disabled={unchanged || busyBranch === branch.id} sx={{ minWidth: 100, mt: { lg: 1 } }}>Save</Button>
                            <Button variant="outlined" startIcon={<ShieldPlus size={17} />} onClick={() => openAdmin(branch)} sx={{ minWidth: 190, mt: { lg: 1 } }}>Create administrator</Button>
                        </Stack>
                    </CardContent>
                    <Box sx={{ bgcolor: 'action.hover' }}><TableContainer><Table size="small"><TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Code</TableCell><TableCell>Designation</TableCell><TableCell>Contact</TableCell><TableCell>Status</TableCell></TableRow></TableHead><TableBody>
                        {branchEmployees.length === 0 ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>No employees assigned to this branch.</TableCell></TableRow> : branchEmployees.map((employee) => <TableRow key={employee.id}><TableCell><Typography fontWeight={750}>{employee.fullName}</Typography></TableCell><TableCell>{employee.employeeCode}</TableCell><TableCell>{employee.designation || '—'}</TableCell><TableCell>{employee.email || employee.phoneNumber || '—'}</TableCell><TableCell><Chip size="small" color={employee.status === 'active' ? 'success' : 'default'} label={employee.status} /></TableCell></TableRow>)}
                    </TableBody></Table></TableContainer></Box>
                </Card>;
            })}</Stack>}

        <Dialog open={Boolean(employeeBranch)} onClose={() => !busyBranch && setEmployeeBranch(null)} fullWidth maxWidth="sm"><DialogTitle>Assign employees to {employeeBranch?.name}</DialogTitle><DialogContent><TextField fullWidth placeholder="Search employees" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} sx={{ mt: 1, mb: 1 }} InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }} /><Typography variant="caption" color="text.secondary">Employees already assigned to another branch are managed from that branch.</Typography><List sx={{ maxHeight: 420, overflow: 'auto', mt: 1 }}>{filteredEmployees.map((employee: OrganizationEmployee) => <ListItem key={employee.id} disablePadding><ListItemButton onClick={() => setEmployeeIds((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])}><Checkbox edge="start" checked={employeeIds.includes(employee.id)} /><ListItemAvatar><Avatar>{initials(employee.fullName)}</Avatar></ListItemAvatar><ListItemText primary={employee.fullName} secondary={`${employee.employeeCode}${employee.designation ? ` · ${employee.designation}` : ''}`} /></ListItemButton></ListItem>)}{filteredEmployees.length === 0 && <Typography align="center" color="text.secondary" sx={{ py: 4 }}>No available employees.</Typography>}</List></DialogContent><DialogActions><Button onClick={() => setEmployeeBranch(null)}>Cancel</Button><Button variant="contained" onClick={() => void saveEmployees()} disabled={Boolean(busyBranch)}>Save Assignments</Button></DialogActions></Dialog>

        <Dialog open={Boolean(adminBranch)} onClose={() => !busyBranch && setAdminBranch(null)} fullWidth maxWidth="sm"><Box component="form" onSubmit={createAdmin}><DialogTitle>Create administrator for {adminBranch?.name}</DialogTitle><DialogContent><Alert severity="info" sx={{ mb: 2 }}>This administrator will be linked to this branch and can also be assigned to other branches.</Alert><Stack spacing={2}><TextField label="Administrator name" value={adminDraft.name} onChange={(event) => setAdminDraft({ ...adminDraft, name: event.target.value })} required autoFocus /><TextField label="Login email" type="email" value={adminDraft.email} onChange={(event) => setAdminDraft({ ...adminDraft, email: event.target.value })} required /><TextField label="Password" type={showPassword ? 'text' : 'password'} value={adminDraft.password} onChange={(event) => setAdminDraft({ ...adminDraft, password: event.target.value })} required helperText="Use at least 8 characters." InputProps={{ endAdornment: <InputAdornment position="end"><Tooltip title={showPassword ? 'Hide password' : 'Show password'}><IconButton onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</IconButton></Tooltip></InputAdornment> }} /></Stack></DialogContent><DialogActions><Button onClick={() => setAdminBranch(null)}>Cancel</Button><Button type="submit" variant="contained" disabled={Boolean(busyBranch)}>{busyBranch ? 'Creating...' : 'Create & Bind'}</Button></DialogActions></Box></Dialog>

        {branchEditor && <BranchDialog title={branchEditor.id ? 'Edit branch' : 'Add branch'} submitLabel={branchEditor.id ? 'Save Changes' : 'Add Branch'} initial={branchEditor.form}
            saving={branchSaving} error={branchError} onClose={() => setBranchEditor(null)} onSave={(form) => void saveBranch(form)} />}
    </OrganizationPageLayout>;
}
