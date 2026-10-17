import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogTitle, DialogContent, DialogActions, Stack, TextField, Typography } from '@mui/material';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import useProductCategories from '../../hooks/useProductCategories';
import RequestCategoryUnitsDialog from './RequestCategoryUnitsDialog';

export default function CategoriesManager() {
    const { categories, loading, error, reload } = useProductCategories();
    const [editing, setEditing] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [saveError, setSaveError] = useState('');
    const [unitsOpen, setUnitsOpen] = useState(false);
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = name.trim().replace(/\s+/g, ' ');
        setMessage(''); setSaveError('');
        if (!trimmed) { setSaveError('Enter a category name.'); return; }
        if (categories.some(category => category.toLowerCase() === trimmed.toLowerCase() && category !== editing)) {
            setSaveError('This category already exists.'); return;
        }
        setSaving(true);
        try {
            if (editing) await api.put('/categories', { oldName: editing, name: trimmed });
            else await api.post('/categories', { name: trimmed });
            setName(''); setEditing(null); setMessage(editing ? 'Category updated successfully.' : 'Category added successfully.'); await reload(true);
        } catch (error) { setSaveError(error instanceof Error && 'response' in error ? (error as { response?: { data?: { message?: string } } }).response?.data?.message || error.message : 'Unable to save category. Please retry.'); }
        finally { setSaving(false); }
    };
    return <Box>
        {unitsOpen && <RequestCategoryUnitsDialog onClose={() => setUnitsOpen(false)} onSaved={() => void reload(true)} />}
        <Button variant="outlined" sx={{ mb: 2 }} onClick={() => setUnitsOpen(true)}>Request Categories & Units</Button>
        <Card sx={{ borderRadius: 4, mb: 3 }}><CardContent>
            <Stack component="form" onSubmit={submit} spacing={2}>
                <TextField label="Category name" value={name} onChange={e => setName(e.target.value)} required inputProps={{ maxLength: 100 }} disabled={saving} />
                <Button type="submit" variant="contained" startIcon={<Plus size={18} />} disabled={saving || loading || Boolean(error)} sx={{ alignSelf: 'flex-start' }}>{saving ? 'Saving...' : editing ? 'Save Category' : 'Add Category'}</Button>
                {editing && <Button disabled={saving} onClick={() => { setEditing(null); setName(''); }}>Cancel Edit</Button>}
                {message && <Alert severity="success">{message}</Alert>}
                {saveError && <Alert severity="error">{saveError}</Alert>}
            </Stack>
        </CardContent></Card>
        {error && <Alert severity="error" action={<Button onClick={() => void reload(true)}>Retry</Button>} sx={{ mb: 2 }}>{error}</Alert>}
        <Card sx={{ borderRadius: 4 }}><CardContent>
            <Typography variant="h6" fontWeight={700} gutterBottom>Available categories</Typography>
            {loading ? <Typography>Loading categories...</Typography> : <Stack spacing={1}>{categories.map(category => <Stack key={category} direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 1 }}>
                <Typography>{category}</Typography><Stack direction="row" gap={1}>
                    <Button disabled={saving} startIcon={<Pencil size={16} />} onClick={() => { setEditing(category); setName(category); setMessage(''); setSaveError(''); }}>Edit</Button>
                    <Button disabled={saving} color="error" startIcon={<Trash2 size={16} />} onClick={() => setDeleting(category)}>Delete</Button>
                </Stack>
            </Stack>)}</Stack>}
        </CardContent></Card>
        <Dialog open={Boolean(deleting)} onClose={() => { if (!saving) setDeleting(null); }}>
            <DialogTitle>Delete category?</DialogTitle><DialogContent>Delete {deleting}? Categories used by inventory items or pending requests cannot be deleted.</DialogContent>
            <DialogActions><Button disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button disabled={saving} color="error" onClick={async () => {
                setSaving(true); setSaveError(''); setMessage('');
                try { await api.delete('/categories', { data: { name: deleting } }); setMessage('Category deleted.'); if (editing === deleting) { setEditing(null); setName(''); } setDeleting(null); await reload(true); }
                catch (error) { setDeleting(null); setSaveError(error instanceof Error && 'response' in error ? (error as { response?: { data?: { message?: string } } }).response?.data?.message || error.message : 'Unable to delete category.'); }
                finally { setSaving(false); }
            }}>Delete</Button></DialogActions>
        </Dialog>
    </Box>;
}
