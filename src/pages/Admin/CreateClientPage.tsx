import React from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
    Alert, Box, Button, Chip, CircularProgress, Divider,
    IconButton, InputAdornment, MenuItem, Paper, Stack, TextField,
    Typography,
} from '@mui/material';
import { ArrowLeft, Building2, Check, Eye, EyeOff, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import api from '../../api/axios';
import { loadCountries, loadCities, type CountryOption } from '../../api/clientLocations';
import { ALL_ADMIN_SCREEN_KEYS, type ScreenPermission } from '../../lib/screenPermissions';
import type { BusinessType } from '../../types/businessType';
import SearchableSelect from '../../components/Common/SearchableSelect';
import ScreenPermissionPicker from '../../components/Common/ScreenPermissionPicker';
import Section from '../../components/Common/FormSection';
import { cleanCnic, cleanPhone, cnicError, manualEntryInputProps, phoneError } from '../../lib/contactFormat';

const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 };
interface BranchDraft { id: string; name: string; location: string; phone: string; city: string; bindAdmin: boolean }
const newBranch = (): BranchDraft => ({ id: crypto.randomUUID(), name: '', location: '', phone: '', city: '', bindAdmin: false });
// Branches are optional. A blank branch is skipped; one with any detail needs a name.
const branchHasDetails = (branch: BranchDraft) => Boolean(branch.name.trim() || branch.location.trim() || branch.phone.trim() || branch.city || branch.bindAdmin);
const errorMessage = (error: unknown) => axios.isAxiosError(error)
    ? error.response?.data?.details || error.response?.data?.message || 'Unable to reach the server. Please retry.'
    : 'Something went wrong. Please retry.';

export default function CreateClientPage() {
    const navigate = useNavigate();
    const [businessName, setBusinessName] = React.useState('');
    const [businessTypeId, setBusinessTypeId] = React.useState('');
    const [types, setTypes] = React.useState<BusinessType[]>([]);
    const [typesLoading, setTypesLoading] = React.useState(true);
    const [typesError, setTypesError] = React.useState('');
    const [client, setClient] = React.useState({ name: '', email: '', phone: '', cnic: '' });
    const [admin, setAdmin] = React.useState({ name: '', email: '', password: '' });
    const adminDisplayName = admin.name.trim() || client.name.trim() || 'New administrator';
    const adminOptionLabel = admin.email.trim() ? `${adminDisplayName} · ${admin.email.trim()}` : adminDisplayName;
    const [country, setCountry] = React.useState<CountryOption | null>(null);
    const [city, setCity] = React.useState<string | null>(null);
    const [countries, setCountries] = React.useState<CountryOption[]>([]);
    const [cities, setCities] = React.useState<string[]>([]);
    const [branches, setBranches] = React.useState<BranchDraft[]>(() => [newBranch()]);
    const cityOptions = React.useMemo(() => cities.map((item) => ({ value: item, label: item })), [cities]);
    const [countriesLoading, setCountriesLoading] = React.useState(true);
    const [citiesLoading, setCitiesLoading] = React.useState(false);
    const [countriesError, setCountriesError] = React.useState('');
    const [citiesError, setCitiesError] = React.useState('');
    const [countryRetry, setCountryRetry] = React.useState(0);
    const [cityRetry, setCityRetry] = React.useState(0);
    const [typeRetry, setTypeRetry] = React.useState(0);
    const [permissions, setPermissions] = React.useState<ScreenPermission[]>(['dashboard', 'pos', 'inventory', 'customers', 'transactions', 'organization']);
    const [showPassword, setShowPassword] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [created, setCreated] = React.useState(false);
    const [touched, setTouched] = React.useState<Record<string, boolean>>({});
    const [submitAttempted, setSubmitAttempted] = React.useState(false);
    const errorRef = React.useRef<HTMLDivElement>(null);
    const touch = (key: string) => setTouched((current) => current[key] ? current : { ...current, [key]: true });
    // Show format errors once a field has been left or a submit was attempted, not on every keystroke.
    const visibleError = (key: string, message: string) => submitAttempted || touched[key] ? message : '';
    const clientPhoneError = visibleError('phone', phoneError(client.phone));
    const clientCnicError = visibleError('cnic', cnicError(client.cnic));

    React.useEffect(() => {
        const controller = new AbortController();
        setTypesLoading(true); setTypesError('');
        api.get<BusinessType[]>('/users/business-types', { signal: controller.signal })
            .then(({ data }) => setTypes(data))
            .catch((err) => { if (!controller.signal.aborted) setTypesError(errorMessage(err)); })
            .finally(() => { if (!controller.signal.aborted) setTypesLoading(false); });
        return () => controller.abort();
    }, [typeRetry]);

    React.useEffect(() => {
        const controller = new AbortController();
        setCountriesLoading(true); setCountriesError('');
        loadCountries(controller.signal)
            .then((data) => { if (!controller.signal.aborted) setCountries(data); })
            .catch(() => { if (!controller.signal.aborted) setCountriesError('Countries could not be loaded.'); })
            .finally(() => { if (!controller.signal.aborted) setCountriesLoading(false); });
        return () => controller.abort();
    }, [countryRetry]);

    React.useEffect(() => {
        if (!country) return;
        const controller = new AbortController();
        setCitiesLoading(true); setCitiesError('');
        loadCities(country, controller.signal)
            .then((data) => { if (!controller.signal.aborted) setCities(data); })
            .catch(() => { if (!controller.signal.aborted) setCitiesError('Cities could not be loaded for this country.'); })
            .finally(() => { if (!controller.signal.aborted) setCitiesLoading(false); });
        return () => controller.abort();
    }, [country, cityRetry]);

    const changeCountry = (code: string) => {
        const value = countries.find((item) => item.code === code) || null;
        setCountry(value); setCity(null); setCities([]); setCitiesError(''); setCitiesLoading(Boolean(value));
        setBranches((current) => current.map((branch) => ({ ...branch, city: '' })));
    };
    const updateBranch = (id: string, updates: Partial<Omit<BranchDraft, 'id'>>) =>
        setBranches((current) => current.map((branch) => branch.id === id ? { ...branch, ...updates } : branch));
    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (saving || created || !country || !city) return;
        const filledBranches = branches.filter(branchHasDetails);
        if (phoneError(client.phone) || cnicError(client.cnic) || filledBranches.some((branch) => phoneError(branch.phone))) {
            setSubmitAttempted(true);
            window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus(), 0);
            return;
        }
        setSaving(true); setError('');
        try {
            await api.post('/users/clients', {
                businessName, businessTypeId, client,
                branches: filledBranches.map((branch) => ({ name: branch.name, location: branch.location, phone: branch.phone, city: branch.city, bindAdmin: Boolean(branch.bindAdmin) })),
                admin: { ...admin, name: admin.name.trim() || client.name.trim(), role: 'admin', countryCode: country.code, city },
                screenPermissions: permissions,
            });
            setCreated(true);
            window.dispatchEvent(new Event('itemhive-team-updated'));
        } catch (err) {
            setError(errorMessage(err));
            window.setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
        } finally { setSaving(false); }
    };

    if (created) return <Paper variant="outlined" sx={{ maxWidth: 650, mx: 'auto', mt: 6, p: { xs: 3, sm: 5 }, textAlign: 'center', borderRadius: 3 }}>
        <Box sx={{ display: 'inline-flex', p: 2, borderRadius: '50%', bgcolor: 'action.selected', color: 'primary.main', mb: 2 }}><Check size={32} /></Box>
        <Typography variant="h4" fontWeight={800}>Client created</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>{businessName} is ready. The administrator can sign in with {admin.email} and access the modules you selected.</Typography>
        <Button variant="contained" onClick={() => navigate('/team')}>Back to Team Management</Button>
    </Paper>;

    return <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate('/team')} disabled={saving} sx={{ mb: 1.5 }}>Team Management</Button>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'action.selected', color: 'primary.main', display: { xs: 'none', sm: 'flex' } }}><Building2 size={28} /></Box>
            <Box><Typography variant="h4" fontWeight={800}>Create Client</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>Set up a business, its administrator, and access to Ozor.</Typography></Box>
        </Stack>
        {error && <Alert ref={errorRef} severity="error" role="alert" sx={{ mb: 3 }}>{error}</Alert>}
        <Box component="form" onSubmit={submit} autoComplete="off">
            <Box component="fieldset" disabled={saving} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                <Stack spacing={3}>
                    <Section number="01" title="Client & business details" description="Start with the business and the person we should contact.">
                        <Box sx={grid}>
                            <TextField label="Business name" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} inputProps={{ ...manualEntryInputProps, maxLength: 160 }} />
                            <TextField select label="Business type" required value={businessTypeId} onChange={(e) => setBusinessTypeId(e.target.value)} disabled={typesLoading || Boolean(typesError)} helperText={typesLoading ? 'Loading business types…' : 'Choose the type that best fits this business.'}>
                                {types.map((type) => <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>)}
                            </TextField>
                        </Box>
                        {typesError && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setTypeRetry((v) => v + 1)}>Retry</Button>}>{typesError}</Alert>}
                        <Divider sx={{ my: 3 }} />
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5 }}><UserRound size={18} /><Typography fontWeight={700}>Client contact</Typography></Stack>
                        <Box sx={grid}>
                            <TextField label="Client user name" required value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} inputProps={{ ...manualEntryInputProps, maxLength: 120 }} />
                            <TextField label="Client email" required type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} inputProps={{ ...manualEntryInputProps, maxLength: 254 }} />
                            <TextField label="Phone number" type="tel" placeholder="+92 300 1234567" value={client.phone} onChange={(e) => setClient({ ...client, phone: cleanPhone(e.target.value) })} onBlur={() => touch('phone')} error={Boolean(clientPhoneError)} helperText={clientPhoneError || 'Optional · 7–15 digits, with an optional leading +.'} inputProps={{ ...manualEntryInputProps, maxLength: 25 }} />
                            <TextField label="CNIC" placeholder="12345-1234567-1" value={client.cnic} onChange={(e) => setClient({ ...client, cnic: cleanCnic(e.target.value) })} onBlur={() => touch('cnic')} error={Boolean(clientCnicError)} helperText={clientCnicError || 'Optional · 13 digits, with or without dashes.'} inputProps={{ ...manualEntryInputProps, maxLength: 15, inputMode: 'numeric' }} />
                        </Box>
                    </Section>

                    <Section number="02" title="Administrator account" description="Create the login that will manage this client's business.">
                        <Box sx={grid}>
                            <TextField label="Admin user name" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} placeholder={client.name || 'Client user name'} helperText="Leave blank to use the client user name." inputProps={{ ...manualEntryInputProps, maxLength: 120 }} />
                            <TextField label="Login email" required type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} helperText="The email this administrator will use to sign in." inputProps={{ ...manualEntryInputProps, maxLength: 254 }} />
                            <TextField select label="Role" value="admin" helperText="The client workspace is managed by an Administrator.">
                                <MenuItem value="admin">Administrator</MenuItem>
                            </TextField>
                            <TextField label="Password" required type={showPassword ? 'text' : 'password'} value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} helperText="Use at least 8 characters." inputProps={{ ...manualEntryInputProps, minLength: 8, maxLength: 128 }} InputProps={{ endAdornment: <InputAdornment position="end"><IconButton type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} edge="end">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</IconButton></InputAdornment> }} />
                            <SearchableSelect label="Country" required value={country?.code || ''} options={countries.map((item) => ({ value: item.code, label: item.name }))} disabled={saving || countriesLoading}
                                onChange={changeCountry} helperText={countriesLoading ? 'Loading countries…' : 'Search by country name.'} />
                            <SearchableSelect key={country?.code || 'no-country'} label="City" required value={city || ''} options={cityOptions} disabled={saving || !country || citiesLoading || Boolean(citiesError)}
                                onChange={setCity} helperText={!country ? 'Select a country first.' : citiesLoading ? `Loading cities in ${country.name}…` : `Search cities in ${country.name}.`} />
                        </Box>
                        {countriesError && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setCountryRetry((v) => v + 1)}>Retry</Button>}>{countriesError}</Alert>}
                        {citiesError && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setCityRetry((v) => v + 1)}>Retry</Button>}>{citiesError}</Alert>}
                    </Section>

                    <Section number="03" title="Branches" description="Optional. Add each branch with its own location, contact details, and administrator assignment.">
                        <Stack spacing={2}>
                            {branches.map((branch, index) => <Box key={branch.id} role="group" aria-label={`Branch ${index + 1}`} sx={{ p: { xs: 2, sm: 2.5 }, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                                    <Typography fontWeight={700}>Branch {index + 1}</Typography>
                                    <Button type="button" size="small" color="error" startIcon={<Trash2 size={15} />} aria-label={`Remove branch ${index + 1}`} disabled={saving}
                                        onClick={() => setBranches((current) => current.filter((item) => item.id !== branch.id))}>Remove</Button>
                                </Stack>
                                <Box sx={grid}>
                                    <TextField label="Branch name" required={branchHasDetails(branch)} value={branch.name} onChange={(event) => updateBranch(branch.id, { name: event.target.value })}
                                        helperText={branchHasDetails(branch) ? 'Required for a branch with other details.' : 'Leave this branch blank to skip it.'} inputProps={{ ...manualEntryInputProps, maxLength: 160 }} />
                                    <TextField label="Branch location / address" value={branch.location} onChange={(event) => updateBranch(branch.id, { location: event.target.value })} inputProps={{ ...manualEntryInputProps, maxLength: 500 }} />
                                    <TextField label="Branch phone number" type="tel" value={branch.phone} onChange={(event) => updateBranch(branch.id, { phone: cleanPhone(event.target.value) })} onBlur={() => touch(`branch-phone-${branch.id}`)}
                                        error={Boolean(visibleError(`branch-phone-${branch.id}`, phoneError(branch.phone)))} helperText={visibleError(`branch-phone-${branch.id}`, phoneError(branch.phone)) || 'Optional · 7–15 digits, with an optional leading +.'} inputProps={{ ...manualEntryInputProps, maxLength: 25 }} />
                                    <SearchableSelect key={`${branch.id}-${country?.code || 'no-country'}`} label="Branch city" value={branch.city} options={cityOptions} disabled={saving || !country || citiesLoading || Boolean(citiesError)}
                                        onChange={(value) => updateBranch(branch.id, { city: value })} helperText={!country ? 'Select the country above first.' : citiesLoading ? 'Loading cities…' : `Choose this branch's city in ${country.name}.`} />
                                    <TextField select label="Branch administrator" value={branch.bindAdmin ? 'new_admin' : 'unassigned'} disabled={saving}
                                        onChange={(event) => updateBranch(branch.id, { bindAdmin: event.target.value === 'new_admin' })}
                                        helperText="Assign the administrator created above. The same administrator can be assigned to multiple branches."
                                        sx={{ gridColumn: '1 / -1' }}>
                                        <MenuItem value="unassigned">Unassigned</MenuItem>
                                        <MenuItem value="new_admin">{adminOptionLabel}</MenuItem>
                                    </TextField>
                                </Box>
                            </Box>)}
                            {!branches.length && <Typography variant="body2" color="text.secondary">No branches added. A Main Branch is created automatically when Organization is first opened.</Typography>}
                            <Button type="button" variant="outlined" startIcon={<Plus size={17} />} disabled={saving || branches.length >= 50} onClick={() => setBranches((current) => [...current, newBranch()])} sx={{ alignSelf: 'flex-start' }}>Add Branch</Button>
                        </Stack>
                    </Section>

                    <Section number="04" title="Module permissions" description="Choose which modules this client's administrator can access.">
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1} sx={{ mb: 2 }}>
                            <Chip variant="outlined" icon={<ShieldCheck size={16} />} label={`${permissions.length} permissions selected`} sx={{ alignSelf: 'flex-start' }} />
                            <Stack direction="row" spacing={1}><Button onClick={() => setPermissions([...ALL_ADMIN_SCREEN_KEYS])}>Select all</Button><Button onClick={() => setPermissions([])}>Clear all</Button></Stack>
                        </Stack>
                        <ScreenPermissionPicker value={permissions} onChange={setPermissions} disabled={saving} />
                        {!permissions.length && <Alert severity="info" sx={{ mt: 2 }}>This administrator will have no module access until you assign permissions.</Alert>}
                    </Section>
                    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2}>
                            <Typography variant="body2" color="text.secondary">A separate business workspace and administrator login will be created.</Typography>
                            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}><Button onClick={() => navigate('/team')} disabled={saving}>Cancel</Button><Button type="submit" variant="contained" disabled={saving || typesLoading || Boolean(typesError) || !country || !city || citiesLoading || Boolean(citiesError)} startIcon={saving ? <CircularProgress size={17} color="inherit" /> : <Building2 size={17} />}>{saving ? 'Creating…' : 'Create Client'}</Button></Stack>
                        </Stack>
                    </Paper>
                </Stack>
            </Box>
        </Box>
    </Box>;
}
