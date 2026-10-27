import React from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography, LinearProgress } from '@mui/material';
import api from '../../api/axios';
import { compactPayrollSx, StatusChip } from '../../components/Payroll/PayrollLayout';
import { money, PayrollTable, requestError } from '../../components/Payroll/PayrollShared';
import WorkflowNav from '../../components/Payroll/WorkflowNav';
import type { Journal } from '../../types/finance';
interface Source { _id: string; title: string; currency?: string; outstandingMinor: number }
interface OpeningData { expenses: Source[]; runs: Source[]; loans: Source[]; journals: Array<Journal & { controlTotals?: { expenses: number; runs: number; loans: number } }> }
const emptySelection = () => ({ expenseIds: [] as string[], runIds: [] as string[], loanIds: [] as string[] });
const groups = [['expenses', 'expenseIds', 'Old unpaid expenses'], ['runs', 'runIds', 'Old unpaid salaries'], ['loans', 'loanIds', 'Old employee loan balances']] as const;
export default function OpeningSourcesPage() {
  const [data, setData] = React.useState<OpeningData>();
  const [journalId, setJournal] = React.useState('');
  const [selected, setSelected] = React.useState(emptySelection);
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const epoch = React.useRef(0), context = React.useRef(0);
  const load = React.useCallback(async () => {
    const n = ++epoch.current; setLoading(true);
    try {
      const { data: latest } = await api.get<OpeningData>('/finance/opening-sources');
      if (n !== epoch.current) return;
      setData(latest); setError('');
      setJournal(id => latest.journals.some(j => j._id === id) ? id : '');
      setSelected(previous => Object.fromEntries(groups.map(([key, ids]) => [ids, previous[ids].filter(id => latest[key].some(row => row._id === id))])) as ReturnType<typeof emptySelection>);
    } catch (e) { if (n === epoch.current) setError(requestError(e)); }
    finally { if (n === epoch.current) setLoading(false); }
  }, []);
  React.useEffect(() => {
    void load();
    const changed = () => { context.current++; setBusy(false); setReason(''); setNotice(''); setError(''); setData(undefined); setJournal(''); setSelected(emptySelection()); setConfirm(false); void load(); };
    window.addEventListener('itemhive-workspace-changed', changed);
    return () => { context.current++; epoch.current++; window.removeEventListener('itemhive-workspace-changed', changed); };
  }, [load]);
  const journal = data?.journals.find(j => j._id === journalId);
  const totals = groups.map(([key, ids, title]) => ({ key, ids, title, expected: journal?.controlTotals?.[key], selected: (data?.[key] || []).filter(s => selected[ids].includes(s._id)).reduce((n, s) => n + s.outstandingMinor, 0) }));
  const relevantTotals = totals.filter(t => t.expected !== 0 || t.selected !== 0 || (data?.[t.key] || []).some(s => !s.currency || s.currency === journal?.currency));
  const count = Object.values(selected).reduce((n, ids) => n + ids.length, 0);
  const matches = totals.every(t => t.expected === undefined || t.expected === t.selected);
  const save = async () => {
    if (!journal || !matches || !count || !reason.trim() || busy || loading) return;
    const current = context.current; setBusy(true); setError('');
    try {
      await api.post('/finance/opening-sources', { journalId, ...selected, reason });
      if (current !== context.current) return;
      setConfirm(false); setJournal(''); setSelected(emptySelection()); setReason('');
      setNotice('Balances linked. New payments will update the accounts.'); await load();
    } catch (e) { if (current === context.current) setError(requestError(e)); }
    finally { if (current === context.current) setBusy(false); }
  };
  return <Stack gap={2} sx={compactPayrollSx}>
    <WorkflowNav area="finance" /><Typography variant="h4" fontWeight={800}>Opening Balance Allocation</Typography>
    <Typography color="text.secondary">Choose a posted opening journal, select the old balances it covers, then review the matching totals before linking.</Typography>
    {loading && <LinearProgress />}{error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
      <TextField select size="small" sx={{ flex: 1 }} disabled={loading || busy} label="Posted opening journal" value={journalId} onChange={e => { setJournal(e.target.value); setSelected(emptySelection()); setNotice(''); }}>
        <MenuItem value="">Choose journal</MenuItem>{data?.journals.map(j => <MenuItem key={j._id} value={j._id}>{j.description} - {j.currency} - {j.dateKey}</MenuItem>)}
      </TextField>
      <Button disabled={loading || busy} onClick={() => void load()}>Refresh balances</Button>
    </Stack>
    {!loading && !error && !data?.journals.length && <Alert severity="info">No opening journal is ready. Create one in Journals & Opening Balances and ask another admin to post it.</Alert>}
    {journal && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(auto-fit, minmax(240px, 1fr))' }, gap: 1 }}>
        {relevantTotals.map(t => <Box key={t.key} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1 }}><Typography variant="body2" fontWeight={700}>{t.title}</Typography>{t.expected !== undefined && <StatusChip status={t.expected === t.selected ? 'matched' : 'needs_selection'} />}</Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
            {[['Journal', t.expected], ['Selected', t.selected], ['Difference', t.expected === undefined ? undefined : t.expected - t.selected]].map(([label, value]) => <Box key={String(label)}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{typeof value === 'number' ? money(value, journal.currency) : '-'}</Typography></Box>)}
          </Box>
        </Box>)}
      </Box>
      {relevantTotals.map(t => <Stack gap={1} key={t.key}>
        <Typography fontWeight={700}>{t.title} ({selected[t.ids].length} selected)</Typography>
        <PayrollTable rows={(data?.[t.key] || []).filter(s => !s.currency || s.currency === journal.currency)} emptyMessage="No unlinked balances in this currency." columns={[
          { label: 'Select', value: s => <Checkbox inputProps={{ 'aria-label': 'Select ' + s.title }} disabled={busy || loading || (!selected[t.ids].includes(s._id) && selected[t.ids].length >= 500)} checked={selected[t.ids].includes(s._id)} onChange={(_, checked) => setSelected(previous => ({ ...previous, [t.ids]: checked ? [...previous[t.ids], s._id] : previous[t.ids].filter(id => id !== s._id) }))} /> },
          { label: 'Source', value: s => s.title }, { label: 'Outstanding', value: s => money(s.outstandingMinor, s.currency || journal.currency) },
        ]} />
      </Stack>)}
      {!matches && <Alert severity="info">Match each selected total to its journal amount. Negative differences mean too much is selected. Refresh balances if another user has made changes.</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
        <TextField size="small" sx={{ flex: 1 }} label="Reason / reference" value={reason} disabled={busy} onChange={e => setReason(e.target.value)} />
        <Button variant="contained" disabled={busy || loading || !matches || !count || !reason.trim()} onClick={() => setConfirm(true)}>Review {count || ''} balance{count === 1 ? '' : 's'}</Button>
      </Stack>
    </>}
    <Dialog open={confirm && !!journal} onClose={() => !busy && setConfirm(false)} fullWidth maxWidth="sm">
      <DialogTitle>Link {count} old balance{count === 1 ? '' : 's'}?</DialogTitle>
      <DialogContent><Stack gap={2}><Typography>{journal?.description} - {journal?.currency}</Typography>{totals.map(t => <Typography key={t.key}>{t.title}: {money(t.selected, journal?.currency)}</Typography>)}<Alert severity="warning">Linking is permanent. This opening journal cannot be reversed after allocation. These balances must already be included in its posted amounts.</Alert>{error && <Alert severity="error">{error}</Alert>}</Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setConfirm(false)}>Go back</Button><Button variant="contained" disabled={busy || loading || !matches || !count} onClick={() => void save()}>Link balances</Button></DialogActions>
    </Dialog>
  </Stack>;
}
