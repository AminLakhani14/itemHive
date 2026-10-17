import React from 'react';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, LinearProgress, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { Plus, RefreshCw } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import api from '../../api/axios';
import { dateToday, exportRows, money, PayrollTable, requestError } from '../../components/Payroll/PayrollShared';
import { compactPayrollSx, PayrollSection, PayrollStats, StatusChip } from '../../components/Payroll/PayrollLayout';
import type { Expense, ExpenseList, ExpenseMeta, ExpensePayment } from '../../types/expense';

type Draft = { title: string; category: string; dateKey: string; payee: string; reference: string; notes: string; currency: string; amount: string; receipt: Expense['receipt']; key: string };
const newDraft = (currency = 'PKR'): Draft => ({ title: '', category: 'Supplies', dateKey: dateToday(), payee: '', reference: '', notes: '', currency, amount: '', receipt: null, key: crypto.randomUUID() });
export default function ExpensesPage() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [meta, setMeta] = React.useState<ExpenseMeta>();
  const [list, setList] = React.useState<ExpenseList>({ rows: [], total: 0, totals: [] });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [filters, setFilters] = React.useState({ from: dateToday().slice(0, 7) + '-01', to: dateToday(), search: '', status: '', category: '' });
  const [page, setPage] = React.useState(0);
  const [limit, setLimit] = React.useState(20);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Expense>();
  const [draft, setDraft] = React.useState<Draft>(() => newDraft());
  const [detail, setDetail] = React.useState<Expense>();
  const [action, setAction] = React.useState<{ expense: Expense; kind: string; payment?: ExpensePayment }>();
  const [actionData, setActionData] = React.useState({ reason: '', amount: '', method: 'cash', dateKey: dateToday(), reference: '', key: '' });
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current; setLoading(true);
    try {
      const [m, rows] = await Promise.all([api.get<ExpenseMeta>('/expenses/meta'), api.get<ExpenseList>('/expenses', { params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit } })]);
      if (current !== generation.current) return;
      setMeta(m.data); setList(rows.data); setError('');
    } catch (e) { if (current === generation.current) setError(requestError(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [filters, page, limit]);
  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => { window.clearTimeout(timer); generation.current++; }; }, [load]);
  React.useEffect(() => {
    const changed = () => { generation.current++; setMeta(undefined); setList({ rows: [], total: 0, totals: [] }); setDetail(undefined); setAction(undefined); setFormOpen(false); setPage(0); setFilters({ from: dateToday().slice(0, 7) + '-01', to: dateToday(), search: '', status: '', category: '' }); };
    window.addEventListener('itemhive-workspace-changed', changed); return () => window.removeEventListener('itemhive-workspace-changed', changed);
  }, []);
  const operate = async (fn: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await fn(); await load(); setNotice('Saved.'); } catch (e) { setError(requestError(e)); } finally { setBusy(false); } };
  const show = async (expense: Expense, edit = false) => {
    try {
      setError('');
      const epoch = generation.current;
      const e = (await api.get<Expense>('/expenses/' + expense._id)).data;
      if (epoch !== generation.current) return;
      if (edit) { setEditing(e); setDraft({ ...e, receipt: e.receipt || null, amount: String(e.amountMinor / 100), key: crypto.randomUUID() }); setFormOpen(true); }
      else setDetail(e);
    } catch (e) { setError(requestError(e)); }
  };
  const openAction = (expense: Expense, kind: string, payment?: ExpensePayment) => { setError(''); setAction({ expense, kind, payment }); setActionData({ reason: '', amount: String(expense.outstandingMinor / 100), method: 'cash', dateKey: dateToday(), reference: '', key: crypto.randomUUID() }); };
  const setFilter = (key: keyof typeof filters, value: string) => { setPage(0); setFilters({ ...filters, [key]: value }); };
  const receiptFile = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 1_000_000) { setError('Choose a JPG, PNG, WebP or PDF receipt up to 1 MB.'); return; }
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read receipt')); reader.readAsDataURL(file); });
    setDraft(d => ({ ...d, receipt: { fileName: file.name, data } }));
  };
  const downloadReceipt = (receipt: NonNullable<Expense['receipt']>) => {
    if (!receipt.data) return;
    const [header, base64] = receipt.data.split(',');
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: header.slice(5, header.indexOf(';')) }));
    const link = document.createElement('a'); link.href = url; link.download = receipt.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const field = (key: keyof Omit<Draft, 'receipt' | 'key'>, label: string, type = 'text', required = false) => <TextField size="small" fullWidth label={label} type={type} required={required} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} slotProps={{ inputLabel: { shrink: type === 'date' || undefined }, htmlInput: type === 'number' ? { min: 0.01, step: 0.01 } : {} }} />;
  const commit = () => operate(async () => {
    if (!action) return;
    const e = action.expense;
    if (action.kind === 'pay') await api.post('/expenses/' + e._id + '/payments', { ...actionData, reason: undefined, amount: Number(actionData.amount), version: e.version });
    else if (action.kind === 'reverse') await api.post('/expenses/' + e._id + '/payments/' + action.payment!._id + '/reverse', { version: e.version, reason: actionData.reason });
    else await api.post('/expenses/' + e._id + '/decision', { version: e.version, action: action.kind, reason: actionData.reason });
    if (detail?._id === e._id) setDetail((await api.get<Expense>('/expenses/' + e._id)).data);
    setAction(undefined);
  });
  return <Stack gap={2} sx={compactPayrollSx}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h4" fontWeight={800}>{meta?.viewAll ? 'Expenses' : 'My Expenses'}</Typography><Typography variant="caption" color="text.secondary">Finance · POS operating expenses</Typography></Box><Stack direction="row" gap={1}><IconButton aria-label="Refresh expenses" disabled={busy || loading} onClick={() => void load()}><RefreshCw size={18} /></IconButton><Button startIcon={<Plus size={16} />} variant="contained" disabled={!meta || busy} onClick={() => { setError(''); setEditing(undefined); setDraft(newDraft(meta?.currency)); setFormOpen(true); }}>New expense</Button></Stack></Stack>
    {loading && <LinearProgress />}{error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}{notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {list.totals.map(t => <PayrollStats key={t.currency} items={[{ label: t.currency + ' · Awaiting approval', value: money(t.pendingMinor, t.currency) }, { label: 'Approved expenses', value: money(t.approvedMinor, t.currency) }, { label: 'Paid', value: money(t.paidMinor, t.currency) }, { label: 'Outstanding', value: money(t.outstandingMinor, t.currency) }]} />)}
    <Card variant="outlined"><CardContent><Stack gap={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1}>
        <TextField size="small" label="Search" value={filters.search} onChange={e => setFilter('search', e.target.value)} sx={{ flex: 1 }} />
        <TextField size="small" type="date" label="From" value={filters.from} onChange={e => setFilter('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="To" value={filters.to} onChange={e => setFilter('to', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" select label="Status" value={filters.status} onChange={e => setFilter('status', e.target.value)}><MenuItem value="">All statuses</MenuItem>{['draft', 'submitted', 'approved', 'rejected', 'cancelled'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>
        <TextField size="small" select label="Category" value={filters.category} onChange={e => setFilter('category', e.target.value)}><MenuItem value="">All categories</MenuItem>{meta?.categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
        <Button disabled={!list.rows.length} onClick={() => exportRows(list.rows.map(e => ({ Date: e.dateKey, Title: e.title, Category: e.category, Payee: e.payee, Currency: e.currency, Amount: e.amountMinor / 100, Paid: e.paidMinor / 100, Outstanding: e.outstandingMinor / 100, Status: e.status, Payment: e.paymentStatus, SubmittedBy: e.createdByName })), 'expenses-page-' + (page + 1), true)}>Export page</Button>
      </Stack>
      <PayrollTable paginate={false} rows={list.rows} columns={[{ label: 'Date', value: e => e.dateKey }, { label: 'Expense', value: e => <Box><Typography variant="body2" fontWeight={700}>{e.title}</Typography><Typography variant="caption" color="text.secondary">{e.category} · {e.payee || '—'}</Typography></Box> }, { label: 'Submitted by', value: e => e.createdByName }, { label: 'Amount', value: e => money(e.amountMinor, e.currency) }, { label: 'Paid', value: e => money(e.paidMinor, e.currency) }, { label: 'Outstanding', value: e => money(e.outstandingMinor, e.currency) }, { label: 'Status', value: e => <Stack direction="row" gap={0.5}><StatusChip status={e.status} />{e.status === 'approved' && <StatusChip status={e.paymentStatus} />}</Stack> }]} actions={e => <>
        <Button disabled={busy} onClick={() => void show(e)}>View</Button>
        {e.createdBy === user?.id && ['draft', 'rejected'].includes(e.status) && <><Button disabled={busy} onClick={() => void show(e, true)}>Edit</Button><Button disabled={busy} onClick={() => openAction(e, 'submit')}>Submit</Button></>}
        {e.createdBy === user?.id && ['draft', 'submitted', 'rejected'].includes(e.status) && <Button disabled={busy} color="error" onClick={() => openAction(e, 'cancel')}>Cancel</Button>}
        {meta?.approve && e.createdBy !== user?.id && e.status === 'submitted' && <><Button disabled={busy} onClick={() => openAction(e, 'approve')}>Approve</Button><Button disabled={busy} color="error" onClick={() => openAction(e, 'reject')}>Reject</Button></>}
        {meta?.pay && e.status === 'approved' && e.outstandingMinor > 0 && <Button disabled={busy} onClick={() => openAction(e, 'pay')}>Pay</Button>}
      </>} />
      <TablePagination component="div" count={list.total} page={page} rowsPerPage={limit} rowsPerPageOptions={[20, 50, 100]} onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => { setLimit(Number(e.target.value)); setPage(0); }} />
    </Stack></CardContent></Card>
    <Dialog open={formOpen} onClose={() => !busy && setFormOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'Edit expense' : 'New expense'}</DialogTitle><Box component="form" onSubmit={e => { e.preventDefault(); void operate(async () => { const body = { ...draft, amount: Number(draft.amount), ...(editing ? { version: editing.version, key: undefined } : {}) }; if (editing) await api.put('/expenses/' + editing._id, body); else await api.post('/expenses', body); setFormOpen(false); }); }}><DialogContent><Grid container spacing={2}>
      <Grid size={12}>{field('title', 'Expense title', 'text', true)}</Grid><Grid size={6}><TextField fullWidth size="small" select label="Category" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{meta?.categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid><Grid size={6}>{field('dateKey', 'Expense date', 'date', true)}</Grid>
      <Grid size={6}>{field('amount', 'Amount', 'number', true)}</Grid><Grid size={6}><TextField fullWidth size="small" select label="Currency" value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}>{meta?.currencies.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid>
      <Grid size={6}>{field('payee', 'Payee / vendor')}</Grid><Grid size={6}>{field('reference', 'Invoice / receipt no.')}</Grid><Grid size={12}>{field('notes', 'Notes')}</Grid>
      <Grid size={12}><Stack direction="row" gap={1} alignItems="center"><Button component="label" variant="outlined">Attach receipt<input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => void receiptFile(e.target.files?.[0]).catch(err => setError(requestError(err)))} /></Button>{draft.receipt && <><Typography variant="caption">{draft.receipt.fileName}</Typography><Button onClick={() => setDraft({ ...draft, receipt: null })}>Remove</Button></>}</Stack></Grid>
    </Grid>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || Number(draft.amount) <= 0 || !draft.title.trim()}>Save draft</Button></DialogActions></Box></Dialog>
    <Dialog open={!!detail} onClose={() => setDetail(undefined)} fullWidth maxWidth="lg"><DialogTitle>{detail?.title}</DialogTitle><DialogContent>{detail && <Stack gap={2}>
      <PayrollStats items={[{ label: 'Amount', value: money(detail.amountMinor, detail.currency) }, { label: 'Paid', value: money(detail.paidMinor, detail.currency) }, { label: 'Outstanding', value: money(detail.outstandingMinor, detail.currency) }]} />
      <Typography variant="body2">{detail.dateKey} · {detail.category} · {detail.payee || '—'} · {detail.reference || '—'}</Typography>{detail.notes && <Typography variant="body2">{detail.notes}</Typography>}{detail.receipt && <Button sx={{ alignSelf: 'flex-start' }} onClick={() => downloadReceipt(detail.receipt!)}>Receipt · {detail.receipt.fileName}</Button>}
      <PayrollSection title="Payments"><PayrollTable rows={detail.payments} columns={[{ label: 'Date', value: p => p.dateKey }, { label: 'Amount', value: p => money(p.amountMinor, detail.currency) }, { label: 'Source', value: p => p.method.replaceAll('_', ' ') }, { label: 'Reference', value: p => p.reference }, { label: 'Recorded by', value: p => p.actorName }, { label: 'Status', value: p => <StatusChip status={p.reversedAt ? 'reversed' : 'paid'} /> }, { label: 'Reversal reason', value: p => p.reversalReason || '—' }]} actions={p => meta?.pay && !p.reversedAt && <Button color="error" disabled={busy} onClick={() => openAction(detail, 'reverse', p)}>Reverse</Button>} /></PayrollSection>
      <PayrollSection title="History"><PayrollTable rows={detail.history || []} columns={[{ label: 'Date', value: h => new Date(h.at).toLocaleString() }, { label: 'Action', value: h => h.action }, { label: 'User', value: h => h.actorName }, { label: 'Reason', value: h => h.reason || '—' }]} /></PayrollSection>
    </Stack>}</DialogContent><DialogActions><Button onClick={() => setDetail(undefined)}>Close</Button></DialogActions></Dialog>
    <Dialog open={!!action} onClose={() => !busy && setAction(undefined)} fullWidth maxWidth="sm"><DialogTitle sx={{ textTransform: 'capitalize' }}>{action?.kind} expense</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
      <Typography variant="body2" fontWeight={700}>{action?.expense.title}</Typography>
      {action?.kind === 'pay' && <><TextField size="small" type="number" label={'Amount · ' + action.expense.currency} value={actionData.amount} onChange={e => setActionData({ ...actionData, amount: e.target.value })} /><TextField size="small" select label="Payment source" value={actionData.method} onChange={e => setActionData({ ...actionData, method: e.target.value })}><MenuItem value="cash">Cash outside POS drawer</MenuItem><MenuItem value="bank">Bank</MenuItem><MenuItem value="pos_drawer" disabled={!meta?.shift?.currency || meta.shift.currency !== action.expense.currency}>POS drawer{meta?.shift ? ' · ' + meta.shift.shiftCode : ' · no open shift'}</MenuItem></TextField><TextField size="small" label="Payment date" type="date" value={actionData.dateKey} onChange={e => setActionData({ ...actionData, dateKey: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /><TextField size="small" label="Payment reference" required value={actionData.reference} onChange={e => setActionData({ ...actionData, reference: e.target.value })} /></>}
      {['approve', 'reject', 'reverse'].includes(action?.kind || '') && <TextField size="small" label="Reason" required value={actionData.reason} onChange={e => setActionData({ ...actionData, reason: e.target.value })} />}
      {action?.kind === 'reverse' && action.payment?.method === 'pos_drawer' && <Alert severity="info">Return the cash to the current open POS drawer. Closed shift reports remain unchanged.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setAction(undefined)}>Cancel</Button><Button variant="contained" disabled={busy || (action?.kind === 'pay' ? Number(actionData.amount) <= 0 || !actionData.reference.trim() : ['approve', 'reject', 'reverse'].includes(action?.kind || '') && !actionData.reason.trim())} onClick={() => void commit()}>Confirm</Button></DialogActions></Dialog>
  </Stack>;
}
