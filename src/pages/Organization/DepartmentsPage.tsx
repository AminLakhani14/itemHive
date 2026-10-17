import React from 'react';
import axios from 'axios';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import api from '../../api/axios';
import OrganizationPageLayout from './OrganizationPageLayout';
import type { Department } from './organizationTypes';

const getError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.message || 'Unable to complete this request.' : 'Unable to complete this request.';
const emptyDraft = { name: '', description: '', isActive: true };

export default function DepartmentsPage() {
    const [departments, setDepartments] = React.useState<Department[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<Department | null>(null);
    const [draft, setDraft] = React.useState(emptyDraft);

    const load = React.useCallback(async () => {
        setLoading(true); setError('');
        try { setDepartments((await api.get<Department[]>('/organization/departments')).data); }
        catch (requestError) { setError(getError(requestError)); }
        finally { setLoading(false); }
    }, []);
    React.useEffect(() => { void load(); }, [load]);

    const openCreate = () => { setEditing(null); setDraft(emptyDraft); setDialogOpen(true); };
    const openEdit = (item: Department) => { setEditing(item); setDraft({ name: item.name, description: item.description, isActive: item.isActive }); setDialogOpen(true); };
    const save = async (event: React.FormEvent) => {
        event.preventDefault(); setSaving(true); setError('');
        try {
            if (editing) await api.patch(`/organization/departments/${editing._id}`, draft);
            else await api.post('/organization/departments', draft);
            setDialogOpen(false); await load();
        } catch (requestError) { setError(getError(requestError)); }
        finally { setSaving(false); }
    };
    const remove = async (item: Department) => {
        if (!window.confirm(`Delete ${item.name}? Employees assigned to it will become unassigned.`)) return;
        try { await api.delete(`/organization/departments/${item._id}`); await load(); }
        catch (requestError) { setError(getError(requestError)); }
    };

    return <OrganizationPageLayout icon={<UsersRound />} title="Departments" description="Create departments such as HR, Finance, Operations, and Sales."
        action={<Button variant="contained" startIcon={<Plus size={18} />} onClick={openCreate}>Add Department</Button>}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box> : departments.length === 0 ?
            <Card variant="outlined"><CardContent sx={{ py: 8, textAlign: 'center' }}><UsersRound size={42} /><Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>No departments yet</Typography><Typography color="text.secondary" sx={{ mb: 2 }}>Add the first department for this client.</Typography><Button variant="contained" onClick={openCreate}>Add Department</Button></CardContent></Card> :
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
                {departments.map((item) => <Card key={item._id} variant="outlined" sx={{ borderRadius: 2.5 }}><CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box><Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6" fontWeight={850}>{item.name}</Typography><Chip size="small" color={item.isActive ? 'success' : 'default'} label={item.isActive ? 'Active' : 'Inactive'} /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.description || 'No description added.'}</Typography></Box>
                        <Stack direction="row"><IconButton aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><Pencil size={17} /></IconButton><IconButton color="error" aria-label={`Delete ${item.name}`} onClick={() => void remove(item)}><Trash2 size={17} /></IconButton></Stack>
                    </Stack>
                </CardContent></Card>)}
            </Box>}
        <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="sm">
            <Box component="form" onSubmit={save}><DialogTitle>{editing ? 'Edit Department' : 'Add Department'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Department name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required autoFocus inputProps={{ maxLength: 120 }} /><TextField label="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} multiline minRows={3} inputProps={{ maxLength: 500 }} /><TextField select SelectProps={{ native: true }} label="Status" value={draft.isActive ? 'active' : 'inactive'} onChange={(event) => setDraft({ ...draft, isActive: event.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></TextField></Stack></DialogContent><DialogActions><Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving...' : 'Save Department'}</Button></DialogActions></Box>
        </Dialog>
    </OrganizationPageLayout>;
}
