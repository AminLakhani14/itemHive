import React from 'react';
import axios from 'axios';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Building2, CalendarRange, Mail, MapPin, Network, Phone, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import OrganizationPageLayout from './OrganizationPageLayout';
import type { FiscalYear, OrganizationOverview, OverviewEmployee } from './organizationTypes';

const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || 'Unable to complete this request.' : 'Unable to complete this request.';
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const showDate = (dateKey: string) => format(parseISO(dateKey), 'd MMM yyyy');
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function fiscalStatus(year: FiscalYear, today: string) {
    const totalDays = differenceInCalendarDays(parseISO(year.endDate), parseISO(year.startDate)) + 1;
    if (today < year.startDate) return { progress: 0, label: `Starts in ${plural(differenceInCalendarDays(parseISO(year.startDate), parseISO(today)), 'day')}`, ended: false };
    if (today > year.endDate) return { progress: 100, label: `Ended ${plural(differenceInCalendarDays(parseISO(today), parseISO(year.endDate)), 'day')} ago`, ended: true };
    const elapsed = differenceInCalendarDays(parseISO(today), parseISO(year.startDate)) + 1;
    return { progress: (elapsed / totalDays) * 100, label: `Day ${elapsed} of ${totalDays} · ${plural(totalDays - elapsed, 'day')} left`, ended: false };
}

function StatTile({ icon, label, value, caption }: { icon: React.ReactNode; label: string; value: React.ReactNode; caption: string }) {
    return <Card variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', mb: 1 }}>{icon}<Typography variant="body2" fontWeight={700}>{label}</Typography></Stack>
        <Typography variant="h5" fontWeight={900} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{caption}</Typography>
    </CardContent></Card>;
}

function EmployeeTable({ employees, empty }: { employees: OverviewEmployee[]; empty: string }) {
    return <TableContainer sx={{ maxHeight: 340 }}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Designation</TableCell><TableCell>Department</TableCell><TableCell>Joined</TableCell><TableCell>Status</TableCell></TableRow></TableHead><TableBody>
        {employees.length === 0 ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>{empty}</TableCell></TableRow> : employees.map((employee) => <TableRow key={employee.id}>
            <TableCell><Typography fontWeight={750}>{employee.fullName}</Typography><Typography variant="caption" color="text.secondary">{employee.employeeCode}</Typography></TableCell>
            <TableCell>{employee.designation || '—'}</TableCell>
            <TableCell>{employee.departmentName || '—'}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{employee.joiningDate ? showDate(employee.joiningDate) : '—'}</TableCell>
            <TableCell><Chip size="small" color={employee.status === 'active' ? 'success' : 'default'} label={employee.status} /></TableCell>
        </TableRow>)}
    </TableBody></Table></TableContainer>;
}

export default function OrganizationOverviewPage() {
    const navigate = useNavigate();
    const [data, setData] = React.useState<OrganizationOverview | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const generation = React.useRef(0);

    const load = React.useCallback(async () => {
        const current = ++generation.current;
        setLoading(true); setError('');
        try {
            const response = (await api.get<OrganizationOverview>('/organization/overview')).data;
            if (current === generation.current) setData(response);
        } catch (requestError) { if (current === generation.current) setError(getError(requestError)); }
        finally { if (current === generation.current) setLoading(false); }
    }, []);
    React.useEffect(() => {
        void load();
        // Super admins switching clients must not keep seeing the previous client's structure.
        const changed = () => { setData(null); void load(); };
        window.addEventListener('itemhive-workspace-changed', changed);
        return () => { ++generation.current; window.removeEventListener('itemhive-workspace-changed', changed); };
    }, [load]);

    const header = (children: React.ReactNode) => <OrganizationPageLayout icon={<Network />} title="Organization" description="Overview of this client's branches, fiscal year, and people.">{children}</OrganizationPageLayout>;
    if (loading && !data) return header(<Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>);
    if (!data) return header(<Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Retry</Button>}>{error || 'Unable to load the organization.'}</Alert>);

    const today = format(new Date(), 'yyyy-MM-dd');
    const currentYear = data.fiscalYears.find((year) => year.isCurrent) || null;
    const runningYear = data.fiscalYears.find((year) => year.startDate <= today && today <= year.endDate) || null;
    const nextYear = data.fiscalYears.find((year) => year.startDate > (currentYear?.endDate || today)) || null;
    const status = currentYear && fiscalStatus(currentYear, today);
    const activeEmployees = data.employees.filter((employee) => employee.status === 'active');
    const unassigned = data.employees.filter((employee) => !employee.branchId || !data.branches.some((branch) => branch.id === employee.branchId));
    const adminCount = new Set(data.branches.flatMap((branch) => branch.administrators.map((admin) => admin.id))).size;
    const contact = [data.client.contact.name, data.client.contact.email, data.client.contact.phone].filter(Boolean);
    const withoutDepartment = data.employees.filter((employee) => !employee.departmentName).length;

    return header(<Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        <Card variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                <Avatar variant="rounded" sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontWeight: 900 }}>{initials(data.client.name)}</Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Typography variant="h5" fontWeight={900}>{data.client.name}</Typography><Chip size="small" color={data.client.isActive ? 'success' : 'default'} label={data.client.isActive ? 'Active client' : 'Inactive client'} /></Stack>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 0.75, color: 'text.secondary' }}>
                        {data.client.contact.name && <Stack direction="row" spacing={0.5} alignItems="center"><UserRound size={15} /><Typography variant="body2">{data.client.contact.name}</Typography></Stack>}
                        {data.client.contact.email && <Stack direction="row" spacing={0.5} alignItems="center"><Mail size={15} /><Typography variant="body2">{data.client.contact.email}</Typography></Stack>}
                        {data.client.contact.phone && <Stack direction="row" spacing={0.5} alignItems="center"><Phone size={15} /><Typography variant="body2">{data.client.contact.phone}</Typography></Stack>}
                        {contact.length === 0 && <Typography variant="body2">No client contact recorded.</Typography>}
                    </Stack>
                </Box>
                {data.client.createdAt && <Typography variant="body2" color="text.secondary">Client since {format(new Date(data.client.createdAt), 'd MMM yyyy')}</Typography>}
            </Stack>
        </CardContent></Card>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
            <StatTile icon={<CalendarRange size={17} />} label="Fiscal year" value={currentYear?.name || 'Not set'} caption={status?.label || 'No current fiscal year selected'} />
            <StatTile icon={<Building2 size={17} />} label="Branches" value={data.branches.length} caption={plural(adminCount, 'administrator')} />
            <StatTile icon={<UsersRound size={17} />} label="Active employees" value={activeEmployees.length} caption={`${data.employees.length} total · ${data.employees.length - activeEmployees.length} inactive`} />
            <StatTile icon={<Network size={17} />} label="Departments" value={data.departments.filter((item) => item.isActive).length} caption={`${data.departments.length} total`} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
            <Stack spacing={2.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6" fontWeight={850}>Branches</Typography><Button size="small" onClick={() => navigate('/organization/branches')}>Manage branches</Button></Stack>
                {data.branches.length === 0 && <Card variant="outlined"><CardContent sx={{ py: 6, textAlign: 'center' }}><Building2 size={36} /><Typography fontWeight={800} sx={{ mt: 1 }}>No branches found</Typography><Typography variant="body2" color="text.secondary">Branches created during client onboarding will appear here.</Typography></CardContent></Card>}
                {data.branches.map((branch) => {
                    const employees = data.employees.filter((employee) => employee.branchId === branch.id);
                    const active = employees.filter((employee) => employee.status === 'active').length;
                    const byDepartment = [...employees.reduce((counts, employee) => counts.set(employee.departmentName || 'No department', (counts.get(employee.departmentName || 'No department') || 0) + 1), new Map<string, number>())];
                    return <Card key={branch.id} variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
                        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                                <Stack direction="row" spacing={1.5} sx={{ minWidth: 0 }}><Avatar variant="rounded" sx={{ bgcolor: 'primary.main' }}><Building2 size={20} /></Avatar><Box sx={{ minWidth: 0 }}>
                                    <Typography variant="h6" fontWeight={900}>{branch.name}</Typography>
                                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}><MapPin size={14} /><Typography variant="body2">{[branch.location, branch.city, branch.country].filter(Boolean).join(' · ')}</Typography></Stack>
                                    {branch.phone && <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}><Phone size={14} /><Typography variant="caption">{branch.phone}</Typography></Stack>}
                                </Box></Stack>
                                <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap><Chip color="success" variant="outlined" label={`${active} active`} /><Chip label={plural(employees.length, 'employee')} /></Stack>
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                                <ShieldCheck size={16} /><Typography variant="body2" fontWeight={700}>Administrators:</Typography>
                                {branch.administrators.length === 0 ? <Typography variant="body2" color="text.secondary">None assigned</Typography> : branch.administrators.map((admin) => <Chip key={admin.id} size="small" variant="outlined" label={admin.name} title={admin.email} />)}
                            </Stack>
                            {byDepartment.length > 0 && <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                                <UsersRound size={16} /><Typography variant="body2" fontWeight={700}>Departments:</Typography>
                                {byDepartment.map(([name, count]) => <Chip key={name} size="small" label={`${name} · ${count}`} />)}
                            </Stack>}
                        </CardContent>
                        <Divider />
                        <EmployeeTable employees={employees} empty="No employees assigned to this branch." />
                    </Card>;
                })}
                {unassigned.length > 0 && <Card variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden', borderColor: 'warning.main' }}>
                    <CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
                        <Box><Typography variant="h6" fontWeight={850}>Not assigned to a branch</Typography><Typography variant="body2" color="text.secondary">{plural(unassigned.length, 'employee')} without a branch.</Typography></Box>
                        <Button variant="outlined" onClick={() => navigate('/organization/branches')}>Assign in Branches</Button>
                    </Stack></CardContent>
                    <Divider />
                    <EmployeeTable employees={unassigned} empty="" />
                </Card>}
            </Stack>

            <Stack spacing={2.5}>
                <Card variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Typography variant="h6" fontWeight={850}>Fiscal year</Typography><Button size="small" onClick={() => navigate('/organization/fiscal-years')}>Manage</Button></Stack>
                    {currentYear && status ? <>
                        <Stack direction="row" spacing={1} alignItems="center"><Typography variant="h5" fontWeight={900}>{currentYear.name}</Typography><Chip size="small" color="primary" label="Current" /></Stack>
                        <Typography variant="body2" color="text.secondary">{showDate(currentYear.startDate)} to {showDate(currentYear.endDate)}</Typography>
                        <LinearProgress variant="determinate" value={status.progress} color={status.ended ? 'warning' : 'primary'} sx={{ mt: 2, height: 8, borderRadius: 99 }} />
                        <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }}>{status.label}</Typography>
                        {status.ended && <Alert severity="warning" sx={{ mt: 1.5 }}>This fiscal year has ended. {nextYear ? `Mark ${nextYear.name} as current.` : 'Add the next fiscal year.'}</Alert>}
                    </> : <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => navigate('/organization/fiscal-years')}>Set up</Button>}>
                        {runningYear ? `${runningYear.name} covers today but is not marked as current.` : 'No current fiscal year is selected.'}
                    </Alert>}
                    {nextYear && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>Next: {nextYear.name} starts {showDate(nextYear.startDate)}</Typography>}
                </CardContent></Card>

                <Card variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}><Typography variant="h6" fontWeight={850}>Departments</Typography><Button size="small" onClick={() => navigate('/organization/departments')}>Manage</Button></Stack>
                    {data.departments.length === 0 ? <Typography variant="body2" color="text.secondary">No departments yet.</Typography> : <Stack divider={<Divider flexItem />}>
                        {data.departments.map((department) => {
                            const count = data.employees.filter((employee) => employee.departmentId === department.id).length;
                            return <Stack key={department.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1 }}>
                                <Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={700}>{department.name}</Typography>{!department.isActive && <Chip size="small" label="Inactive" />}</Stack>
                                <Typography variant="body2" color="text.secondary">{plural(count, 'employee')}</Typography>
                            </Stack>;
                        })}
                    </Stack>}
                    {withoutDepartment > 0 && <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>{plural(withoutDepartment, 'employee')} without a department.</Typography>}
                </CardContent></Card>
            </Stack>
        </Box>
    </Stack>);
}
