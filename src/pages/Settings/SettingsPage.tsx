import React from 'react';
import axios from 'axios';
import {
    Box,
    Typography,
    Grid,
    Divider,
    Switch,
    FormControlLabel,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Button,
    Stack,
    Alert,
    Accordion,
    AccordionDetails,
    AccordionSummary,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Snackbar,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    alpha,
    useTheme
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Edit3, Trash2 } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setDarkMode } from '../../features/theme/themeSlice';
import {
    countryCurrencyMap,
    fetchSettings,
    saveSettings,
    setCountry,
    setCurrency,
    setLowStockAlertsEnabled,
    setOrderUpdatesEnabled,
    clearSettingsError,
    type CountryCode,
    type CurrencyCode,
    type AppSettings,
    DEFAULT_APP_SETTINGS
} from '../../features/settings/settingsSlice';
import type { AppDispatch } from '../../store';
import { prepareBannerDataUrl } from '../../lib/imageBanner';
import api from '../../api/axios';
import BusinessTypesManager from '../../components/Settings/BusinessTypesManager';
import CategoriesManager from '../../components/Settings/CategoriesManager';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { hasScreenAccess } from '../../lib/screenPermissions';

interface Business {
    id: string;
    name: string;
    slug: string;
    isLegacy?: boolean;
    userCount: number;
}

const getApiErrorMessage = (error: unknown, fallback: string) =>
    axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message || fallback
        : fallback;

const currencyOptions: Array<{ value: CurrencyCode; label: string }> = [
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
    { value: 'CHF', label: 'CHF - Swiss Franc' },
    { value: 'CDF', label: 'CDF - Congolese Franc (DRC)' },
    { value: 'XAF', label: 'XAF - Central African CFA Franc (Congo)' },
    { value: 'PKR', label: 'PKR - Pakistani Rupee' },
    { value: 'INR', label: 'INR - Indian Rupee' },
    { value: 'AED', label: 'AED - UAE Dirham' },
];

const countryOptions: Array<{ value: CountryCode; label: string }> = [
    { value: 'PK', label: 'Pakistan' },
    { value: 'US', label: 'United States' },
    { value: 'DE', label: 'Germany' },
    { value: 'GB', label: 'United Kingdom' },
    { value: 'CH', label: 'Switzerland' },
    { value: 'CD', label: 'DR Congo' },
    { value: 'CG', label: 'Congo' },
    { value: 'IN', label: 'India' },
    { value: 'AE', label: 'United Arab Emirates' },
];

const SettingsPage: React.FC = () => {
    const theme = useTheme();
    const location = useLocation();
    const dispatch = useDispatch<AppDispatch>();
    const { mode } = useSelector((state: RootState) => state.theme);
    const { user } = useSelector((state: RootState) => state.auth);
    const { notifications, country, currency, app, canManageDiscounts, canManageOrderTypes, loading, error } = useSelector((state: RootState) => state.settings);
    const activeAppSettings = app || DEFAULT_APP_SETTINGS;
    const [appDraft, setAppDraft] = React.useState<AppSettings>(activeAppSettings);
    const [bannerError, setBannerError] = React.useState<string | null>(null);
    const [invoiceLogoError, setInvoiceLogoError] = React.useState<string | null>(null);
    const [businesses, setBusinesses] = React.useState<Business[]>([]);
    const [businessesLoading, setBusinessesLoading] = React.useState(false);
    const [businessError, setBusinessError] = React.useState('');
    const [businessNotice, setBusinessNotice] = React.useState('');
    const [editingBusiness, setEditingBusiness] = React.useState<Business | null>(null);
    const [businessName, setBusinessName] = React.useState('');
    const [deletingBusiness, setDeletingBusiness] = React.useState<Business | null>(null);
    const [businessSaving, setBusinessSaving] = React.useState(false);
    const bannerInputRef = React.useRef<HTMLInputElement>(null);
    const invoiceLogoInputRef = React.useRef<HTMLInputElement>(null);
    // Admins own their workspace branding; the rest of the POS config stays super-admin only.
    const canEditBranding = user?.role === 'super_admin' || user?.role === 'admin';
    const canEditDiscounts = user?.role === 'super_admin' || canManageDiscounts;
    const canEditOrderTypes = user?.role === 'super_admin' || canManageOrderTypes;
    const premiumAccordionSx = {
        border: '1px solid',
        borderColor: alpha(theme.palette.primary.main, mode === 'dark' ? 0.26 : 0.18),
        borderRadius: '16px !important',
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.background.paper, mode === 'dark' ? 0.72 : 0.9),
        boxShadow: mode === 'dark' ? '0 16px 38px rgba(0, 0, 0, 0.18)' : '0 14px 30px rgba(15, 23, 42, 0.06)',
        '&::before': { display: 'none' },
        '&.Mui-expanded': { my: 0, borderColor: alpha(theme.palette.primary.main, mode === 'dark' ? 0.48 : 0.32) },
    };
    const premiumSummarySx = {
        px: { xs: 2, sm: 2.5 },
        minHeight: 76,
        '& .MuiAccordionSummary-content': { my: 1.25 },
        '& .MuiAccordionSummary-expandIconWrapper': {
            p: 0.65,
            borderRadius: 1.5,
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            color: 'primary.main',
        },
    };

    React.useEffect(() => {
        dispatch(fetchSettings());
    }, [dispatch]);

    React.useEffect(() => {
        setAppDraft(app || DEFAULT_APP_SETTINGS);
    }, [app]);

    const loadBusinesses = React.useCallback(async () => {
        if (user?.role !== 'super_admin') return;

        setBusinessesLoading(true);
        setBusinessError('');
        try {
            const response = await api.get<Business[]>('/users/businesses');
            setBusinesses(response.data || []);
        } catch (requestError) {
            setBusinessError(getApiErrorMessage(requestError, 'Businesses could not be loaded.'));
        } finally {
            setBusinessesLoading(false);
        }
    }, [user?.role]);

    React.useEffect(() => {
        loadBusinesses();
    }, [loadBusinesses]);

    const openBusinessEditor = (business: Business) => {
        setBusinessError('');
        setBusinessName(business.name);
        setEditingBusiness(business);
    };

    const saveBusiness = async () => {
        if (!editingBusiness) return;

        setBusinessSaving(true);
        setBusinessError('');
        try {
            await api.patch(`/users/businesses/${editingBusiness.id}`, { name: businessName });
            setEditingBusiness(null);
            await loadBusinesses();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setBusinessNotice('Business updated successfully.');
        } catch (requestError) {
            setBusinessError(getApiErrorMessage(requestError, 'Business could not be updated.'));
        } finally {
            setBusinessSaving(false);
        }
    };

    const deleteBusiness = async () => {
        if (!deletingBusiness) return;

        setBusinessSaving(true);
        setBusinessError('');
        try {
            const response = await api.delete<{ deletedUsers: number }>(`/users/businesses/${deletingBusiness.id}`);
            setDeletingBusiness(null);
            await loadBusinesses();
            window.dispatchEvent(new Event('itemhive-team-updated'));
            setBusinessNotice(`Business deleted. ${response.data.deletedUsers || 0} related user(s) were also deleted.`);
        } catch (requestError) {
            setBusinessError(getApiErrorMessage(requestError, 'Business could not be deleted.'));
        } finally {
            setBusinessSaving(false);
        }
    };

    const handleBannerFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setBannerError(null);
        try {
            const dataUrl = await prepareBannerDataUrl(file);
            setAppDraft((current) => ({ ...current, receiptBannerUrl: dataUrl }));
        } catch (error) {
            setBannerError(error instanceof Error ? error.message : 'That image could not be used as a banner.');
        }
    };

    const handleInvoiceLogoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setInvoiceLogoError(null);
        try {
            const dataUrl = await prepareBannerDataUrl(file);
            setAppDraft((current) => ({ ...current, invoiceLogoUrl: dataUrl }));
        } catch (error) {
            setInvoiceLogoError(error instanceof Error ? error.message : 'That image could not be used as an invoice logo.');
        }
    };

    const persistSettings = (
        nextCountry: CountryCode,
        nextCurrency: CurrencyCode,
        nextNotifications: typeof notifications,
        nextApp: AppSettings = activeAppSettings
    ) => {
        dispatch(saveSettings({
            country: nextCountry,
            currency: nextCurrency,
            notifications: nextNotifications,
            app: nextApp,
        }));
    };

    return (
        <Box>
            <Snackbar open={Boolean(businessNotice)} autoHideDuration={3200} onClose={() => setBusinessNotice('')} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
                <Alert severity="success" onClose={() => setBusinessNotice('')} sx={{ width: '100%' }}>{businessNotice}</Alert>
            </Snackbar>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight={800}>Settings</Typography>
                <Typography variant="body2" color="text.secondary">
                    Personalize your workspace and preferences.
                </Typography>
            </Box>

            <Grid container spacing={2.25}>
                {(user?.role === 'super_admin' || user?.role === 'admin') && hasScreenAccess(user, 'inventory_categories') && (
                    <Grid size={{ xs: 12 }}>
                        <Accordion id="categories" defaultExpanded={location.hash === '#categories'} disableGutters elevation={0} sx={premiumAccordionSx} slotProps={{ transition: { unmountOnExit: true } }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx} aria-controls="categories-content" id="categories-header">
                                <Box><Typography variant="h6" fontWeight={800}>Categories</Typography><Typography variant="body2" color="text.secondary">Add, edit and delete product categories for this workspace</Typography></Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
                                <CategoriesManager />
                            </AccordionDetails>
                        </Accordion>
                    </Grid>
                )}
                <Grid size={{ xs: 12 }}>
                    <Accordion disableGutters elevation={0} sx={premiumAccordionSx}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                            <Box><Typography variant="h6" fontWeight={800}>Payroll & Employee Requests</Typography><Typography variant="body2" color="text.secondary">Payroll setup, leave, loans and salary advances</Typography></Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
                            <Stack gap={2}>
                                {hasScreenAccess(user, 'payroll_view') && hasScreenAccess(user, 'payroll_settings') && (
                                    <>
                                        <Button component={RouterLink} to="/payroll?tab=settings" variant="contained">Open Payroll Settings</Button>
                                    </>
                                )}
                                <Button component={RouterLink} to="/my-payroll" variant="outlined">My Payroll & Requests</Button>
                                <Button component={RouterLink} to="/expenses" variant="outlined">Finance & Expenses</Button>
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                </Grid>
                <Grid size={{ xs: 12 }}>
                    <Accordion defaultExpanded disableGutters elevation={0} sx={premiumAccordionSx}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                            <Box><Typography variant="h6" fontWeight={800}>Regional</Typography><Typography variant="body2" color="text.secondary">Country, currency and personal preferences</Typography></Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
                            <Divider sx={{ mb: 2 }} />
                            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                <InputLabel
                                    id="country-select-label"
                                    sx={{
                                        fontWeight: 600,
                                        '&.Mui-focused': { color: 'primary.main' },
                                    }}
                                >
                                    Country
                                </InputLabel>
                                <Select
                                    labelId="country-select-label"
                                    value={country}
                                    label="Country"
                                    onChange={(e) => {
                                        const nextCountry = e.target.value as CountryCode;
                                        const nextCurrency = countryCurrencyMap[nextCountry];
                                        dispatch(setCountry(nextCountry));
                                        persistSettings(nextCountry, nextCurrency, notifications);
                                    }}
                                    sx={{
                                        fontWeight: 600,
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: alpha(theme.palette.primary.main, 0.25),
                                        },
                                        '&:hover .MuiOutlinedInput-notchedOutline': {
                                            borderColor: alpha(theme.palette.primary.main, 0.5),
                                        },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                            borderColor: 'primary.main',
                                            borderWidth: 2,
                                        },
                                    }}
                                    MenuProps={{
                                        PaperProps: {
                                            sx: {
                                                mt: 0.5,
                                                border: '1px solid',
                                                borderColor: 'divider',
                                                bgcolor: 'background.paper',
                                            },
                                        },
                                    }}
                                >
                                    {countryOptions.map((option) => (
                                        <MenuItem
                                            key={option.value}
                                            value={option.value}
                                            sx={{
                                                fontWeight: option.value === country ? 700 : 500,
                                                '&:hover': {
                                                    backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                                    color: 'primary.main',
                                                },
                                                '&.Mui-selected': {
                                                    backgroundColor: alpha(theme.palette.primary.main, 0.14),
                                                    color: 'primary.main',
                                                },
                                                '&.Mui-selected:hover': {
                                                    backgroundColor: alpha(theme.palette.primary.main, 0.2),
                                                },
                                            }}
                                        >
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl fullWidth size="small">
                                <InputLabel
                                    id="currency-select-label"
                                    sx={{
                                        fontWeight: 600,
                                        '&.Mui-focused': { color: 'primary.main' },
                                    }}
                                >
                                    Currency
                                </InputLabel>
                                <Select
                                    labelId="currency-select-label"
                                    value={currency}
                                    label="Currency"
                                    onChange={(e) => {
                                        const nextCurrency = e.target.value as CurrencyCode;
                                        dispatch(setCurrency(nextCurrency));
                                        persistSettings(country, nextCurrency, notifications);
                                    }}
                                    sx={{
                                        fontWeight: 600,
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: alpha(theme.palette.primary.main, 0.25),
                                        },
                                        '&:hover .MuiOutlinedInput-notchedOutline': {
                                            borderColor: alpha(theme.palette.primary.main, 0.5),
                                        },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                            borderColor: 'primary.main',
                                            borderWidth: 2,
                                        },
                                    }}
                                    MenuProps={{
                                        PaperProps: {
                                            sx: {
                                                mt: 0.5,
                                                border: '1px solid',
                                                borderColor: 'divider',
                                                bgcolor: 'background.paper',
                                            },
                                        },
                                    }}
                                >
                                    {currencyOptions.map((option) => (
                                        <MenuItem
                                            key={option.value}
                                            value={option.value}
                                            sx={{
                                                fontWeight: option.value === currency ? 700 : 500,
                                                '&:hover': {
                                                    backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                                    color: 'primary.main',
                                                },
                                                '&.Mui-selected': {
                                                    backgroundColor: alpha(theme.palette.primary.main, 0.14),
                                                    color: 'primary.main',
                                                },
                                                '&.Mui-selected:hover': {
                                                    backgroundColor: alpha(theme.palette.primary.main, 0.2),
                                                },
                                            }}
                                        >
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                                Default currency follows the selected country. Pakistan starts with PKR by default.
                            </Typography>
                            <Divider sx={{ my: 2 }} />
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 3 }}>
                                <FormControlLabel
                                    control={<Switch checked={mode === 'dark'} onChange={(e) => dispatch(setDarkMode(e.target.checked ? 'dark' : 'light'))} />}
                                    label="Dark mode"
                                />
                                <FormControlLabel
                                    control={<Switch checked={notifications.orderUpdates} onChange={(e) => {
                                        const nextNotifications = { ...notifications, orderUpdates: e.target.checked };
                                        dispatch(setOrderUpdatesEnabled(e.target.checked));
                                        persistSettings(country, currency, nextNotifications);
                                    }} />}
                                    label="Order updates"
                                />
                                <FormControlLabel
                                    control={<Switch checked={notifications.lowStockAlerts} onChange={(e) => {
                                        const nextNotifications = { ...notifications, lowStockAlerts: e.target.checked };
                                        dispatch(setLowStockAlertsEnabled(e.target.checked));
                                        persistSettings(country, currency, nextNotifications);
                                    }} />}
                                    label="Low stock alerts"
                                />
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                </Grid>

                {user?.role === 'super_admin' && (
                    <Grid size={{ xs: 12 }}>
                        <Accordion disableGutters elevation={0} sx={premiumAccordionSx}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                                <Box>
                                    <Typography variant="h6" fontWeight={700}>Business Management</Typography>
                                    <Typography variant="body2" color="text.secondary">{businesses.length} business workspace{businesses.length === 1 ? '' : 'es'}</Typography>
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: 2.5, pb: 2.5 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Rename or remove a workspace. Removing it also permanently deletes its admins and users.
                                </Typography>
                                {businessError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setBusinessError('')}>{businessError}</Alert>}
                                <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                                    <Table size="small" sx={{ minWidth: 620 }}>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Business</TableCell>
                                                <TableCell>Slug</TableCell>
                                                <TableCell align="center">Related Users</TableCell>
                                                <TableCell align="right">Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {businessesLoading && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 5 }}><CircularProgress size={28} /></TableCell></TableRow>}
                                            {!businessesLoading && businesses.map((business) => (
                                                <TableRow key={business.id} hover>
                                                    <TableCell><Typography variant="body2" fontWeight={700}>{business.name}{business.isLegacy ? ' (Default)' : ''}</Typography></TableCell>
                                                    <TableCell>{business.slug}</TableCell>
                                                    <TableCell align="center">{business.userCount}</TableCell>
                                                    <TableCell align="right">
                                                        {!business.isLegacy && <>
                                                            <IconButton aria-label={`Edit ${business.name}`} color="primary" onClick={() => openBusinessEditor(business)}><Edit3 size={18} /></IconButton>
                                                            <IconButton aria-label={`Delete ${business.name}`} color="error" onClick={() => setDeletingBusiness(business)}><Trash2 size={18} /></IconButton>
                                                        </>}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {!businessesLoading && !businesses.length && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 5 }}>No businesses found.</TableCell></TableRow>}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </AccordionDetails>
                        </Accordion>
                    </Grid>
                )}
                {user?.role === 'super_admin' && (
                    <Grid size={{ xs: 12 }}>
                        <Accordion disableGutters elevation={0} sx={premiumAccordionSx}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                                <Box><Typography variant="h6" fontWeight={700}>Business Types</Typography><Typography variant="body2" color="text.secondary">Manage the types available for your businesses</Typography></Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: 2.5, pb: 2.5 }}><BusinessTypesManager /></AccordionDetails>
                        </Accordion>
                    </Grid>
                )}
                {user?.role === 'super_admin' && (
                    <Grid size={{ xs: 12 }}>
                        <Accordion disableGutters elevation={0} sx={premiumAccordionSx}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                                <Box><Typography fontWeight={700}>Registration</Typography><Typography variant="caption" color="text.secondary">Public signup access</Typography></Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Divider sx={{ mb: 2 }} />
                                <Stack spacing={1.5}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={appDraft.autoRegistrationEnabled}
                                                onChange={(event) => setAppDraft({ ...appDraft, autoRegistrationEnabled: event.target.checked })}
                                            />
                                        }
                                        label="Auto-register new accounts"
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        {appDraft.autoRegistrationEnabled
                                            ? 'New users get their workspace immediately.'
                                            : 'New signups are sent to Signup Requests for super admin approval.'}
                                    </Typography>
                                    <Divider />
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={appDraft.basicCustomizationOfferEnabled}
                                                onChange={(event) => setAppDraft({ ...appDraft, basicCustomizationOfferEnabled: event.target.checked })}
                                            />
                                        }
                                        label="Show Basic customization offer on pricing"
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        When enabled, visitors see a corner offer that Basic-plan clients can request customization.
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        onClick={() => persistSettings(country, currency, notifications, appDraft)}
                                        disabled={loading}
                                    >
                                        Save Registration & Offer Settings
                                    </Button>
                                </Stack>
                            </AccordionDetails>
                        </Accordion>
                    </Grid>
                )}

                {canEditDiscounts && (
                    <Grid size={{ xs: 12 }}>
                        <Accordion disableGutters elevation={0} sx={premiumAccordionSx}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                                <Box><Typography fontWeight={700}>Discount Controls</Typography><Typography variant="caption" color="text.secondary">Manage the discounts available in your POS</Typography></Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Divider sx={{ mb: 2 }} />
                                <Stack spacing={2}>
                                    {user?.role === 'super_admin' && <>
                                        <TextField
                                            size="small"
                                            label="Sales Tax %"
                                            type="number"
                                            value={appDraft.salesTaxRate}
                                            onChange={(event) => setAppDraft({ ...appDraft, salesTaxRate: Number(event.target.value) })}
                                            inputProps={{ min: 0, max: 100, step: 0.01 }}
                                        />
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={appDraft.installmentsEnabled}
                                                    onChange={(event) => setAppDraft({ ...appDraft, installmentsEnabled: event.target.checked })}
                                                />
                                            }
                                            label="Enable installments for permitted accounts"
                                        />
                                    </>}
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={appDraft.discountsEnabled}
                                                onChange={(event) => setAppDraft({ ...appDraft, discountsEnabled: event.target.checked })}
                                            />
                                        }
                                        label="Enable percentage discounts in POS"
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        When enabled, cashiers choose only from the discount percentages configured below.
                                    </Typography>
                                    {appDraft.discountsEnabled && (
                                        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                                            <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Box>
                                                    <Typography variant="subtitle2" fontWeight={800}>Discount options</Typography>
                                                    <Typography variant="caption" color="text.secondary">Add the percentages cashiers may select in POS.</Typography>
                                                </Box>
                                                <Button
                                                    size="small"
                                                    onClick={() => setAppDraft({ ...appDraft, discountOptions: [...appDraft.discountOptions, 5] })}
                                                >
                                                    Add row
                                                </Button>
                                            </Box>
                                            <Table size="small">
                                                <TableHead><TableRow><TableCell>Discount %</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
                                                <TableBody>
                                                    {appDraft.discountOptions.map((option, index) => (
                                                        <TableRow key={`${option}-${index}`}>
                                                            <TableCell>
                                                                <TextField
                                                                    size="small"
                                                                    type="number"
                                                                    value={option}
                                                                    onChange={(event) => {
                                                                        const discountOptions = [...appDraft.discountOptions];
                                                                        discountOptions[index] = Number(event.target.value || 0);
                                                                        setAppDraft({ ...appDraft, discountOptions });
                                                                    }}
                                                                    inputProps={{ min: 0.01, max: 100, step: 0.01 }}
                                                                    InputProps={{ endAdornment: <Typography variant="body2">%</Typography> }}
                                                                />
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Button color="error" size="small" onClick={() => setAppDraft({ ...appDraft, discountOptions: appDraft.discountOptions.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {appDraft.discountOptions.length === 0 && (
                                                        <TableRow><TableCell colSpan={2} align="center"><Typography variant="caption" color="text.secondary">No options added yet. Add a row to make discounts available in POS.</Typography></TableCell></TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </Box>
                                    )}
                                    <Typography variant="caption" color="text.secondary">
                                        {user?.role === 'super_admin'
                                            ? 'Super admin always keeps access. Enable this switch before granting installment access to selected accounts in Team Management.'
                                            : 'These discount options will be available to users in your business workspace.'}
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        onClick={() => persistSettings(country, currency, notifications, appDraft)}
                                        disabled={loading}
                                    >
                                        Save Discount Settings
                                    </Button>
                                </Stack>
                            </AccordionDetails>
                        </Accordion>
                    </Grid>
                )}

                {canEditOrderTypes && appDraft.restaurantEnabled && (
                    <Grid size={{ xs: 12 }}>
                        <Accordion disableGutters elevation={0} sx={premiumAccordionSx}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                                <Box><Typography fontWeight={700}>Restaurant / KOT Order Types</Typography><Typography variant="caption" color="text.secondary">Manage the choices shown in your POS order-type dropdown</Typography></Box>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Divider sx={{ mb: 2 }} />
                                <Stack spacing={2}>
                                    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                                        <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={800}>Order type options</Typography>
                                                <Typography variant="caption" color="text.secondary">Add the names cashiers may select in POS.</Typography>
                                            </Box>
                                            <Button size="small" onClick={() => setAppDraft({ ...appDraft, orderTypeOptions: [...appDraft.orderTypeOptions, ''] })}>Add row</Button>
                                        </Box>
                                        <Table size="small">
                                            <TableHead><TableRow><TableCell sx={{ width: 110 }}>Sequence</TableCell><TableCell>Order type name</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
                                            <TableBody>
                                                {appDraft.orderTypeOptions.map((option, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell>
                                                            <TextField
                                                                size="small"
                                                                type="number"
                                                                value={index + 1}
                                                                inputProps={{ min: 1, max: appDraft.orderTypeOptions.length, step: 1 }}
                                                                onChange={(event) => {
                                                                    const requestedSequence = Math.min(Math.max(Number(event.target.value || index + 1), 1), appDraft.orderTypeOptions.length);
                                                                    const orderTypeOptions = [...appDraft.orderTypeOptions];
                                                                    const [movedOption] = orderTypeOptions.splice(index, 1);
                                                                    orderTypeOptions.splice(requestedSequence - 1, 0, movedOption);
                                                                    setAppDraft({ ...appDraft, orderTypeOptions });
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <TextField
                                                                size="small"
                                                                fullWidth
                                                                value={option}
                                                                placeholder="e.g. Delivery"
                                                                inputProps={{ maxLength: 80 }}
                                                                onChange={(event) => {
                                                                    const orderTypeOptions = [...appDraft.orderTypeOptions];
                                                                    orderTypeOptions[index] = event.target.value;
                                                                    setAppDraft({ ...appDraft, orderTypeOptions });
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right"><Button color="error" size="small" onClick={() => setAppDraft({ ...appDraft, orderTypeOptions: appDraft.orderTypeOptions.filter((_, itemIndex) => itemIndex !== index) })}>Remove</Button></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">These options apply to every POS user in this workspace.</Typography>
                                    <Button variant="contained" onClick={() => persistSettings(country, currency, notifications, appDraft)} disabled={loading}>Save Order Types</Button>
                                </Stack>
                            </AccordionDetails>
                        </Accordion>
                    </Grid>
                )}

                {canEditBranding && (
                    <Grid size={{ xs: 12 }}>
                        <Accordion disableGutters elevation={0} sx={premiumAccordionSx}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={premiumSummarySx}>
                                <Box><Typography variant="h6" fontWeight={800}>Invoice & Receipt Branding</Typography><Typography variant="body2" color="text.secondary">Shop identity, receipt banner and invoice logo</Typography></Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    The banner prints at the top of receipts, order invoices, transaction invoices and stock slips.
                                    PNG, JPEG, WEBP or SVG; wide images work best.
                                </Typography>
                                <Divider sx={{ mb: 2 }} />

                                <Stack spacing={2} sx={{ mb: 2 }}>
                                    <TextField
                                        size="small"
                                        label="Shop Name"
                                        helperText="Printed beside the banner, e.g. HASSAN TRADERS"
                                        value={appDraft.shopName}
                                        onChange={(event) => setAppDraft({ ...appDraft, shopName: event.target.value })}
                                    />
                                    <TextField
                                        size="small"
                                        label="Shop Address"
                                        helperText="One line per row"
                                        value={appDraft.shopAddress}
                                        onChange={(event) => setAppDraft({ ...appDraft, shopAddress: event.target.value })}
                                        multiline
                                        rows={2}
                                    />
                                    <TextField
                                        size="small"
                                        label="Shop Phone"
                                        helperText="One contact per line, e.g. Tariq Shah : 0315-0808002"
                                        value={appDraft.shopPhone}
                                        onChange={(event) => setAppDraft({ ...appDraft, shopPhone: event.target.value })}
                                        multiline
                                        rows={2}
                                    />
                                </Stack>

                                <Box
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 2,
                                        border: '1px dashed',
                                        borderColor: alpha(theme.palette.primary.main, 0.35),
                                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                                        textAlign: 'center',
                                    }}
                                >
                                    {appDraft.receiptBannerUrl ? (
                                        <Box
                                            component="img"
                                            src={appDraft.receiptBannerUrl}
                                            alt="Receipt banner preview"
                                            sx={{ display: 'block', mx: 'auto', maxWidth: '100%', maxHeight: 96, objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            No banner uploaded yet.
                                        </Typography>
                                    )}
                                </Box>

                                {bannerError && (
                                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                                        {bannerError}
                                    </Typography>
                                )}

                                {error && (
                                    <Alert severity="error" sx={{ mt: 2 }} onClose={() => dispatch(clearSettingsError())}>
                                        {error}
                                    </Alert>
                                )}

                                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                                    <Button variant="outlined" onClick={() => bannerInputRef.current?.click()}>
                                        {appDraft.receiptBannerUrl ? 'Replace Banner' : 'Upload Banner'}
                                    </Button>
                                    {appDraft.receiptBannerUrl && (
                                        <Button
                                            color="error"
                                            onClick={() => {
                                                setBannerError(null);
                                                setAppDraft({ ...appDraft, receiptBannerUrl: '' });
                                            }}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </Stack>
                                <input
                                    ref={bannerInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    style={{ display: 'none' }}
                                    onChange={handleBannerFileChange}
                                />

                                <Divider sx={{ my: 3 }} />
                                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>
                                    Invoice Logo
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Used on invoices and invoice PDFs. When empty, the receipt banner is used.
                                </Typography>
                                <Box
                                    sx={{
                                        p: 1.5,
                                        minHeight: 112,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 2,
                                        border: '1px dashed',
                                        borderColor: alpha(theme.palette.primary.main, 0.35),
                                        bgcolor: alpha(theme.palette.primary.main, 0.04),
                                    }}
                                >
                                    {appDraft.invoiceLogoUrl ? (
                                        <Box
                                            component="img"
                                            src={appDraft.invoiceLogoUrl}
                                            alt="Invoice logo preview"
                                            sx={{ display: 'block', maxWidth: '100%', maxHeight: 88, objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            Using the receipt banner.
                                        </Typography>
                                    )}
                                </Box>
                                {invoiceLogoError && (
                                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                                        {invoiceLogoError}
                                    </Typography>
                                )}
                                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                                    <Button variant="outlined" onClick={() => invoiceLogoInputRef.current?.click()}>
                                        {appDraft.invoiceLogoUrl ? 'Replace Logo' : 'Upload Logo'}
                                    </Button>
                                    {appDraft.invoiceLogoUrl && (
                                        <Button
                                            color="error"
                                            onClick={() => {
                                                setInvoiceLogoError(null);
                                                setAppDraft({ ...appDraft, invoiceLogoUrl: '' });
                                            }}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained"
                                        sx={{ ml: 'auto' }}
                                        onClick={() => persistSettings(country, currency, notifications, appDraft)}
                                        disabled={loading}
                                    >
                                        {loading ? 'Saving...' : 'Save Branding'}
                                    </Button>
                                </Stack>
                                <input
                                    ref={invoiceLogoInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    style={{ display: 'none' }}
                                    onChange={handleInvoiceLogoFileChange}
                                />
                            </AccordionDetails>
                        </Accordion>
                    </Grid>
                )}

            </Grid>

            <Dialog open={Boolean(editingBusiness)} onClose={() => !businessSaving && setEditingBusiness(null)} fullWidth maxWidth="xs">
                <DialogTitle>Edit Business</DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth label="Business Name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} sx={{ mt: 1 }} disabled={businessSaving} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingBusiness(null)} disabled={businessSaving}>Cancel</Button>
                    <Button variant="contained" onClick={saveBusiness} disabled={businessSaving || businessName.trim().length < 2}>{businessSaving ? 'Saving...' : 'Save Changes'}</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(deletingBusiness)} onClose={() => !businessSaving && setDeletingBusiness(null)} fullWidth maxWidth="xs">
                <DialogTitle>Delete Business?</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>This action cannot be undone.</Alert>
                    <Typography variant="body2" color="text.secondary">
                        Are you sure you want to delete <strong>{deletingBusiness?.name}</strong>? All {deletingBusiness?.userCount || 0} related users, including admins, will also be permanently deleted.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeletingBusiness(null)} disabled={businessSaving}>No</Button>
                    <Button color="error" variant="contained" onClick={deleteBusiness} disabled={businessSaving}>{businessSaving ? 'Deleting...' : 'Yes, Delete'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SettingsPage;
