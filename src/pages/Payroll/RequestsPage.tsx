import { useSearchParams } from 'react-router-dom';
import React from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import api from '../../api/axios';
import { PayrollTable, RequestForm, requestError, money } from '../../components/Payroll/PayrollShared';
import { compactPayrollSx, PayrollStats, requestDetails, StatusChip } from '../../components/Payroll/PayrollLayout';
import WorkflowNav from '../../components/Payroll/WorkflowNav';
import type { PayrollEmployee, PayrollRequest, PayrollLoan } from '../../types/payroll';

export default function RequestsPage({ kind, self = false }: { kind: 'leave' | 'loan' | 'work'; self?: boolean }) {
  const [query, setQuery] = useSearchParams();
  const linkedRequest = query.get('requestId');
  const user = useSelector((s: RootState) => s.auth.user);
  const kinds = kind === 'leave' ? ['leave'] : kind === 'loan' ? ['loan', 'advance'] : self ? ['overtime'] : ['overtime', 'attendance'];
  const [rows, setRows] = React.useState<PayrollRequest[]>([]);
  const [employees, setEmployees] = React.useState<PayrollEmployee[]>([]);
  const [balances, setBalances] = React.useState<Record<string, number>>({});
  const [loans, setLoans] = React.useState<PayrollLoan[]>([]);
  const [currency, setCurrency] = React.useState('PKR');
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState(false);
  const [decision, setDecision] = React.useState<{ row: PayrollRequest; status: string }>();
  const [reason, setReason] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState(linkedRequest || self ? '' : 'pending');
  const generation = React.useRef(0);
  const context = React.useRef(0);
  const load = React.useCallback(async () => {
    const epoch = ++generation.current; setLoading(true);
    try {
      if (self) {
        const { data } = await api.get<{ requests: PayrollRequest[]; currency: string; balances: Record<string, number>; loans: PayrollLoan[] }>('/me/payroll/requests-meta');
        if (epoch !== generation.current) return;
        setRows(data.requests); setCurrency(data.currency); setBalances(data.balances); setLoans(data.loans);
      } else {
        const [r, e, p] = await Promise.all([api.get<PayrollRequest[]>('/payroll/requests'), api.get<PayrollEmployee[]>('/payroll/request-employees'), api.get<{ currency: string }>('/payroll/settings')]);
        if (epoch !== generation.current) return; setRows(r.data); setEmployees(e.data); setCurrency(p.data.currency);
      } setError('');
    } catch (e) { if (epoch === generation.current) setError(requestError(e)); }
    finally { if (epoch === generation.current) setLoading(false); }
  }, [self]);
  React.useEffect(() => { void load(); const changed = () => { setQuery({}, { replace: true }); context.current++; setBusy(false); setNotice(''); setReason(''); setSearch(''); setStatus(self ? '' : 'pending'); setRows([]); setEmployees([]); setLoans([]); setBalances({}); setForm(false); setDecision(undefined); void load(); }; window.addEventListener('itemhive-workspace-changed', changed); return () => { context.current++; generation.current++; window.removeEventListener('itemhive-workspace-changed', changed); }; }, [load]);
  React.useEffect(() => { if (linkedRequest) { setSearch(''); setStatus(''); } }, [linkedRequest]);
  const name = (id: string) => employees.find(e => e._id === id)?.fullName || id;
  const filtered = rows.filter(r => (!linkedRequest || r._id === linkedRequest) && kinds.includes(r.kind) && (!status || r.status === status) && `${self ? '' : name(r.employeeId)} ${r.reason} ${requestDetails(r, currency)}`.toLowerCase().includes(search.toLowerCase()));
  const title = (self ? 'My ' : '') + (kind === 'leave' ? 'Leave Requests' : kind === 'loan' ? 'Loan & Advance Requests' : self ? 'Overtime Requests' : 'Overtime & Attendance Requests');
  const operate = async (fn: () => Promise<unknown>) => {
    const epoch = context.current;
    setBusy(true); setError(''); setNotice('');
    try {
      await fn(); if (epoch !== context.current) return;
      setForm(false); setDecision(undefined); await load();
      if (epoch === context.current) setNotice(decision ? 'Request updated.' : 'Request submitted for review.');
    } catch (e) { if (epoch === context.current) setError(requestError(e)); }
    finally { if (epoch === context.current) setBusy(false); }
  };
  return <Stack gap={2} sx={compactPayrollSx}><WorkflowNav area={self ? 'personal' : 'payroll'} /><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Typography variant="h4" fontWeight={800}>{title}</Typography><Stack direction="row" gap={1}><Button disabled={busy || loading} onClick={() => void load()}>Refresh</Button><Button variant="contained" disabled={busy || loading || !!error || (!self && !employees.length)} onClick={() => setForm(true)}>New {kind === 'loan' ? 'loan / advance' : kind === 'leave' ? 'leave' : 'work'} request</Button></Stack></Stack>
    <Typography color="text.secondary">{kind === 'loan' ? 'Submit a request. Another admin approves it. Then record the loan payment and repayments.' : kind === 'leave' ? 'Submit leave for approval. You can cancel it while it is pending.' : 'Submit overtime or attendance changes for approval. Check clock-in and clock-out times first.'}</Typography>
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}{loading && <LinearProgress />}{error && <Alert severity="error">{error === 'Employee not found in the selected business' ? 'Ask your admin to link your login to an employee profile.' : error}</Alert>}
    {self && kind === 'leave' && Object.keys(balances).length > 0 && <PayrollStats items={Object.entries(balances).map(([label, value]) => ({ label, value: value + ' days' }))} />}
    {linkedRequest && <Alert severity="info" action={<Button onClick={() => { setQuery({}, { replace: true }); setStatus(''); }}>Show all requests</Button>}>Showing the request from your notification.</Alert>}
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><TextField label="Search requests" size="small" value={search} onChange={e => setSearch(e.target.value)} /><TextField select sx={{ minWidth: 180 }} label="Status" size="small" value={status} onChange={e => setStatus(e.target.value)}><MenuItem value="">All statuses</MenuItem>{['pending', 'approved', 'rejected', 'cancelled'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField></Stack>
    <PayrollTable key={search + status} emptyMessage={status === 'pending' ? 'No pending requests match. Choose All statuses to see earlier decisions.' : 'No requests match these filters.'} rows={filtered} columns={[...(!self ? [{ label: 'Employee', value: (r: PayrollRequest) => name(r.employeeId) }] : []), { label: 'Type', value: r => r.kind }, { label: 'Details', value: r => requestDetails(r, currency) }, { label: 'Reason', value: r => r.reason }, { label: 'Status', value: r => <StatusChip status={r.status} /> }, { label: 'Decision', value: r => r.decisionReason || '—' }]} actions={r => <>{r.status === 'pending' && (self ? <Button disabled={busy} color="error" onClick={() => { setReason(''); setDecision({ row: r, status: 'cancelled' }); }}>Cancel</Button> : <>{r.createdBy !== user?.id && r.canApprove !== false && <Button disabled={busy} onClick={() => { setReason(''); setDecision({ row: r, status: 'approved' }); }}>Approve</Button>}<Button color="error" disabled={busy} onClick={() => { setReason(''); setDecision({ row: r, status: 'rejected' }); }}>Reject</Button></>)}{!self && r.status === 'approved' && ['leave', 'overtime', 'attendance'].includes(r.kind) && <Button disabled={busy} color="error" onClick={() => { setReason(''); setDecision({ row: r, status: 'cancelled' }); }}>Cancel approval</Button>}</>} />
    {self && kind === 'loan' && <><Typography variant="h6">Approved loans & recovery</Typography><PayrollTable rows={loans} columns={[{ label: 'Type', value: l => l.kind }, { label: 'Principal', value: l => money(l.principalMinor, currency) }, { label: 'Monthly recovery', value: l => money(l.installmentMinor, currency) }, { label: 'Outstanding', value: l => money(l.balanceMinor, currency) }, { label: 'Recovery starts', value: l => l.startMonth }, { label: 'Status', value: l => <StatusChip status={l.status} /> }]} /></>}
    <Dialog open={form} onClose={() => !busy && setForm(false)} fullWidth maxWidth="sm"><DialogTitle>{title} · {currency}</DialogTitle><DialogContent><RequestForm key={kind} self={self} initialKind={kinds[0]} allowedKinds={kinds} employees={employees} busy={busy} submit={body => void operate(() => api.post(self ? '/me/payroll/requests' : '/payroll/requests', body))} />{error && <Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={() => setForm(false)}>Close</Button></DialogActions></Dialog>
    <Dialog open={!!decision} onClose={() => !busy && setDecision(undefined)} fullWidth maxWidth="sm"><DialogTitle>{decision?.status === 'cancelled' ? 'Cancel request' : decision?.status === 'approved' ? 'Approve request' : 'Reject request'}</DialogTitle><DialogContent><Stack gap={2}><Typography>{decision && requestDetails(decision.row, currency)}</Typography>{!self && decision?.status !== 'approved' && <TextField required label="Reason" value={reason} onChange={e => setReason(e.target.value)} />}{error && <Alert severity="error">{error}</Alert>}</Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setDecision(undefined)}>Close</Button><Button variant="contained" disabled={busy || (!self && decision?.status !== 'approved' && !reason.trim())} onClick={() => decision && void operate(() => api.post(self ? `/me/payroll/requests/${decision.row._id}/cancel` : `/payroll/requests/${decision.row._id}/decision`, self ? {} : { status: decision.status, reason }))}>{decision?.status === 'approved' ? 'Approve request' : decision?.status === 'cancelled' ? 'Cancel request' : 'Reject request'}</Button></DialogActions></Dialog>
  </Stack>;
}
