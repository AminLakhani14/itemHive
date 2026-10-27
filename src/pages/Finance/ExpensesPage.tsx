import WorkflowHistory from '../../components/Payroll/WorkflowHistory';
import { useLocation, useSearchParams } from 'react-router-dom';
import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, LinearProgress, MenuItem, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { ChevronDown, Plus, RefreshCw } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import api from '../../api/axios';
import { dateToday, exportRows, money, PayrollTable, requestError } from '../../components/Payroll/PayrollShared';
import { compactPayrollSx, workflowFiltersSx, PayrollSection, PayrollStats, StatusChip } from '../../components/Payroll/PayrollLayout';
import WorkflowNav from '../../components/Payroll/WorkflowNav';
import type { Expense, ExpenseList, ExpenseMeta, ExpensePayment } from '../../types/expense';

type Draft = { accountId: string; title: string; category: string; dateKey: string; payee: string; reference: string; notes: string; currency: string; amount: string; receipt: Expense['receipt']; key: string };
const newDraft = (currency = 'PKR'): Draft => ({ accountId: '', title: '', category: 'Supplies', dateKey: dateToday(), payee: '', reference: '', notes: '', currency, amount: '', receipt: null, key: crypto.randomUUID() });
const actionLabels: Record<string, string> = { submit: 'Submit for approval', approve: 'Approve expense', reject: 'Reject expense', return: 'Return for changes', pay: 'Record payment', cancel: 'Cancel expense', void: 'Void expense', reverse: 'Reverse payment' };
export default function ExpensesPage({ view = 'register' }: { view?: 'register' | 'mine' | 'approvals' | 'payments' }) {
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const linkedExpense = query.get('expenseId');
  const openedNotice = React.useRef('');
  const user = useSelector((s: RootState) => s.auth.user);
  const [meta, setMeta] = React.useState<ExpenseMeta>();
  const [list, setList] = React.useState<ExpenseList>({ rows: [], total: 0, totals: [] });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [filters, setFilters] = React.useState({ from: '', to: '', search: '', status: '', category: '', paymentStatus: view === 'payments' ? 'outstanding' : '' });
  const [moreFilters, setMoreFilters] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [limit, setLimit] = React.useState(20);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Expense>();
  const [draft, setDraft] = React.useState<Draft>(() => newDraft());
  const [detail, setDetail] = React.useState<Expense>();
  const [action, setAction] = React.useState<{ expense: Expense; kind: string; payment?: ExpensePayment }>();
  const [actionData, setActionData] = React.useState({ reason: '', amount: '', method: 'cash', dateKey: dateToday(), reference: '', key: '' });
  const generation = React.useRef(0);
  const context = React.useRef(0);
  const detailRequest = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current; setLoading(true);
    if (filters.from && filters.to && filters.from > filters.to) { setError('From date must be on or before To date.'); setList({ rows: [], total: 0, totals: [] }); setLoading(false); return; }
    try {
      const [m, rows] = await Promise.all([api.get<ExpenseMeta>('/expenses/meta'), api.get<ExpenseList>('/expenses', { params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, limit, view } })]);
      if (current !== generation.current) return;
      setMeta(m.data); setList(rows.data); setError('');
      if (page > 0 && rows.data.total <= page * limit) setPage(Math.max(0, Math.ceil(rows.data.total / limit) - 1));
    } catch (e) { if (current === generation.current) setError(requestError(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [filters, page, limit, view]);
  React.useEffect(() => { context.current++; generation.current++; setDetail(undefined); setAction(undefined); setFormOpen(false); setEditing(undefined); setNotice(''); setPage(0); setFilters({ from: '', to: '', search: '', status: '', category: '', paymentStatus: view === 'payments' ? 'outstanding' : '' }); return () => { context.current++; }; }, [view]);
  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => { window.clearTimeout(timer); generation.current++; }; }, [load]);
  React.useEffect(() => {
    const changed = () => { setQuery({}, { replace: true }); context.current++; generation.current++; setBusy(false); setError(''); setNotice(''); setEditing(undefined); setDraft(newDraft()); setMeta(undefined); setList({ rows: [], total: 0, totals: [] }); setDetail(undefined); setAction(undefined); setFormOpen(false); setPage(0); setFilters({ from: '', to: '', search: '', status: '', category: '', paymentStatus: view === 'payments' ? 'outstanding' : '' }); };
    window.addEventListener('itemhive-workspace-changed', changed); return () => window.removeEventListener('itemhive-workspace-changed', changed);
  }, [view]);
  const operate = async (fn: (isCurrent: () => boolean) => Promise<string | void>) => {
    const epoch = context.current;
    const isCurrent = () => epoch === context.current;
    setBusy(true); setError(''); setNotice('');
    try { const message = await fn(isCurrent); if (!isCurrent()) return; await load(); if (isCurrent()) setNotice(message || 'Saved.'); }
    catch (e) { if (isCurrent()) setError(requestError(e)); }
    finally { if (isCurrent()) setBusy(false); }
  };
  const validDraft = !!draft.title.trim() && !!draft.dateKey && Number(draft.amount) > 0 && Number(draft.amount) <= 1_000_000_000 && /^\d+(\.\d{1,2})?$/.test(draft.amount) && (!meta?.financePolicy || !!draft.accountId);
  const saveDraft = (submitNow: boolean) => operate(async isCurrent => {
    const body = { ...draft, amount: Number(draft.amount), ...(editing ? { version: editing.version, key: undefined } : {}) };
    const response = editing ? await api.put<Expense>('/expenses/' + editing._id, body) : await api.post<Expense>('/expenses', body);
    if (!isCurrent()) return;
    // Retain the saved ID/version if submission fails so retry edits the same draft.
    setEditing(response.data);
    if (submitNow) await api.post('/expenses/' + response.data._id + '/decision', { version: response.data.version, action: 'submit' });
    if (!isCurrent()) return;
    setFormOpen(false);
    return submitNow ? 'Expense submitted. Another authorized person can now review it in Expense Approvals.' : 'Draft saved. Submit it when the details and receipt are ready.';
  });
  const show = async (expense: Expense, edit = false) => {
    if (edit) setDetail(undefined);
    const epoch = context.current, request = ++detailRequest.current;
    try {
      setError('');
      const e = (await api.get<Expense>('/expenses/' + expense._id)).data;
      if (epoch !== context.current || request !== detailRequest.current) return;
      if (edit) { setEditing(e); setDraft({ accountId: meta?.accounts?.some(a => a._id === e.accountId) ? e.accountId || '' : '', title: e.title, category: e.category, dateKey: e.dateKey, payee: e.payee, reference: e.reference, notes: e.notes, currency: e.currency, receipt: e.receipt || null, amount: String(e.amountMinor / 100), key: crypto.randomUUID() }); setFormOpen(true); }
      else setDetail(e);
    } catch (e) { if (epoch === context.current && request === detailRequest.current) setError(requestError(e)); }
  };
  React.useEffect(() => {
    const key = location.key + ':' + linkedExpense;
    if (!linkedExpense || !meta || openedNotice.current === key) return;
    openedNotice.current = key;
    void show({ _id: linkedExpense } as Expense);
  }, [linkedExpense, location.key, meta?.currency]);
  const openAction = async (row: Expense, kind: string, payment?: ExpensePayment) => {
    const epoch = context.current, request = ++detailRequest.current;
    setError('');
    try {
      // List responses intentionally omit receipt bytes; review needs the full record.
      const expense = (await api.get<Expense>('/expenses/' + row._id)).data;
      if (epoch !== context.current || request !== detailRequest.current) return;
      setAction({ expense, kind, payment: payment ? expense.payments.find(p => p._id === payment._id) : undefined }); setActionData({ reason: '', amount: String(expense.outstandingMinor / 100), method: 'cash', dateKey: [dateToday(), expense.dateKey, ...(kind === 'approve' && meta?.financePolicy ? [meta.financePolicy.cutoverDate] : []), ...(kind === 'pay' && expense.postingDateKey ? [expense.postingDateKey] : [])].sort().at(-1) || dateToday(), reference: '', key: crypto.randomUUID() });
    } catch (e) { if (epoch === context.current && request === detailRequest.current) setError(requestError(e)); }
  };
  const setFilter = (key: keyof typeof filters, value: string) => { generation.current++; setLoading(true); setPage(0); setFilters({ ...filters, [key]: value }); };
  const receiptFile = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 1_000_000) { setError('Choose a JPG, PNG, WebP or PDF receipt up to 1 MB.'); return; }
    const epoch = context.current, draftKey = draft.key;
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read receipt')); reader.readAsDataURL(file); });
    if (epoch === context.current) setDraft(d => d.key === draftKey ? ({ ...d, receipt: { fileName: file.name, data } }) : d);
  };
  const downloadReceipt = (receipt: NonNullable<Expense['receipt']>) => {
    if (!receipt.data) return;
    const [header, base64] = receipt.data.split(',');
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: header.slice(5, header.indexOf(';')) }));
    const link = document.createElement('a'); link.href = url; link.download = receipt.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const field = (key: keyof Omit<Draft, 'receipt' | 'key'>, label: string, type = 'text', required = false) => <TextField size="small" fullWidth label={label} type={type} required={required} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} slotProps={{ inputLabel: { shrink: type === 'date' || undefined }, htmlInput: type === 'number' ? { min: 0.01, step: 0.01 } : {} }} />;
  const commit = () => operate(async isCurrent => {
    if (!action) return;
    const e = action.expense;
    if (action.kind === 'pay') await api.post('/expenses/' + e._id + '/payments', { ...actionData, reason: undefined, amount: Number(actionData.amount), version: e.version });
    else if (action.kind === 'reverse') await api.post('/expenses/' + e._id + '/payments/' + action.payment!._id + '/reverse', { version: e.version, reason: actionData.reason, dateKey: actionData.dateKey });
    else await api.post('/expenses/' + e._id + '/decision', { version: e.version, action: action.kind, reason: actionData.reason, ...(['approve', 'void'].includes(action.kind) ? { dateKey: actionData.dateKey } : {}) });
    if (!isCurrent()) return;
    if (detail?._id === e._id) {
      const refreshed = (await api.get<Expense>('/expenses/' + e._id)).data;
      if (!isCurrent()) return;
      setDetail(refreshed);
    }
    setAction(undefined);
  });
  const expenseActions = (e: Expense) => <>
        {view === 'mine' && meta?.create && e.createdBy === user?.id && ['draft', 'rejected'].includes(e.status) && <><Button disabled={busy} onClick={() => void show(e, true)}>Edit</Button><Button disabled={busy} onClick={() => openAction(e, 'submit')}>Submit</Button></>}
        {view === 'mine' && meta?.create && e.createdBy === user?.id && ['draft', 'submitted', 'rejected'].includes(e.status) && <Button disabled={busy} color="error" onClick={() => openAction(e, 'cancel')}>Cancel</Button>}
        {view === 'approvals' && meta?.approve && e.createdBy !== user?.id && e.status === 'submitted' && <><Button variant="contained" disabled={busy} onClick={() => openAction(e, 'approve')}>Approve</Button><Button disabled={busy} color="error" onClick={() => openAction(e, 'reject')}>Reject</Button><Button disabled={busy} onClick={() => openAction(e, 'return')}>Return for correction</Button></>}
        {view === 'payments' && meta?.pay && e.status === 'approved' && e.outstandingMinor > 0 && <Button variant="contained" disabled={busy} onClick={() => openAction(e, 'pay')}>Record payment</Button>}
      </>;
  return <Stack gap={2} sx={compactPayrollSx}>
    <WorkflowNav area="expenses" />
    <Stack direction={{ xs: "column", sm: "row" }} gap={1} justifyContent="space-between" alignItems={{ sm: "center" }}><Box><Typography variant="h4" fontWeight={800}>{view === 'approvals' ? 'Expense Approvals' : view === 'payments' ? 'Expense Payments' : view === 'mine' ? 'My Expenses' : 'Expense Register'}</Typography><Typography variant="caption" color="text.secondary">{view === 'mine' ? 'Add an expense and receipt. Save it or send it for approval.' : view === 'approvals' ? 'Check the receipt and account. Approve it or return it for changes. You cannot approve your own expense.' : view === 'payments' ? 'Record payments already made. Recording a payment does not transfer money.' : 'Track submitted expenses, approvals, payments and receipts. Drafts stay in My Expenses.'}</Typography></Box><Stack direction="row" gap={1}><IconButton aria-label="Refresh expenses" disabled={busy || loading} onClick={() => void load()}><RefreshCw size={18} /></IconButton>{view === 'mine' && meta?.create && <Button startIcon={<Plus size={16} />} variant="contained" disabled={!meta || busy || loading} onClick={() => { setError(''); setEditing(undefined); setDraft({ ...newDraft(meta?.currency), accountId: meta?.accounts?.find(a => a.systemKey === 'operating_expense')?._id || '' }); setFormOpen(true); }}>New expense</Button>}</Stack></Stack>
    {meta && !meta.financePolicy && <Alert severity="info">Finance setup is incomplete. Expenses are saved here but do not update accounts. Ask your admin to set up Chart of Accounts.</Alert>}
    {loading && <LinearProgress />}{error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}{notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {!loading && list.totals.map(t => <PayrollStats key={t.currency} items={[...(view !== 'payments' ? [{ label: t.currency + ' · Awaiting approval', value: money(t.pendingMinor, t.currency) }] : []), ...(view !== 'approvals' ? [{ label: t.currency + ' · Approved expenses', value: money(t.approvedMinor, t.currency) }, { label: 'Paid', value: money(t.paidMinor, t.currency) }, { label: 'Outstanding', value: money(t.outstandingMinor, t.currency) }] : [])]} />)}
    <Card variant="outlined"><CardContent><Stack gap={2}>
      <Typography variant="caption" color="text.secondary">{filters.from || filters.to ? 'Date filters apply to this list. Clear them to see older documents.' : 'Showing all expense dates, including older pending approvals and unpaid expenses.'}</Typography>
      <Stack sx={workflowFiltersSx}>
        {view === 'payments' && <TextField size="small" select label="Payment status" value={filters.paymentStatus} onChange={e => setFilter('paymentStatus', e.target.value)}>{[['outstanding', 'Outstanding only'], ['', 'All approved expenses'], ['unpaid', 'Unpaid'], ['partially_paid', 'Partially paid'], ['paid', 'Paid (refund / reversal)']].map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>}
        <TextField size="small" label="Search expenses" value={filters.search} onChange={e => setFilter('search', e.target.value)} sx={{ flex: 1 }} />
        {['register', 'mine'].includes(view) && <TextField size="small" select label="Status" value={filters.status} onChange={e => setFilter('status', e.target.value)}><MenuItem value="">All statuses</MenuItem>{(view === 'mine' ? ['draft', 'submitted', 'approved', 'rejected', 'cancelled'] : ['submitted', 'approved', 'rejected', 'cancelled']).map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField>}

        <Button onClick={() => { generation.current++; setLoading(true); setPage(0); setFilters({ from: '', to: '', search: '', status: '', category: '', paymentStatus: view === 'payments' ? 'outstanding' : '' }); }}>Reset filters</Button>
        <Button disabled={loading || !!error || !list.rows.length} onClick={() => exportRows(list.rows.map(e => ({ Date: e.dateKey, Title: e.title, Category: e.category, Payee: e.payee, Currency: e.currency, Amount: e.amountMinor / 100, Paid: e.paidMinor / 100, Outstanding: e.outstandingMinor / 100, Status: e.status, Payment: e.paymentStatus, SubmittedBy: e.createdByName })), 'expenses-page-' + (page + 1), true)}>Export page</Button>
      </Stack>
      <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setMoreFilters(v => !v)} aria-expanded={moreFilters} aria-controls="expense-extra-filters">{moreFilters ? 'Hide' : 'More'} filters{[filters.from, filters.to, filters.category].filter(Boolean).length ? ' (' + [filters.from, filters.to, filters.category].filter(Boolean).length + ')' : ''}</Button>
      <Collapse in={moreFilters} id="expense-extra-filters"><Stack sx={workflowFiltersSx}>
        <TextField size="small" type="date" label="From" value={filters.from} onChange={e => setFilter('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="To" value={filters.to} onChange={e => setFilter('to', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" select label="Category" value={filters.category} onChange={e => setFilter('category', e.target.value)}><MenuItem value="">All categories</MenuItem>{meta?.categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField>
      </Stack></Collapse>
      <PayrollTable paginate={false} emptyMessage={loading ? 'Loading expenses...' : view === 'mine' ? 'No expenses match. Use New expense to add one, or clear the filters.' : view === 'approvals' ? 'No expenses waiting for your approval match these filters.' : view === 'payments' && filters.paymentStatus === 'outstanding' ? 'No unpaid expenses match. Choose All approved expenses to see paid history.' : 'No expenses match these filters.'} rows={loading ? [] : list.rows} columns={[{ label: 'Date', value: e => e.dateKey }, { label: 'Expense', value: e => <Box><Typography variant="body2" fontWeight={700}>{e.title}</Typography><Typography variant="caption" color="text.secondary">{e.category} · {e.payee || '—'}</Typography></Box> }, { label: 'Submitted by', value: e => e.createdByName }, { label: 'Amount', value: e => money(e.amountMinor, e.currency) }, ...(view === 'approvals' ? [] : [{ label: 'Paid', value: (e: Expense) => money(e.paidMinor, e.currency) }, { label: 'Outstanding', value: (e: Expense) => money(e.outstandingMinor, e.currency) }]), { label: 'Status', value: e => <Stack direction="row" gap={0.5}><StatusChip status={e.status} />{e.status === 'approved' && <StatusChip status={e.paymentStatus} />}</Stack> }]} actions={e => <>
        <Button disabled={busy || loading} onClick={() => void show(e)}>View</Button>
        {expenseActions(e)}
      </>} />
      <TablePagination sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', justifyContent: 'flex-end', px: 1 } }} component="div" count={list.total} page={page} rowsPerPage={limit} rowsPerPageOptions={[20, 50, 100]} onPageChange={(_, p) => { generation.current++; setLoading(true); setPage(p); }} onRowsPerPageChange={e => { generation.current++; setLoading(true); setLimit(Number(e.target.value)); setPage(0); }} />
    </Stack></CardContent></Card>
    <Dialog open={formOpen} onClose={() => !busy && setFormOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{editing ? 'Edit expense' : 'New expense'}</DialogTitle><Box component="form" onSubmit={e => { e.preventDefault(); if (validDraft && !busy) void saveDraft(true); }}><DialogContent dividers><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Add the amount and details, then submit. Another admin will review it. Use Save draft to finish later.</Typography><Grid container spacing={2}>
      <Grid size={12}>{field('title', 'Expense title', 'text', true)}</Grid>
      <Grid size={{ xs: 12, sm: 6 }}>{field('amount', 'Amount', 'number', true)}</Grid><Grid size={{ xs: 12, sm: 6 }}>{field('dateKey', 'Expense date', 'date', true)}</Grid>
      <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" select label="Category" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}>{meta?.categories.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" select label="Currency" value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}>{meta?.currencies.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}</TextField></Grid>
      {meta?.financePolicy && <Grid size={12}><TextField fullWidth size="small" select required label="Expense account" value={draft.accountId} onChange={e => setDraft({ ...draft, accountId: e.target.value })}><MenuItem value="">Choose account</MenuItem>{meta.accounts?.map(a => <MenuItem key={a._id} value={a._id}>{a.code} · {a.name}</MenuItem>)}</TextField></Grid>}
      <Grid size={12}><Accordion disableGutters variant="outlined"><AccordionSummary expandIcon={<ChevronDown size={18}/>}><Typography variant="body2">Vendor, invoice & notes (optional)</Typography></AccordionSummary><AccordionDetails><Grid container spacing={2}>      <Grid size={{ xs: 12, sm: 6 }}>{field('payee', 'Payee / vendor')}</Grid><Grid size={{ xs: 12, sm: 6 }}>{field('reference', 'Invoice / receipt no.')}</Grid><Grid size={12}>{field('notes', 'Notes')}</Grid></Grid></AccordionDetails></Accordion></Grid>
      <Grid size={12}><Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Button component="label" variant="outlined">Attach receipt<input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => void receiptFile(e.target.files?.[0]).catch(err => setError(requestError(err)))} /></Button>{draft.receipt && <><Typography variant="caption">{draft.receipt.fileName}</Typography><Button onClick={() => setDraft({ ...draft, receipt: null })}>Remove</Button></>}</Stack></Grid>
    </Grid>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions sx={{ flexWrap: 'wrap', gap: 1, '& .MuiButton-root': { ml: '0 !important' }, '& .MuiButton-contained': { width: { xs: '100%', sm: 'auto' }, order: { xs: -1, sm: 0 } } }}><Button disabled={busy} onClick={() => setFormOpen(false)}>Cancel</Button><Button type="button" disabled={busy || !validDraft} onClick={() => void saveDraft(false)}>Save draft</Button><Button type="submit" value="submit" variant="contained" disabled={busy || !validDraft}>Submit for approval</Button></DialogActions></Box></Dialog>
    <Dialog open={!!detail} onClose={() => setDetail(undefined)} fullWidth maxWidth="lg"><DialogTitle>{detail?.title}</DialogTitle><DialogContent>{detail && <Stack gap={2}>
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center"><StatusChip status={detail.status}/>{expenseActions(detail)}</Stack>
      <PayrollStats items={[{ label: 'Amount', value: money(detail.amountMinor, detail.currency) }, { label: 'Paid', value: money(detail.paidMinor, detail.currency) }, { label: 'Outstanding', value: money(detail.outstandingMinor, detail.currency) }]} />
      {detail.postingDateKey && <Typography variant="body2">Accounting posting date: {detail.postingDateKey}</Typography>}
      <Typography variant="body2">{detail.dateKey} · {detail.category} · {detail.payee || '—'} · {detail.reference || '—'}</Typography>{detail.notes && <Typography variant="body2">{detail.notes}</Typography>}{detail.receipt && <Button sx={{ alignSelf: 'flex-start' }} onClick={() => downloadReceipt(detail.receipt!)}>Receipt · {detail.receipt.fileName}</Button>}
      <Alert severity={detail.journalEntryId ? 'success' : 'info'}>{detail.status !== 'approved' ? detail.status === 'cancelled' ? 'This expense was cancelled.' : 'This expense must be approved before payment.' : detail.accountingOrigin === 'opening' ? 'This old expense is linked to opening balances. Payments reduce the amount owed.' : detail.journalEntryId ? 'This expense is in the accounts. Payments reduce the unpaid amount.' : 'This expense is not in the accounts. If Finance is set up, link it to opening balances before paying.'}</Alert>
      {meta?.void && detail.createdBy !== user?.id && detail.status === 'approved' && detail.accountingOrigin !== 'opening' && !detail.paidMinor && <Button color="error" disabled={busy} onClick={() => openAction(detail, 'void')}>Void approved expense</Button>}
      <PayrollSection title="Payments">{detail.payments.length ? <PayrollTable rows={detail.payments} columns={[{ label: 'Date', value: p => p.dateKey }, { label: 'Amount', value: p => money(p.amountMinor, detail.currency) }, { label: 'Source', value: p => p.method.replaceAll('_', ' ') }, { label: 'Reference', value: p => p.reference }, { label: 'Recorded by', value: p => p.actorName }, { label: 'Status', value: p => <StatusChip status={p.reversedAt ? 'reversed' : 'paid'} /> }, { label: 'Reversal reason', value: p => p.reversalReason || '—' }]} actions={p => meta?.reverse && !p.reversedAt && <Button color="error" disabled={busy} onClick={() => openAction(detail, 'reverse', p)}>Reverse</Button>} /> : <Typography variant="body2" color="text.secondary">No payments recorded.</Typography>}</PayrollSection>
      <PayrollSection title="History"><WorkflowHistory rows={[...(detail.history || [])].reverse()} /></PayrollSection>
    </Stack>}</DialogContent><DialogActions><Button onClick={() => setDetail(undefined)}>Close</Button></DialogActions></Dialog>
    <Dialog open={!!action} onClose={() => !busy && setAction(undefined)} fullWidth maxWidth="sm"><DialogTitle sx={{ textTransform: 'capitalize' }}>{actionLabels[action?.kind || ''] || 'Review expense'}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
      <Typography variant="body2" fontWeight={700}>{action?.expense.title}</Typography>{action && <Typography variant="body2">{money(action.expense.amountMinor, action.expense.currency)} | {action.expense.createdByName} | {action.expense.dateKey}</Typography>}{action?.expense.receipt && <Button onClick={() => downloadReceipt(action.expense.receipt!)}>Download receipt</Button>}
      {action?.kind === 'pay' && <><TextField size="small" type="number" helperText={"Outstanding: " + money(action.expense.outstandingMinor, action.expense.currency)} slotProps={{ htmlInput: { min: 0.01, max: action.expense.outstandingMinor / 100, step: 0.01 } }} label={'Amount · ' + action.expense.currency} value={actionData.amount} onChange={e => setActionData({ ...actionData, amount: e.target.value })} /><TextField size="small" select label="Payment source" value={actionData.method} onChange={e => setActionData({ ...actionData, method: e.target.value })}><MenuItem value="cash">Cash (not POS drawer)</MenuItem><MenuItem value="bank">Bank</MenuItem><MenuItem value="pos_drawer" disabled={!meta?.shift?.currency || meta.shift.currency !== action.expense.currency}>POS drawer{meta?.shift ? ' · ' + meta.shift.shiftCode : ' · no open shift'}</MenuItem></TextField><TextField size="small" label="Payment date" type="date" value={actionData.dateKey} onChange={e => setActionData({ ...actionData, dateKey: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /><TextField size="small" label="Payment reference" required value={actionData.reference} onChange={e => setActionData({ ...actionData, reference: e.target.value })} /></>}
      {['reject', 'return', 'void', 'reverse'].includes(action?.kind || '') && <TextField size="small" label="Reason" required value={actionData.reason} onChange={e => setActionData({ ...actionData, reason: e.target.value })} />}
      {['approve', 'reverse', 'void'].includes(action?.kind || '') && <TextField size="small" label={action?.kind === 'approve' ? 'Accounting posting date' : 'Reversal / void date'} type="date" value={actionData.dateKey} onChange={e => setActionData({ ...actionData, dateKey: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />}
      {action?.kind === 'approve' && <Alert severity="info">Keep the invoice date. Choose an accounting date in an open month, on or after the finance start date. Do not add costs already in opening balances.</Alert>}
      {action?.kind === 'reverse' && action.payment?.method === 'pos_drawer' && <Alert severity="info">Return the cash to the current open POS drawer. Closed shift reports remain unchanged.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={() => setAction(undefined)}>Cancel</Button><Button variant="contained" disabled={busy || (action?.kind === 'pay' ? !Number.isFinite(Number(actionData.amount)) || Number(actionData.amount) <= 0 || Number(actionData.amount) > action.expense.outstandingMinor / 100 || !/^\d+(\.\d{1,2})?$/.test(actionData.amount) || !actionData.dateKey || !actionData.reference.trim() : ['reject', 'return', 'void', 'reverse'].includes(action?.kind || '') && !actionData.reason.trim()) || (['approve', 'void', 'reverse'].includes(action?.kind || '') && !actionData.dateKey)} onClick={() => void commit()}>{actionLabels[action?.kind || ''] || 'Confirm'}</Button></DialogActions></Dialog>
  </Stack>;
}
