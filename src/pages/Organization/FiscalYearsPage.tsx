import React from 'react';
import axios from 'axios';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Switch, TextField, Typography } from '@mui/material';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import OrganizationPageLayout from './OrganizationPageLayout';
import type { FiscalYear } from './organizationTypes';

const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || 'Unable to complete this request.' : 'Unable to complete this request.';
const emptyDraft = { name: '', startDate: '', endDate: '', isCurrent: false };

export default function FiscalYearsPage() {
    const [years, setYears] = React.useState<FiscalYear[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<FiscalYear | null>(null);
    const [draft, setDraft] = React.useState(emptyDraft);
    const load = React.useCallback(async () => {
        setLoading(true); setError('');
        try { setYears((await api.get<FiscalYear[]>('/organization/fiscal-years')).data); }
        catch (requestError) { setError(getError(requestError)); }
        finally { setLoading(false); }
    }, []);
    React.useEffect(() => { void load(); }, [load]);
    const openCreate = () => { setEditing(null); setDraft(emptyDraft); setDialogOpen(true); };
    const openEdit = (item: FiscalYear) => { setEditing(item); setDraft({ name: item.name, startDate: item.startDate, endDate: item.endDate, isCurrent: item.isCurrent }); setDialogOpen(true); };
    const save = async (event: React.FormEvent) => {
        event.preventDefault(); setSaving(true); setError('');
        try {
            if (editing) await api.patch(`/organization/fiscal-years/${editing._id}`, draft);
            else await api.post('/organization/fiscal-years', draft);
            setDialogOpen(false); await load();
        } catch (requestError) { setError(getError(requestError)); }
        finally { setSaving(false); }
    };
    const setCurrent = async (item: FiscalYear) => {
        try { await api.patch(`/organization/fiscal-years/${item._id}`, { name: item.name, startDate: item.startDate, endDate: item.endDate, isCurrent: true }); await load(); }
        catch (requestError) { setError(getError(requestError)); }
    };
    const remove = async (item: FiscalYear) => {
        if (!window.confirm(`Delete fiscal year ${item.name}?`)) return;
        try { await api.delete(`/organization/fiscal-years/${item._id}`); await load(); }
        catch (requestError) { setError(getError(requestError)); }
    };
    return <OrganizationPageLayout icon={<CalendarRange />} title="Fiscal Year" description="Define financial periods and choose the current fiscal year."
        action={<Button variant="contained" startIcon={<Plus size={18} />} onClick={openCreate}>Add Fiscal Year</Button>}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : years.length === 0 ?
            <Card variant="outlined"><CardContent sx={{ py: 8, textAlign: 'center' }}><CalendarRange size={42} /><Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>No fiscal years yet</Typography><Typography color="text.secondary" sx={{ mb: 2 }}>Add a reporting period for this business.</Typography><Button variant="contained" onClick={openCreate}>Add Fiscal Year</Button></CardContent></Card> :
            <Stack spacing={1.5}>{years.map((item) => <Card key={item._id} variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                <Box><Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6" fontWeight={850}>{item.name}</Typography>{item.isCurrent && <Chip size="small" color="primary" label="Current" />}</Stack><Typography variant="body2" color="text.secondary">{item.startDate} to {item.endDate}</Typography></Box>
                <Stack direction="row" alignItems="center" spacing={1}><Typography variant="body2">Current</Typography><Switch checked={item.isCurrent} disabled={item.isCurrent} onChange={() => void setCurrent(item)} /><IconButton aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><Pencil size={17} /></IconButton><IconButton color="error" aria-label={`Delete ${item.name}`} onClick={() => void remove(item)}><Trash2 size={17} /></IconButton></Stack>
            </Stack></CardContent></Card>)}</Stack>}
        <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm"><Box component="form" onSubmit={save}><DialogTitle>{editing ? 'Edit Fiscal Year' : 'Add Fiscal Year'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Fiscal year name" placeholder="FY 2026–2027" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required autoFocus /><TextField label="Start date" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required InputLabelProps={{ shrink: true }} /><TextField label="End date" type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required InputLabelProps={{ shrink: true }} error={Boolean(draft.startDate && draft.endDate && draft.endDate < draft.startDate)} helperText={draft.startDate && draft.endDate && draft.endDate < draft.startDate ? 'End date must be on or after the start date.' : ''} /><Stack direction="row" alignItems="center" justifyContent="space-between"><Box><Typography fontWeight={700}>Current fiscal year</Typography><Typography variant="caption" color="text.secondary">This will replace the current selection.</Typography></Box><Switch checked={draft.isCurrent} onChange={(event) => setDraft({ ...draft, isCurrent: event.target.checked })} /></Stack></Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving || Boolean(draft.startDate && draft.endDate && draft.endDate < draft.startDate)}>{saving ? 'Saving...' : 'Save Fiscal Year'}</Button></DialogActions></Box></Dialog>
    </OrganizationPageLayout>;
}
