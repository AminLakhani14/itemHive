import React from 'react';
import { Alert, Autocomplete, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import api from '../../api/axios';
import type { RequestCategoryUnitsResponse } from '../../lib/requestCategoryUnits';

export default function RequestCategoryUnitsDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
    const [catalog, setCatalog] = React.useState<RequestCategoryUnitsResponse>({ categories: [], unitOptions: [] });
    const [name, setName] = React.useState('');
    const [units, setUnits] = React.useState<string[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const load = React.useCallback(async () => {
        setLoading(true); setError('');
        try { const { data } = await api.get<RequestCategoryUnitsResponse>('/categories/request-units'); setCatalog(data); }
        catch { setError('Unable to load category units. Please retry.'); }
        finally { setLoading(false); }
    }, []);
    React.useEffect(() => { void load(); }, [load]);
    const save = async (event: React.FormEvent) => {
        event.preventDefault(); setError(''); setNotice(''); setSaving(true);
        try {
            const { data } = await api.put<{ name: string; units: string[] }>('/categories/request-units', { name: name.trim(), units });
            setName(data.name); setUnits(data.units); setNotice('Category units saved.');
            await load(); onSaved?.(); window.dispatchEvent(new Event('itemhive-category-units-changed'));
        } catch (failure) { setError((failure as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to save category units.'); }
        finally { setSaving(false); }
    };
    return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!saving) onClose(); }}>
        <Stack component="form" onSubmit={save}>
            <DialogTitle>Request Categories & Units</DialogTitle>
            <DialogContent dividers><Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">Choose which units users can select for each material category. A category with one unit selects it automatically.</Typography>
                {error && <Alert severity="error" action={<Button onClick={() => void load()}>Reload</Button>}>{error}</Alert>}
                {notice && <Alert severity="success">{notice}</Alert>}
                {loading ? <CircularProgress size={24} /> : <>
                    <Autocomplete freeSolo disabled={saving} options={catalog.categories.map(category => category.name)} inputValue={name} onInputChange={(_, value) => { setName(value); setNotice(''); }} onChange={(_, value) => setUnits(catalog.categories.find(category => category.name === value)?.units || [])} renderInput={params => <TextField {...params} required label="Category" helperText="Select a category or enter a new name." slotProps={{ htmlInput: { ...params.inputProps, maxLength: 100 } }} />} />
                    <Autocomplete multiple freeSolo disabled={saving} options={[...new Set([...catalog.unitOptions, ...catalog.categories.flatMap(category => category.units)])]} value={units} onChange={(_, values) => { setUnits(values.map(value => value.trim()).filter(Boolean)); setNotice(''); }} renderInput={params => <TextField {...params} label="Allowed units" helperText="Choose units, or type a custom unit and press Enter." />} />
                </>}
            </Stack></DialogContent>
            <DialogActions><Button disabled={saving} onClick={onClose}>Close</Button><Button type="submit" variant="contained" disabled={saving || loading || !name.trim() || !units.length}>{saving ? 'Saving...' : 'Save Category Units'}</Button></DialogActions>
        </Stack>
    </Dialog>;
}
