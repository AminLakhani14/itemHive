import React from 'react';
import axios from 'axios';
import { Alert, Box, Button, Checkbox, FormControlLabel, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../api/axios';
import type { BusinessType } from '../../types/businessType';
import { BUSINESS_PRODUCT_FIELDS, type BusinessProductField } from '../../types/businessType';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../../store';
import { fetchSettings } from '../../features/settings/settingsSlice';

const errorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || 'Business types could not be updated.'
    : 'Business types could not be updated.';

const BusinessTypesManager: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const [types, setTypes] = React.useState<BusinessType[]>([]);
    const [name, setName] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [deletingType, setDeletingType] = React.useState<BusinessType | null>(null);

    const loadTypes = React.useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get<BusinessType[]>('/users/business-types');
            setTypes(response.data);
        } catch (requestError: unknown) {
            setError(errorMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { loadTypes(); }, [loadTypes]);

    const addType = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await api.post('/users/business-types', { name: name.trim() });
            setName('');
            setNotice('Business type added. You can select it in Team → Manage.');
            window.dispatchEvent(new Event('itemhive-business-types-updated'));
            await loadTypes();
        } catch (requestError: unknown) {
            setError(errorMessage(requestError));
        } finally {
            setSaving(false);
        }
    };

    const deleteType = async () => {
        if (!deletingType) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await api.delete(`/users/business-types/${deletingType.id}`);
            setDeletingType(null);
            setNotice('Business type deleted.');
            window.dispatchEvent(new Event('itemhive-business-types-updated'));
            await loadTypes();
        } catch (requestError: unknown) {
            setError(errorMessage(requestError));
            setDeletingType(null);
            await loadTypes();
        } finally {
            setSaving(false);
        }
    };

    const updateFields = async (type: BusinessType, field: BusinessProductField, checked: boolean) => {
        const fields = type.productFields || ['unitSize'];
        const productFields = checked ? [...fields, field] : fields.filter(key => key !== field);
        setSaving(true); setError(''); setNotice('');
        try {
            await api.patch(`/users/business-types/${type.id}`, { productFields });
            await loadTypes();
            await dispatch(fetchSettings());
            window.dispatchEvent(new Event('itemhive-business-types-updated'));
            setNotice(`Product fields updated for ${type.name}.`);
        } catch (requestError: unknown) {
            setError(errorMessage(requestError));
        } finally { setSaving(false); }
    };

    return (
        <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">Manage the business types available in Team and choose which extra fields appear in Add Product. Restaurant / KOT enables restaurant billing and kitchen tickets.</Typography>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
            <Stack component="form" onSubmit={addType} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField fullWidth size="small" label="New Business Type" placeholder="e.g. Pharmacy" value={name} onChange={(event) => setName(event.target.value)} disabled={saving} required inputProps={{ minLength: 2, maxLength: 80 }} />
                <Button type="submit" variant="contained" startIcon={<Plus size={17} />} disabled={saving || loading || name.trim().length < 2} sx={{ flexShrink: 0 }}>Add Type</Button>
            </Stack>
            {loading ? <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={26} /></Box> : types.map((type) => (
                <Stack key={type.id} direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{type.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{type.businessCount ? `${type.businessCount} business(es) assigned. Change their type in Team before deleting.` : 'No businesses assigned.'}</Typography>
                        <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                            {BUSINESS_PRODUCT_FIELDS.map(field => <FormControlLabel key={field.key} label={field.label} control={<Checkbox size="small" checked={(type.productFields || ['unitSize']).includes(field.key)} disabled={saving} onChange={(_, checked) => void updateFields(type, field.key, checked)} />} />)}
                        </Stack>
                    </Box>
                    <Button color="error" variant="outlined" startIcon={<Trash2 size={16} />} disabled={saving || type.businessCount > 0} onClick={() => setDeletingType(type)} aria-label={`Delete business type ${type.name}`} sx={{ flexShrink: 0 }}>Delete</Button>
                </Stack>
            ))}
            {!loading && !types.length && <Typography color="text.secondary">No business types. Add one above.</Typography>}
            <Dialog open={Boolean(deletingType)} onClose={() => !saving && setDeletingType(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Delete Business Type</DialogTitle>
                <DialogContent>Delete {deletingType?.name} from the business type dropdown?</DialogContent>
                <DialogActions>
                    <Button disabled={saving} onClick={() => setDeletingType(null)}>Cancel</Button>
                    <Button disabled={saving} color="error" variant="contained" onClick={deleteType}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default BusinessTypesManager;
