import React from 'react';
import { Alert, Button, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import api from '../../api/axios';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { hasScreenAccess } from '../../lib/screenPermissions';
import { dateToday, PayrollTable, requestError } from '../../components/Payroll/PayrollShared';
import WorkflowNav from '../../components/Payroll/WorkflowNav';
interface Period { _id: string; month: string; closed: boolean; reason: string; history: Array<{ action: string; at: string; reason: string }> }
export default function PeriodsPage() {
  const user = useSelector((s: RootState) => s.auth.user);
  const canClose = hasScreenAccess(user, 'finance_period_close'), canReopen = hasScreenAccess(user, 'finance_period_reopen');
  React.useEffect(() => setClosed(canClose), [canClose]);
  const [rows, setRows] = React.useState<Period[]>([]); const [month, setMonth] = React.useState(dateToday().slice(0, 7)); const [closed, setClosed] = React.useState(true); const [reason, setReason] = React.useState(''); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState('');
  const epoch = React.useRef(0);
  const load = React.useCallback(async () => { const n = ++epoch.current; try { const { data } = await api.get<Period[]>('/finance/periods'); if (n === epoch.current) setRows(data); } catch (e) { if (n === epoch.current) setError(requestError(e)); } }, []);
  React.useEffect(() => { void load(); const changed = () => { setRows([]); setReason(''); void load(); }; window.addEventListener('itemhive-workspace-changed', changed); return () => { epoch.current++; window.removeEventListener('itemhive-workspace-changed', changed); }; }, [load]);
  return <Stack gap={2}><WorkflowNav area="finance" /><Typography variant="h4" fontWeight={800}>Period Close</Typography><Alert severity="info">Reconcile cash, bank, expense payables, salary payables and employee loans first. Closing prevents any new posting dated in that month. Reopening requires a reason and preserves history.</Alert>{busy && <LinearProgress />}{error && <Alert severity="error">{error}</Alert>}<Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><TextField label="Month" type="month" value={month} onChange={e => setMonth(e.target.value)} /><TextField select label="Action" value={closed ? 'close' : 'reopen'} onChange={e => setClosed(e.target.value === 'close')}><MenuItem value="close" disabled={!canClose}>Close month</MenuItem><MenuItem value="reopen" disabled={!canReopen}>Reopen month</MenuItem></TextField><TextField label="Reason" value={reason} onChange={e => setReason(e.target.value)} /><Button variant="contained" disabled={busy || !reason.trim() || !month || (closed ? !canClose : !canReopen)} onClick={async () => { setBusy(true); setError(''); try { await api.post('/finance/periods', { month, closed, reason }); setReason(''); await load(); } catch (e) { setError(requestError(e)); } finally { setBusy(false); } }}>{closed ? 'Close month' : 'Reopen month'}</Button></Stack><PayrollTable rows={rows} columns={[{ label: 'Month', value: p => p.month }, { label: 'Status', value: p => p.closed ? 'Closed' : 'Open' }, { label: 'Reason', value: p => p.reason }, { label: 'History', value: p => p.history.map(h => `${h.action}: ${h.reason}`).join(' · ') }]} /></Stack>;
}
