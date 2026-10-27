import WorkflowHistory from '../../components/Payroll/WorkflowHistory';
import { useLocation, useSearchParams } from 'react-router-dom';
import { compactPayrollSx } from '../../components/Payroll/PayrollLayout';
import { workflowFiltersSx } from '../../components/Payroll/PayrollLayout';
import React from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import api from '../../api/axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { hasScreenAccess } from '../../lib/screenPermissions';
import { dateToday, PayrollTable, requestError } from '../../components/Payroll/PayrollShared';
import WorkflowNav from '../../components/Payroll/WorkflowNav';
interface Period { _id: string; month: string; closed: boolean; reason: string; history: Array<{ action: string; at: string; reason: string; actorId?: string; actorName?: string }> }
export default function PeriodsPage() {
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const linkedRecord = query.get('periodId');
  const openedNotice = React.useRef('');
  const user = useSelector((s: RootState) => s.auth.user);
  const canClose = hasScreenAccess(user, 'finance_period_close'), canReopen = hasScreenAccess(user, 'finance_period_reopen');
  const [rows, setRows] = React.useState<Period[]>([]);
  const [month, setMonth] = React.useState(dateToday().slice(0, 7));
  const [closed, setClosed] = React.useState(canClose);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const [historyPeriod, setHistoryPeriod] = React.useState<Period>();
  const epoch = React.useRef(0);
  const context = React.useRef(0);
  React.useEffect(() => setClosed(canClose), [canClose]);
  const load = React.useCallback(async () => {
    const n = ++epoch.current; setLoading(true);
    try { const { data } = await api.get<Period[]>('/finance/periods'); if (n === epoch.current) { setRows(data); setError(''); } }
    catch (e) { if (n === epoch.current) setError(requestError(e)); }
    finally { if (n === epoch.current) setLoading(false); }
  }, []);
  React.useEffect(() => {
    void load();
    const changed = () => { setQuery({}, { replace: true }); context.current++; setBusy(false); setError(''); setRows([]); setHistoryPeriod(undefined); setReason(''); setConfirm(false); setNotice(''); void load(); };
    window.addEventListener('itemhive-workspace-changed', changed);
    return () => { context.current++; epoch.current++; window.removeEventListener('itemhive-workspace-changed', changed); };
  }, [load]);
  React.useEffect(() => {
    const key = location.key + ':' + linkedRecord;
    if (!linkedRecord || openedNotice.current === key) return;
    const record = rows.find(row => row._id === linkedRecord);
    if (record) { openedNotice.current = key; setHistoryPeriod(record); }
  }, [linkedRecord, location.key, rows]);
  const currentClosed = rows.find(p => p.month === month)?.closed || false;
  const save = async () => {
    const current = context.current;
    const isCurrent = () => current === context.current;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.post('/finance/periods', { month, closed, reason: closed ? '' : reason });
      if (!isCurrent()) return;
      setConfirm(false); setReason(''); await load();
      if (isCurrent()) setNotice(`${month} is now ${closed ? 'closed' : 'open'}.`);
    }
    catch (e) { if (isCurrent()) setError(requestError(e)); }
    finally { if (isCurrent()) setBusy(false); }
  };
  return <Stack gap={2} sx={compactPayrollSx}>
    <WorkflowNav area="finance" /><Typography variant="h4" fontWeight={800}>Period Close</Typography>
    <Alert severity="info">Check cash, bank, unpaid expenses, salaries and loans first. Close the month to stop new entries. Reopen it with a reason if changes are needed.</Alert>
    {(busy || loading) && <LinearProgress />}{error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    <Stack sx={workflowFiltersSx}>
      <TextField label="Month" type="month" value={month} slotProps={{ inputLabel: { shrink: true } }} onChange={e => setMonth(e.target.value)} />
      <TextField select label="Action" value={closed ? 'close' : 'reopen'} onChange={e => setClosed(e.target.value === 'close')}><MenuItem value="close" disabled={!canClose}>Close month</MenuItem><MenuItem value="reopen" disabled={!canReopen}>Reopen month</MenuItem></TextField>
      {!closed && <TextField required label="Reason for reopening" value={reason} onChange={e => setReason(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />}
      <Button variant="contained" disabled={busy || loading || !!error || (!closed && !reason.trim()) || !month || closed === currentClosed || (closed ? !canClose : !canReopen)} onClick={() => setConfirm(true)}>{closed ? 'Review & close' : 'Review & reopen'}</Button>
      <Button disabled={busy || loading} onClick={() => void load()}>Refresh</Button>
    </Stack>
    {!loading && !error && month && <Typography color="text.secondary">{month} is currently {currentClosed ? 'closed' : 'open'}. Months without a closure record are open.</Typography>}
    <PayrollTable rows={rows} columns={[{ label: 'Month', value: p => p.month }, { label: 'Status', value: p => p.closed ? 'Closed' : 'Open' }, { label: 'Reason', value: p => p.reason }, { label: 'History', value: p => <Button onClick={() => setHistoryPeriod(p)}>View history</Button> }]} />
    <Dialog open={confirm} onClose={() => !busy && setConfirm(false)} fullWidth maxWidth="sm">
      <DialogTitle>{closed ? 'Close' : 'Reopen'} {month}?</DialogTitle>
      <DialogContent><Stack gap={2}><Typography>{closed ? 'Check the balances and finish all draft journals first. Closing stops new entries dated in this month.' : 'Reopening allows new entries in this month. Check the balances before closing it again.'}</Typography>{!closed && <Typography>Reason: {reason}</Typography>}{error && <Alert severity="error">{error}</Alert>}</Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setConfirm(false)}>Go back</Button><Button variant="contained" disabled={busy} onClick={() => void save()}>{closed ? 'Close month' : 'Reopen month'}</Button></DialogActions>
    </Dialog>
    <Dialog open={!!historyPeriod} onClose={() => setHistoryPeriod(undefined)} fullWidth maxWidth="md"><DialogTitle>Period history - {historyPeriod?.month}</DialogTitle><DialogContent><WorkflowHistory rows={[...(historyPeriod?.history || [])].reverse()} /></DialogContent><DialogActions><Button onClick={() => setHistoryPeriod(undefined)}>Close</Button></DialogActions></Dialog>
  </Stack>;
}
