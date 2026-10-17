import React from 'react';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Alert, Autocomplete, Box, Button, Chip, CircularProgress, Divider, MenuItem, Paper, Snackbar, Stack, TextField, Typography,
} from '@mui/material';
import { ArrowLeft, Building2, Plus, Save, Trash2, UserRound } from 'lucide-react';
import api from '../../api/axios';
import type { AppDispatch, RootState } from '../../store';
import { fetchSettings } from '../../features/settings/settingsSlice';
import type { BusinessType } from '../../types/businessType';
import type { OrganizationAdmin, OrganizationBranch } from '../Organization/organizationTypes';
import Section from '../../components/Common/FormSection';
import BranchFields, { type BranchForm } from '../../components/Organization/BranchFields';
import { useCountries } from '../../lib/useLocations';
import { cleanCnic, cleanPhone, cnicError, manualEntryInputProps, phoneError } from '../../lib/contactFormat';

interface ClientContact { name: string; email: string; phone: string; cnic: string }
interface ClientDetails {
    id: string;
    name: string;
    businessTypeId: string;
    contact: ClientContact;
    countryCode: string;
    branches: OrganizationBranch[];
    administrators: OrganizationAdmin[];
}
interface BranchDraft extends BranchForm { key: string; id?: string; adminUserIds: string[] }

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 };
const errorMessage = (error: unknown) => axios.isAxiosError(error)
    ? error.response?.data?.details || error.response?.data?.message || 'Unable to reach the server. Please retry.'
    : 'Something went wrong. Please retry.';
const toDraft = (branch: OrganizationBranch): BranchDraft => ({
    key: branch.id, id: branch.id, name: branch.name, location: branch.location, phone: branch.phone,
    countryCode: branch.countryCode, city: branch.city, adminUserIds: branch.adminUserIds,
});

export default function EditClientPage() {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const countries = useCountries();
    const [client, setClient] = React.useState<ClientDetails | null>(null);
    const [types, setTypes] = React.useState<BusinessType[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState('');
    const [retry, setRetry] = React.useState(0);
    const [businessName, setBusinessName] = React.useState('');
    const [businessTypeId, setBusinessTypeId] = React.useState('');
    const [contact, setContact] = React.useState<ClientContact>({ name: '', email: '', phone: '', cnic: '' });
    const [branches, setBranches] = React.useState<BranchDraft[]>([]);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [snack, setSnack] = React.useState('');
    const [submitAttempted, setSubmitAttempted] = React.useState(false);
    const [touched, setTouched] = React.useState<Record<string, boolean>>({});
    const errorRef = React.useRef<HTMLDivElement>(null);
    const visibleError = (key: string, message: string) => submitAttempted || touched[key] ? message : '';
    const contactPhoneError = visibleError('phone', phoneError(contact.phone));
    const contactCnicError = visibleError('cnic', cnicError(contact.cnic));

    const apply = React.useCallback((data: ClientDetails) => {
        setClient(data);
        setBusinessName(data.name);
        setBusinessTypeId(data.businessTypeId);
        setContact(data.contact);
        setBranches(data.branches.map(toDraft));
    }, []);

    React.useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setLoadError('');
        Promise.all([
            api.get<ClientDetails>(`/users/clients/${id}`, { signal: controller.signal }),
            api.get<BusinessType[]>('/users/business-types', { signal: controller.signal }),
        ])
            .then(([clientResponse, typesResponse]) => { apply(clientResponse.data); setTypes(typesResponse.data); })
            .catch((err) => { if (!controller.signal.aborted) setLoadError(errorMessage(err)); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [id, retry, apply]);

    const updateBranch = (key: string, updates: Partial<BranchDraft>) =>
        setBranches((current) => current.map((branch) => branch.key === key ? { ...branch, ...updates } : branch));
    const addBranch = () => setBranches((current) => [...current, {
        key: crypto.randomUUID(), name: '', location: '', phone: '', countryCode: client?.countryCode || '', city: '', adminUserIds: [],
    }]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving) return;
        if (phoneError(contact.phone) || cnicError(contact.cnic) || branches.some((branch) => phoneError(branch.phone))) {
            setSubmitAttempted(true);
            window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus(), 0);
            return;
        }
        setSaving(true); setError('');
        try {
            const { data } = await api.put<ClientDetails>(`/users/clients/${id}`, {
                businessName, businessTypeId, client: contact,
                branches: branches.map((branch) => ({
                    id: branch.id, name: branch.name, location: branch.location, phone: branch.phone,
                    countryCode: branch.countryCode, city: branch.city, adminUserIds: branch.adminUserIds,
                })),
            });
            apply(data);
            setSubmitAttempted(false); setTouched({});
            setSnack('Client updated.');
            window.dispatchEvent(new Event('itemhive-team-updated'));
            window.dispatchEvent(new Event('itemhive-branches-updated'));
            const activeBusinessId = localStorage.getItem('itemhive-workspace-id') || currentUser?.businessId || '';
            if (id === activeBusinessId) dispatch(fetchSettings());
        } catch (err) {
            setError(errorMessage(err));
            window.setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
        } finally { setSaving(false); }
    };

    const backButton = <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate('/team')} disabled={saving} sx={{ mb: 1.5 }}>Team Management</Button>;
    if (loading) return <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box>;
    if (!client) return <Box sx={{ maxWidth: 1280, mx: 'auto' }}>{backButton}
        <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry((value) => value + 1)}>Retry</Button>}>{loadError || 'Client not found.'}</Alert>
    </Box>;

    const activeAdminIds = new Set(client.administrators.map((admin) => admin.id));
    const knownType = !businessTypeId || types.some((type) => type.id === businessTypeId);

    return <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
        <Snackbar open={Boolean(snack)} autoHideDuration={2600} onClose={() => setSnack('')} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <Alert severity="success" onClose={() => setSnack('')}>{snack}</Alert>
        </Snackbar>
        {backButton}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'action.selected', color: 'primary.main', display: { xs: 'none', sm: 'flex' } }}><Building2 size={28} /></Box>
            <Box><Typography variant="h4" fontWeight={800}>Edit Client</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>Update {client.name}'s business details and branches.</Typography></Box>
        </Stack>
        {error && <Alert ref={errorRef} severity="error" role="alert" sx={{ mb: 3 }}>{error}</Alert>}
        {countries.error && <Alert severity="error" sx={{ mb: 3 }} action={<Button color="inherit" onClick={countries.retry}>Retry</Button>}>{countries.error}</Alert>}
        <Box component="form" onSubmit={submit} autoComplete="off">
            <Box component="fieldset" disabled={saving} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                <Stack spacing={3}>
                    <Section number="01" title="Client & business details" description="The business and the person we should contact.">
                        <Box sx={grid}>
                            <TextField label="Business name" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} inputProps={{ ...manualEntryInputProps, maxLength: 160 }} />
                            <TextField select label="Business type" value={businessTypeId} onChange={(e) => setBusinessTypeId(e.target.value)} helperText="Restaurant / KOT enables restaurant features.">
                                <MenuItem value="">Not assigned</MenuItem>
                                {types.map((type) => <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>)}
                                {!knownType && <MenuItem value={businessTypeId} disabled>Selected business type</MenuItem>}
                            </TextField>
                        </Box>
                        <Divider sx={{ my: 3 }} />
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5 }}><UserRound size={18} /><Typography fontWeight={700}>Client contact</Typography></Stack>
                        <Box sx={grid}>
                            <TextField label="Client user name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} inputProps={{ ...manualEntryInputProps, maxLength: 120 }} />
                            <TextField label="Client email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} inputProps={{ ...manualEntryInputProps, maxLength: 254 }} />
                            <TextField label="Phone number" type="tel" placeholder="+92 300 1234567" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: cleanPhone(e.target.value) })} onBlur={() => setTouched((current) => ({ ...current, phone: true }))} error={Boolean(contactPhoneError)} helperText={contactPhoneError || 'Optional · 7–15 digits, with an optional leading +.'} inputProps={{ ...manualEntryInputProps, maxLength: 25 }} />
                            <TextField label="CNIC" placeholder="12345-1234567-1" value={contact.cnic} onChange={(e) => setContact({ ...contact, cnic: cleanCnic(e.target.value) })} onBlur={() => setTouched((current) => ({ ...current, cnic: true }))} error={Boolean(contactCnicError)} helperText={contactCnicError || 'Optional · 13 digits, with or without dashes.'} inputProps={{ ...manualEntryInputProps, maxLength: 15, inputMode: 'numeric' }} />
                        </Box>
                    </Section>

                    <Section number="02" title="Branches" description="Edit branch details, add new branches and choose who administers each one.">
                        <Stack spacing={2}>
                            {branches.map((branch, index) => <Box key={branch.key} role="group" aria-label={`Branch ${index + 1}`} sx={{ p: { xs: 2, sm: 2.5 }, border: '1px solid', borderColor: branch.id ? 'divider' : 'primary.main', borderRadius: 2 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                                    <Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={700}>Branch {index + 1}</Typography>{!branch.id && <Chip size="small" color="primary" label="New" />}</Stack>
                                    {!branch.id && <Button type="button" size="small" color="error" startIcon={<Trash2 size={15} />} aria-label={`Remove branch ${index + 1}`}
                                        onClick={() => setBranches((current) => current.filter((item) => item.key !== branch.key))}>Remove</Button>}
                                </Stack>
                                <BranchFields value={branch} onChange={(updates) => updateBranch(branch.key, updates)} countries={countries.countries} countriesLoading={countries.loading} disabled={saving} showErrors={submitAttempted} />
                                {/* Assignments of deactivated administrators are not listed, and are kept. */}
                                <Autocomplete multiple options={client.administrators} disabled={saving} sx={{ mt: 2.5 }}
                                    value={client.administrators.filter((admin) => branch.adminUserIds.includes(admin.id))}
                                    getOptionLabel={(option) => `${option.name} · ${option.email}`} isOptionEqualToValue={(option, value) => option.id === value.id}
                                    onChange={(_event, values) => updateBranch(branch.key, { adminUserIds: [...branch.adminUserIds.filter((adminId) => !activeAdminIds.has(adminId)), ...values.map((value) => value.id)] })}
                                    renderInput={(params) => <TextField {...params} label="Branch administrators" helperText="An administrator assigned to any branch sees only the branches assigned to them." />}
                                    renderTags={(values, getTagProps) => values.map((value, tagIndex) => <Chip {...getTagProps({ index: tagIndex })} key={value.id} label={value.name} />)} />
                            </Box>)}
                            {!branches.length && <Typography variant="body2" color="text.secondary">This client has no branches yet.</Typography>}
                            <Button type="button" variant="outlined" startIcon={<Plus size={17} />} disabled={saving} onClick={addBranch} sx={{ alignSelf: 'flex-start' }}>Add Branch</Button>
                        </Stack>
                    </Section>

                    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2}>
                            <Typography variant="body2" color="text.secondary">The administrator login and module permissions are managed from Team and Permissions.</Typography>
                            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
                                <Button onClick={() => navigate('/team')} disabled={saving}>Cancel</Button>
                                <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={17} color="inherit" /> : <Save size={17} />}>{saving ? 'Saving…' : 'Save Changes'}</Button>
                            </Stack>
                        </Stack>
                    </Paper>
                </Stack>
            </Box>
        </Box>
    </Box>;
}
