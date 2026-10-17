import React from 'react';
import { Alert, Avatar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, LinearProgress, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Plus, RefreshCw, Wallet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { exportRows, money, Payslip, PayrollTable, requestError, RequestForm } from '../../components/Payroll/PayrollShared';
import { compactPayrollSx, PayrollSection, PayrollStats, requestDetails, StatusChip } from '../../components/Payroll/PayrollLayout';
import type { MyPayroll, PayrollItem } from '../../types/payroll';
const tabs = ['overview', 'payslips', 'requests', 'loans', 'payments'] as const;
export default function MyPayrollPage() {
  const [data, setData] = React.useState<MyPayroll>();
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [requestKind, setRequestKind] = React.useState<string>();
  const [slip, setSlip] = React.useState<PayrollItem>();
  const [cancelId, setCancelId] = React.useState('');
  const [params, setParams] = useSearchParams();
  const tab = tabs.find(t => t === params.get('tab')) || 'overview';
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current; setLoading(true);
    try { const result = (await api.get<MyPayroll>('/me/payroll')).data; if (current !== generation.current) return; setError(''); setData(result); }
    catch (e) { if (current !== generation.current) return; setData(undefined); setError(requestError(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }, []);
  React.useEffect(() => {
    void load();
    const changed = () => { setData(undefined); setSlip(undefined); setRequestKind(undefined); setCancelId(''); void load(); };
    window.addEventListener('itemhive-workspace-changed', changed);
    return () => { generation.current++; window.removeEventListener('itemhive-workspace-changed', changed); };
  }, [load]);
  const currency = data?.currency || 'PKR';
  const latest = data?.payslips[0];
  const match = (values: unknown[], rowStatus?: string) => (!status || rowStatus === status) && values.join(' ').toLowerCase().includes(search.toLowerCase());
  const requests = data?.requests.filter(r => match([r.kind, r.reason, requestDetails(r, currency), r.decisionReason], r.status)) || [];
  const loans = data?.loans.filter(l => match([l.kind, l.startMonth], l.status)) || [];
  const payslips = data?.payslips.filter(p => match([p.month, p.kind], p.paymentStatus)) || [];
  const payments = data?.payments.filter(p => match([p.dateKey, p.method, p.reference], p.reversedAt ? 'reversed' : 'recorded')) || [];
  const statuses = tab === 'requests' ? ['pending', 'approved', 'rejected', 'cancelled'] : tab === 'loans' ? ['approved', 'disbursed', 'settled', 'cancelled'] : tab === 'payments' ? ['recorded', 'reversed'] : ['unpaid', 'partially_paid', 'paid'];
  const requestTable = (overview = false) => <PayrollTable rows={overview ? (data?.requests || []).slice(0, 5) : requests} columns={[
    { label: 'Type', value: r => r.kind }, { label: 'Details', value: r => requestDetails(r, currency) }, { label: 'Reason', value: r => r.reason },
    { label: 'Status', value: r => <StatusChip status={r.status} /> }, { label: 'Decision', value: r => r.decisionReason || '—' },
  ]} actions={r => r.status === 'pending' && <Button color="error" disabled={busy} onClick={() => setCancelId(r._id)}>Cancel</Button>} />;
  return <Stack gap={2} sx={compactPayrollSx}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h4" fontWeight={800}>My Payroll</Typography><Stack direction="row" gap={1}>
      <IconButton aria-label="Refresh payroll" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={18} /></IconButton>
      <Button variant="contained" startIcon={<Plus size={16} />} disabled={!data || busy} onClick={() => setRequestKind('leave')}>New request</Button></Stack></Stack>
    {loading && <LinearProgress />}
    {error && <Alert severity="error" onClose={() => setError('')}>{error === 'Employee not found in the selected business' ? 'No employee profile linked. Ask your admin to create your login from Employee Profile.' : error}</Alert>}
    {data && <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 3 }}><Stack gap={2}>
        <Card variant="outlined"><CardContent><Stack alignItems="center" gap={1}><Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main' }}><Wallet size={24} /></Avatar><Typography fontWeight={800}>{data.employee.fullName}</Typography><Typography variant="caption" color="text.secondary">{data.employee.employeeCode} · {currency}</Typography></Stack></CardContent></Card>
        <Card variant="outlined"><CardContent><PayrollSection title="Request"><Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>{['leave', 'loan', 'advance', 'overtime'].map(kind => <Button key={kind} variant="outlined" sx={{ textTransform: 'capitalize' }} onClick={() => setRequestKind(kind)}>{kind}</Button>)}</Box></PayrollSection></CardContent></Card>
        <Card variant="outlined"><CardContent><PayrollSection title="Leave balance">{Object.entries(data.balances).map(([kind, days]) => <Stack key={kind} direction="row" justifyContent="space-between"><Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{kind}</Typography><Typography variant="body2" fontWeight={800}>{days} days</Typography></Stack>)}</PayrollSection></CardContent></Card>
      </Stack></Grid>
      <Grid size={{ xs: 12, lg: 9 }}><Stack gap={2}>
        <PayrollStats items={[{ label: latest ? 'Latest net · ' + latest.month : 'Latest net pay', value: money(latest?.netMinor || 0, latest?.currency || currency) }, { label: 'Latest outstanding', value: money(latest?.outstandingMinor || 0, latest?.currency || currency) }, { label: 'Loan balance', value: money(data.loans.reduce((sum, l) => sum + l.balanceMinor, 0), currency) }, { label: 'Pending requests', value: data.requests.filter(r => r.status === 'pending').length }]} />
        <Card variant="outlined"><Tabs value={tab} variant="scrollable" scrollButtons="auto" onChange={(_, value) => { setParams({ tab: value }); setSearch(''); setStatus(''); }}>{tabs.map(t => <Tab key={t} value={t} label={t === 'loans' ? 'Loans & advances' : t.charAt(0).toUpperCase() + t.slice(1)} />)}</Tabs>
          <CardContent><Stack gap={2}>
            {tab !== 'overview' && <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><TextField size="small" label="Search" value={search} onChange={e => setSearch(e.target.value)} sx={{ flex: 1 }} /><TextField size="small" select label="Status" value={status} onChange={e => setStatus(e.target.value)}><MenuItem value="">All statuses</MenuItem>{statuses.map(s => <MenuItem key={s} value={s}>{s.replaceAll('_', ' ')}</MenuItem>)}</TextField></Stack>}
            {tab === 'overview' && <><PayrollSection title="Latest payslip" action={latest && <Button onClick={() => setSlip(latest)}>View / PDF</Button>}>{latest ? <PayrollStats items={[{ label: 'Gross', value: money(latest.grossMinor, latest.currency || currency) }, { label: 'Deductions', value: money(latest.deductionsMinor, latest.currency || currency) }, { label: 'Paid', value: money(latest.paidMinor || 0, latest.currency || currency) }]} /> : <Typography variant="body2" color="text.secondary">No released payslips.</Typography>}</PayrollSection><PayrollSection title="Recent requests" action={<Button onClick={() => setParams({ tab: 'requests' })}>View all</Button>}>{requestTable(true)}</PayrollSection></>}
            {tab === 'payslips' && <PayrollTable rows={payslips} columns={[
              { label: 'Month', value: p => p.month }, { label: 'Type', value: p => p.kind || 'regular' }, { label: 'Gross', value: p => money(p.grossMinor, p.currency || currency) }, { label: 'Deductions', value: p => money(p.deductionsMinor, p.currency || currency) }, { label: 'Net', value: p => money(p.netMinor, p.currency || currency) }, { label: 'Paid', value: p => money(p.paidMinor || 0, p.currency || currency) }, { label: 'Outstanding', value: p => money(p.outstandingMinor || 0, p.currency || currency) }, { label: 'Status', value: p => <StatusChip status={p.paymentStatus || 'unpaid'} /> },
            ]} actions={p => <Button onClick={() => setSlip(p)}>View / PDF</Button>} />}
            {tab === 'requests' && requestTable()}
            {tab === 'loans' && <PayrollTable rows={loans} columns={[{ label: 'Type', value: l => l.kind }, { label: 'Principal', value: l => money(l.principalMinor, currency) }, { label: 'Monthly recovery', value: l => money(l.installmentMinor, currency) }, { label: 'Outstanding', value: l => money(l.balanceMinor, currency) }, { label: 'Start month', value: l => l.startMonth }, { label: 'Status', value: l => <StatusChip status={l.status} /> }]} />}
            {tab === 'payments' && <><Button sx={{ alignSelf: 'flex-end' }} disabled={!payments.length} onClick={() => exportRows(payments.map(p => ({ Date: p.dateKey, Amount: p.amountMinor / 100, Currency: data.payslips.find(i => i.runId === p.runId)?.currency || currency, Method: p.method, Reference: p.reference, Status: p.reversedAt ? 'reversed' : 'recorded' })), 'my-payments', true)}>Export CSV</Button><PayrollTable rows={payments} columns={[{ label: 'Date', value: p => p.dateKey }, { label: 'Amount', value: p => money(p.amountMinor, data.payslips.find(i => i.runId === p.runId)?.currency || currency) }, { label: 'Method', value: p => p.method }, { label: 'Reference', value: p => p.reference }, { label: 'Status', value: p => <StatusChip status={p.reversedAt ? 'reversed' : 'recorded'} /> }, { label: 'Reversal reason', value: p => p.reversalReason || '—' }]} /></>}
          </Stack></CardContent>
        </Card>
      </Stack></Grid>
    </Grid>}
    <Dialog open={!!requestKind} onClose={() => !busy && setRequestKind(undefined)} fullWidth maxWidth="sm"><DialogTitle>New request</DialogTitle><DialogContent>{requestKind && <RequestForm key={requestKind} self initialKind={requestKind} employees={[]} busy={busy} submit={async request => { setBusy(true); setError(''); try { await api.post('/me/payroll/requests', request); setRequestKind(undefined); setParams({ tab: 'requests' }); await load(); } catch (e) { setError(requestError(e)); } finally { setBusy(false); } }} />}{error && <Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={() => setRequestKind(undefined)}>Close</Button></DialogActions></Dialog>
    <Dialog open={!!cancelId} onClose={() => !busy && setCancelId('')} fullWidth maxWidth="xs"><DialogTitle>Cancel request?</DialogTitle><DialogActions><Button disabled={busy} onClick={() => setCancelId('')}>Keep request</Button><Button color="error" disabled={busy} onClick={async () => { setBusy(true); try { await api.post('/me/payroll/requests/' + cancelId + '/cancel'); setCancelId(''); await load(); } catch (e) { setError(requestError(e)); } finally { setBusy(false); } }}>Cancel request</Button></DialogActions></Dialog>
    <Dialog open={!!slip} onClose={() => setSlip(undefined)} fullWidth maxWidth="lg"><DialogTitle>Payslip · {slip?.month}</DialogTitle><DialogContent>{slip && <Stack gap={2}><Payslip item={slip} currency={slip.currency || currency} /><PayrollSection title="Attendance"><PayrollTable rows={slip.days} columns={[{ label: 'Date', value: d => d.date }, { label: 'Status', value: d => d.status }, { label: 'Worked minutes', value: d => d.workedMinutes }, { label: 'Overtime minutes', value: d => d.overtimeMinutes }, { label: 'Payable units', value: d => d.payableUnits }]} /></PayrollSection></Stack>}</DialogContent><DialogActions><Button onClick={() => setSlip(undefined)}>Close</Button></DialogActions></Dialog>
  </Stack>;
}
