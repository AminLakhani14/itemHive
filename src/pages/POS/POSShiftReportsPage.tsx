import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    Pagination,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
    alpha,
} from '@mui/material';
import { FileDown, LockKeyhole, Play, Printer, ReceiptText, RefreshCw, Search, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import api from '../../api/axios';
import type { RootState } from '../../store';
import useAppCurrency from '../../hooks/useAppCurrency';
import { DEFAULT_APP_SETTINGS } from '../../features/settings/settingsSlice';
import { hasInstallmentAccess } from '../../lib/screenPermissions';
import { printElement } from '../../lib/printReceipt';
import { shiftReportPrintCss } from '../../lib/shiftReportPrintCss';
import { downloadShiftReportPdf } from '../../lib/shiftReportPdf';
import type { POSShift, ShiftReport, ShiftReportTotals } from '../../types/posShift';
import { selectPrintSettings } from '../../features/branch/branchSlice';

interface ShiftHistoryResponse {
    items: POSShift[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const getErrorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const paymentMethodLabel = (method: string) => ({
    cash: 'Cash',
    card: 'Card',
    credit: 'Credit',
    installment: 'Installment',
}[method] || method);

const orderTypeLabel = (type: string) => ({
    dine_in: 'Dine In',
    takeaway: 'Takeaway',
    foodpanda: 'Foodpanda',
    'Not specified': 'Not Specified',
}[type] || type);

const getTotalCollected = (totals: ShiftReportTotals) => totals.totalCollected ?? (
    totals.cashSales
    + totals.cardSales
    + totals.creditCashReceived
    + totals.creditCardReceived
    + totals.creditCollectionsCash
    + totals.creditCollectionsCard
    + totals.installmentCashAdvance
    + totals.installmentCardAdvance
    + totals.installmentCollectionsCash
    + totals.installmentCollectionsCard
);

const POSShiftReportsPage: React.FC = () => {
    const { formatCurrency: formatUserCurrency } = useAppCurrency();
    const { user } = useSelector((state: RootState) => state.auth);
    const app = useSelector(selectPrintSettings);
    const appSettings = app || DEFAULT_APP_SETTINGS;
    const canAccessInstallments = hasInstallmentAccess(user, appSettings.installmentsEnabled);
    const [currentShift, setCurrentShift] = React.useState<POSShift | null>(null);
    const [history, setHistory] = React.useState<POSShift[]>([]);
    const [liveReport, setLiveReport] = React.useState<ShiftReport | null>(null);
    const [displayReport, setDisplayReport] = React.useState<ShiftReport | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [printing, setPrinting] = React.useState(false);
    const [error, setError] = React.useState('');
    const [registerName, setRegisterName] = React.useState('Main Counter');
    const [openingCash, setOpeningCash] = React.useState('0');
    const [closeOpen, setCloseOpen] = React.useState(false);
    const [countedCash, setCountedCash] = React.useState('');
    const [sectionTab, setSectionTab] = React.useState(0);
    const [historySearch, setHistorySearch] = React.useState('');
    const [historyFrom, setHistoryFrom] = React.useState('');
    const [historyTo, setHistoryTo] = React.useState('');
    const [historyQuery, setHistoryQuery] = React.useState({ search: '', from: '', to: '', page: 1 });
    const [historyTotal, setHistoryTotal] = React.useState(0);
    const [historyTotalPages, setHistoryTotalPages] = React.useState(1);
    const [downloadingShiftCode, setDownloadingShiftCode] = React.useState('');

    const formatCurrency = (value: number) => {
        const currency = displayReport?.currency || liveReport?.currency || currentShift?.currency;
        return currency ? new Intl.NumberFormat('en', { style: 'currency', currency }).format(value) : formatUserCurrency(value);
    };

    const loadData = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [currentResponse, historyResponse] = await Promise.all([
                api.get<{ shift: POSShift | null }>('/pos-shifts/current'),
                api.get<ShiftHistoryResponse>('/pos-shifts/history', {
                    params: {
                        page: historyQuery.page,
                        limit: 12,
                        search: historyQuery.search || undefined,
                        from: historyQuery.from ? new Date(`${historyQuery.from}T00:00:00.000`).toISOString() : undefined,
                        to: historyQuery.to ? new Date(`${historyQuery.to}T23:59:59.999`).toISOString() : undefined,
                    },
                }),
            ]);
            setCurrentShift(currentResponse.data.shift);
            setHistory(historyResponse.data.items);
            setHistoryTotal(historyResponse.data.total);
            setHistoryTotalPages(historyResponse.data.totalPages);
            if (currentResponse.data.shift) {
                const reportResponse = await api.get<{ report: ShiftReport }>('/pos-shifts/x-report');
                setLiveReport(reportResponse.data.report);
            } else {
                setLiveReport(null);
            }
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'POS shift information could not be loaded.'));
        } finally {
            setLoading(false);
        }
    }, [historyQuery]);

    React.useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleOpenShift = async () => {
        const openingAmount = Number(openingCash);
        if (!registerName.trim() || !Number.isFinite(openingAmount) || openingAmount < 0) {
            setError('Enter a register name and a valid opening cash amount.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const response = await api.post<{ shift: POSShift }>('/pos-shifts/open', { registerName: registerName.trim(), openingCash: openingAmount });
            setCurrentShift(response.data.shift);
            window.dispatchEvent(new Event('itemhive-pos-shift-changed'));
            await loadData();
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'Shift could not be opened.'));
        } finally {
            setBusy(false);
        }
    };

    const handleXReport = async () => {
        setBusy(true);
        setError('');
        try {
            const response = await api.get<{ report: ShiftReport }>('/pos-shifts/x-report');
            setLiveReport(response.data.report);
            setDisplayReport(response.data.report);
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'Live Shift Summary could not be generated.'));
        } finally {
            setBusy(false);
        }
    };

    const handleCloseShift = async () => {
        const countedAmount = Number(countedCash);
        if (!Number.isFinite(countedAmount) || countedAmount < 0) {
            setError('Enter a valid counted cash amount.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const response = await api.post<{ shift: POSShift; report: ShiftReport }>('/pos-shifts/close', { countedCash: countedAmount });
            setDisplayReport(response.data.report);
            setCloseOpen(false);
            setCountedCash('');
            setCurrentShift(null);
            setLiveReport(null);
            setHistoryQuery((current) => ({ ...current, page: 1 }));
            window.dispatchEvent(new Event('itemhive-pos-shift-changed'));
            await loadData();
        } catch (requestError: unknown) {
            setError(getErrorMessage(requestError, 'Shift could not be closed.'));
        } finally {
            setBusy(false);
        }
    };

    const handlePrint = async () => {
        const receipt = document.getElementById('shift-report-receipt');
        if (!receipt || printing) return;
        setPrinting(true);
        try {
            await printElement(receipt, shiftReportPrintCss(), 80);
        } catch {
            setError('The Shift Closing Report could not be prepared for printing.');
        } finally {
            setPrinting(false);
        }
    };

    const handleApplyHistoryFilters = () => {
        if (historyFrom && historyTo && historyFrom > historyTo) {
            setError('The history From date cannot be after the To date.');
            return;
        }
        setError('');
        setHistoryQuery({ search: historySearch.trim(), from: historyFrom, to: historyTo, page: 1 });
    };

    const handleClearHistoryFilters = () => {
        setHistorySearch('');
        setHistoryFrom('');
        setHistoryTo('');
        setHistoryQuery({ search: '', from: '', to: '', page: 1 });
    };

    const handleDownloadReport = async (report: ShiftReport) => {
        if (downloadingShiftCode) return;
        setDownloadingShiftCode(report.shiftCode);
        setError('');
        try {
            await downloadShiftReportPdf({
                report,
                shopName: appSettings.shopName || 'Ozor',
                shopAddress: appSettings.shopAddress,
                shopPhone: appSettings.shopPhone,
                formatCurrency,
                includeInstallments: canAccessInstallments,
            });
        } catch {
            setError('The Shift Closing Report PDF could not be downloaded.');
        } finally {
            setDownloadingShiftCode('');
        }
    };

    const differenceLabel = (totals: ShiftReportTotals) => {
        const difference = Number(totals.cashDifference || 0);
        if (difference > 0) return `Over ${formatCurrency(difference)}`;
        if (difference < 0) return `Short ${formatCurrency(Math.abs(difference))}`;
        return 'Balanced';
    };

    if (loading) return <Box sx={{ minHeight: 400, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;

    return (
        <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
                <Box>
                    <Typography variant="overline" color="primary.main" fontWeight={900} letterSpacing={1.1}>POS OPERATIONS</Typography>
                    <Typography variant="h4" fontWeight={900} lineHeight={1.15}>Shift Management</Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.5 }}>Open the cashier shift, monitor live totals, then finalize a Shift Closing Report.</Typography>
                </Box>
                <Chip
                    color={currentShift ? 'success' : 'default'}
                    label={currentShift ? `${currentShift.shiftCode} · OPEN` : 'NO ACTIVE SHIFT'}
                    sx={{ fontWeight: 900, px: 0.75 }}
                />
            </Stack>

            <Card variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: { xs: 1.5, sm: 2.5 }, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Tabs value={sectionTab} onChange={(_, value) => setSectionTab(value)}>
                        <Tab label="Current Shift" sx={{ fontWeight: 800, minHeight: 58 }} />
                        <Tab label={`Closing Reports (${historyTotal})`} sx={{ fontWeight: 800, minHeight: 58 }} />
                    </Tabs>
                    <Button size="small" color="inherit" startIcon={<RefreshCw size={16} />} onClick={loadData}>Refresh</Button>
                </Stack>

                {error && <Alert severity="error" onClose={() => setError('')} sx={{ m: 2, mb: 0 }}>{error}</Alert>}

                {sectionTab === 0 && (
                    <Box sx={{ p: { xs: 2, md: 3 } }}>
                        {!currentShift ? (
                            <Grid container sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', minHeight: 330 }}>
                                <Grid size={{ xs: 12, md: 5 }} sx={{ p: { xs: 2.5, md: 4 }, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.07), display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Box sx={{ width: 50, height: 50, borderRadius: 2.5, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', mb: 2.5 }}><Play size={24} /></Box>
                                        <Typography variant="h5" fontWeight={900}>Start the cashier session</Typography>
                                        <Typography color="text.secondary" sx={{ mt: 1 }}>Opening cash becomes the starting drawer balance. POS payments unlock after the shift opens.</Typography>
                                    </Box>
                                    <Stack spacing={1.1} sx={{ mt: 3 }}>
                                        {['Open shift', 'Take payments & preview summary', 'Count cash & finalize report'].map((step, index) => (
                                            <Stack key={step} direction="row" spacing={1.25} alignItems="center">
                                                <Box sx={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid', borderColor: 'primary.main', color: 'primary.main', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900 }}>{index + 1}</Box>
                                                <Typography variant="body2" fontWeight={700}>{step}</Typography>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </Grid>
                                <Grid size={{ xs: 12, md: 7 }} sx={{ p: { xs: 2.5, md: 4 }, display: 'flex', alignItems: 'center' }}>
                                    <Box sx={{ width: '100%', maxWidth: 520, mx: 'auto' }}>
                                        <Typography variant="h6" fontWeight={900}>Opening details</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Confirm the physical cash currently available in this drawer.</Typography>
                                        <Stack spacing={2}>
                                            <TextField fullWidth label="Register / Counter" value={registerName} onChange={(event) => setRegisterName(event.target.value)} inputProps={{ maxLength: 80 }} />
                                            <TextField fullWidth label="Opening Cash" type="number" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputProps={{ min: 0, step: 0.01 }} />
                                            <Button size="large" variant="contained" startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <Play size={19} />} disabled={busy} onClick={handleOpenShift} sx={{ py: 1.25, fontWeight: 900 }}>
                                                {busy ? 'Opening Shift...' : 'Open POS Shift'}
                                            </Button>
                                        </Stack>
                                    </Box>
                                </Grid>
                            </Grid>
                        ) : (
                            <Stack spacing={2.5}>
                                <Box sx={{ p: { xs: 2.5, md: 3 }, border: '1px solid', borderColor: 'divider', borderLeft: '5px solid', borderLeftColor: 'success.main', borderRadius: 3 }}>
                                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                                        <Box>
                                            <Stack direction="row" spacing={1} alignItems="center"><Chip label="LIVE" size="small" color="success" sx={{ fontWeight: 900 }} /><Typography variant="h5" fontWeight={900}>{currentShift.shiftCode}</Typography></Stack>
                                            <Typography fontWeight={700} sx={{ mt: 1 }}>{currentShift.registerName} · {currentShift.openedByName}</Typography>
                                            <Typography variant="body2" color="text.secondary">Opened {new Date(currentShift.openedAt).toLocaleString()}</Typography>
                                        </Box>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignSelf={{ md: 'center' }}>
                                            <Button variant="contained" startIcon={<ReceiptText size={18} />} onClick={handleXReport} disabled={busy} sx={{ fontWeight: 900 }}>Preview Live Summary</Button>
                                            <Button color="error" variant="outlined" startIcon={<LockKeyhole size={18} />} onClick={() => { setCountedCash(String(liveReport?.totals.expectedDrawerCash ?? '')); setCloseOpen(true); }} disabled={busy} sx={{ fontWeight: 900 }}>Close Shift</Button>
                                        </Stack>
                                    </Stack>
                                </Box>
                                <Button component={RouterLink} to="/expenses" sx={{ alignSelf: "flex-start" }}>Expenses</Button>
                                {liveReport && <Grid container spacing={1.5}>
                                    {[
                                        ['Net Sales', formatCurrency(liveReport.totals.netSales)],
                                        ['Expected Drawer', formatCurrency(liveReport.totals.expectedDrawerCash)],
                                        ['Expense Paid Out', formatCurrency(liveReport.totals.expensePaidOut || 0)],
                                        ['Expense Refunds', formatCurrency(liveReport.totals.expenseRefunds || 0)],
                                        ['Orders', String(liveReport.totals.completedOrders)],
                                        ['Items Sold', String(liveReport.totals.itemsSold)],
                                    ].map(([label, value], index) => <Grid key={label} size={{ xs: 6, md: 3 }}><Box sx={{ p: 2, borderRadius: 2.5, bgcolor: index < 2 ? (theme) => alpha(theme.palette.primary.main, 0.07) : 'action.hover', minHeight: 88 }}><Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography><Typography variant="h6" fontWeight={900} sx={{ mt: 0.5 }}>{value}</Typography></Box></Grid>)}
                                </Grid>}
                            </Stack>
                        )}
                    </Box>
                )}

                {sectionTab === 1 && (
                    <Box sx={{ p: { xs: 2, md: 3 } }}>
                        <Box sx={{ mb: 2.5 }}><Typography variant="h6" fontWeight={900}>Shift closing reports</Typography><Typography variant="body2" color="text.secondary">Find reports by date, shift, register, or cashier and download them as PDF.</Typography></Box>
                        <Box sx={{ p: 2, mb: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'action.hover' }}>
                            <Grid container spacing={1.5} alignItems="center">
                                <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth size="small" label="Shift, register, or cashier" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleApplyHistoryFilters(); }} InputProps={{ startAdornment: <Search size={17} style={{ marginRight: 8 }} /> }} /></Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 2.5 }}><TextField fullWidth size="small" type="date" label="From" value={historyFrom} onChange={(event) => setHistoryFrom(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 2.5 }}><TextField fullWidth size="small" type="date" label="To" value={historyTo} onChange={(event) => setHistoryTo(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                                <Grid size={{ xs: 12, md: 3 }}><Stack direction="row" spacing={1}><Button fullWidth variant="contained" onClick={handleApplyHistoryFilters} startIcon={<Search size={16} />}>Find Reports</Button><Button variant="outlined" color="inherit" aria-label="Clear report filters" onClick={handleClearHistoryFilters} sx={{ minWidth: 42, px: 1 }}><X size={17} /></Button></Stack></Grid>
                            </Grid>
                        </Box>
                        {history.length === 0 ? (
                            <Box sx={{ borderRadius: 3, p: 6, textAlign: 'center', bgcolor: 'action.hover' }}><ReceiptText size={34} opacity={0.35} /><Typography fontWeight={800} sx={{ mt: 1 }}>No matching closing reports</Typography><Typography variant="body2" color="text.secondary">Try another date range or clear the filters.</Typography></Box>
                        ) : (
                            <Grid container spacing={2}>
                                {history.map((shift) => <Grid key={shift._id} size={{ xs: 12, md: 6 }}>
                                    <Card variant="outlined" sx={{ borderRadius: 2.5, height: '100%' }}><CardContent>
                                        <Stack direction="row" justifyContent="space-between"><Box><Typography fontWeight={900}>{shift.shiftCode}</Typography><Typography variant="caption" color="text.secondary">{shift.registerName} · {shift.closedByName || shift.openedByName}</Typography></Box><Chip label="FINALIZED" size="small" /></Stack>
                                        <Divider sx={{ my: 2 }} />
                                        <Grid container spacing={1.5}>
                                            <Grid size={6}><Typography variant="caption" color="text.secondary">Net sales</Typography><Typography fontWeight={900}>{formatCurrency(shift.finalReport?.totals.netSales || 0)}</Typography></Grid>
                                            <Grid size={6}><Typography variant="caption" color="text.secondary">Cash result</Typography><Typography fontWeight={900}>{shift.finalReport ? differenceLabel(shift.finalReport.totals) : '-'}</Typography></Grid>
                                        </Grid>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>{shift.closedAt ? `Closed ${new Date(shift.closedAt).toLocaleString()}` : ''}</Typography>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                                            <Button fullWidth variant="outlined" startIcon={<Printer size={17} />} disabled={!shift.finalReport} onClick={() => setDisplayReport(shift.finalReport || null)} sx={{ fontWeight: 800 }}>View / Reprint</Button>
                                            <Button fullWidth variant="contained" startIcon={downloadingShiftCode === shift.shiftCode ? <CircularProgress size={16} color="inherit" /> : <FileDown size={17} />} disabled={!shift.finalReport || Boolean(downloadingShiftCode)} onClick={() => shift.finalReport && void handleDownloadReport(shift.finalReport)} sx={{ fontWeight: 800 }}>{downloadingShiftCode === shift.shiftCode ? 'Preparing...' : 'Download PDF'}</Button>
                                        </Stack>
                                    </CardContent></Card>
                                </Grid>)}
                            </Grid>
                        )}
                        {historyTotalPages > 1 && <Stack alignItems="center" spacing={1} sx={{ mt: 3 }}><Pagination page={historyQuery.page} count={historyTotalPages} color="primary" onChange={(_, page) => setHistoryQuery((current) => ({ ...current, page }))} /><Typography variant="caption" color="text.secondary">{historyTotal} reports found</Typography></Stack>}
                    </Box>
                )}
            </Card>

            <Dialog open={closeOpen} onClose={busy ? undefined : () => setCloseOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={900}>Close Shift and Finalize Report</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>Closing is final. New POS payments will require a new shift.</Alert>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Expected drawer cash</Typography>
                    <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>{formatCurrency(liveReport?.totals.expectedDrawerCash || currentShift?.openingCash || 0)}</Typography>
                    <TextField autoFocus fullWidth label="Actual Counted Cash" type="number" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} inputProps={{ min: 0, step: 0.01 }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCloseOpen(false)} disabled={busy}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={handleCloseShift} disabled={busy} startIcon={busy ? <CircularProgress size={17} color="inherit" /> : <LockKeyhole size={17} />}>{busy ? 'Closing...' : 'Close & Finalize'}</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(displayReport)} onClose={printing ? undefined : () => setDisplayReport(null)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={900}>{displayReport?.status === 'closed' ? 'Shift Closing Report' : 'Live Shift Summary'} Preview</DialogTitle>
                <DialogContent>
                    {displayReport && <Box id="shift-report-receipt" sx={{ bgcolor: '#fff', color: '#000', px: 2, py: 2.5, fontFamily: 'monospace', border: '1px dashed #999' }}>
                        <Typography className="shift-report-brand" align="center" fontWeight={900} fontSize={18}>{appSettings.shopName || 'Ozor'}</Typography>
                        {appSettings.shopAddress && <Typography className="shift-report-contact" align="center" fontSize={10}>{appSettings.shopAddress}</Typography>}
                        {appSettings.shopPhone && <Typography className="shift-report-contact" align="center" fontSize={10}>{appSettings.shopPhone}</Typography>}
                        <Typography className="shift-report-title" align="center" fontWeight={900} fontSize={13} sx={{ mt: 1.2 }}>{displayReport.status === 'closed' ? 'SHIFT CLOSING REPORT' : 'LIVE SHIFT SUMMARY'}</Typography>
                        <Typography className="shift-report-status" align="center" fontSize={10} fontWeight={800}>{displayReport.status === 'closed' ? 'FINALIZED' : 'SHIFT OPEN'}</Typography>

                        <Box className="shift-report-meta" sx={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', py: 0.8, mt: 1.2 }}>
                            {[
                                ['Report Date', new Date(displayReport.reportTime).toLocaleString()],
                                ['Register', displayReport.registerName],
                                ['Shift', displayReport.shiftCode],
                                ['Open Date', new Date(displayReport.openedAt).toLocaleString()],
                                [displayReport.status === 'closed' ? 'Close Date' : 'As of', new Date(displayReport.reportTime).toLocaleString()],
                                ['Cashier', displayReport.cashierName],
                            ].map(([label, value]) => <Stack key={String(label)} direction="row" justifyContent="space-between" spacing={1}><Typography fontSize={10} fontWeight={700}>{label}</Typography><Typography fontSize={10} textAlign="right">{value}</Typography></Stack>)}
                        </Box>

                        <Typography className="shift-report-section" fontSize={12} fontWeight={900} sx={{ mt: 1.2, pb: 0.35, borderBottom: '1px dashed #000' }}>SALES DETAILS</Typography>
                        <Stack className="shift-report-list" spacing={0.35} sx={{ py: 0.75 }}>
                            {[
                                ['Opening Cash', formatCurrency(displayReport.openingCash)],
                                ['Expense Paid Out', formatCurrency(displayReport.totals.expensePaidOut || 0)],
                                ['Expense Refunds', formatCurrency(displayReport.totals.expenseRefunds || 0)],
                                ['Gross Sales', formatCurrency(displayReport.totals.grossSales)],
                                ['Discount', `-${formatCurrency(displayReport.totals.discounts)}`],
                                ['Tax Amount', formatCurrency(displayReport.totals.tax)],
                                ['Net Sales', formatCurrency(displayReport.totals.netSales)],
                                ['Total Collected', formatCurrency(getTotalCollected(displayReport.totals))],
                            ].map(([label, value]) => <Stack key={String(label)} direction="row" justifyContent="space-between"><Typography fontSize={10.5} fontWeight={label === 'Net Sales' || label === 'Total Collected' ? 900 : 500}>{label}</Typography><Typography fontSize={10.5} fontWeight={700}>{value}</Typography></Stack>)}
                        </Stack>

                        <Typography className="shift-report-section" fontSize={12} fontWeight={900} sx={{ mt: 0.4, pb: 0.35, borderBottom: '1px dashed #000' }}>INSIGHTS</Typography>
                        <Stack className="shift-report-list" spacing={0.35} sx={{ py: 0.75 }}>
                            <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5}>Completed Orders</Typography><Typography fontSize={10.5} fontWeight={700}>{displayReport.totals.completedOrders}</Typography></Stack>
                            <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5}>Items Sold</Typography><Typography fontSize={10.5} fontWeight={700}>{displayReport.totals.itemsSold}</Typography></Stack>
                        </Stack>

                        <Typography className="shift-report-section" fontSize={12} fontWeight={900} sx={{ mt: 0.4, pb: 0.35, borderBottom: '1px dashed #000' }}>PAYMENT-WISE SALES</Typography>
                        <Stack className="shift-report-table-row shift-report-table-head" direction="row" sx={{ py: 0.45, borderBottom: '1px dotted #777' }}>
                            <Typography fontSize={9.5} fontWeight={900} sx={{ flex: 1 }}>Method</Typography><Typography fontSize={9.5} fontWeight={900} sx={{ width: 44, textAlign: 'center' }}>Orders</Typography><Typography fontSize={9.5} fontWeight={900} sx={{ width: 90, textAlign: 'right' }}>Amount</Typography>
                        </Stack>
                        {(displayReport.paymentSummary?.length ? displayReport.paymentSummary : [
                            { method: 'cash' as const, orderCount: 0, amount: displayReport.totals.cashSales },
                            { method: 'card' as const, orderCount: 0, amount: displayReport.totals.cardSales },
                            { method: 'credit' as const, orderCount: 0, amount: displayReport.totals.creditSales },
                            ...(canAccessInstallments ? [{ method: 'installment' as const, orderCount: 0, amount: displayReport.totals.installmentSales }] : []),
                        ]).filter((entry) => canAccessInstallments || entry.method !== 'installment').map((entry) => (
                            <Stack className="shift-report-table-row" key={entry.method} direction="row" sx={{ py: 0.25 }}>
                                <Typography fontSize={10} sx={{ flex: 1 }}>{paymentMethodLabel(entry.method)}</Typography><Typography fontSize={10} sx={{ width: 44, textAlign: 'center' }}>{displayReport.paymentSummary?.length ? entry.orderCount : '-'}</Typography><Typography fontSize={10} fontWeight={700} sx={{ width: 90, textAlign: 'right' }}>{formatCurrency(entry.amount)}</Typography>
                            </Stack>
                        ))}
                        <Stack className="shift-report-total-row" direction="row" justifyContent="space-between" sx={{ borderTop: '1px dotted #777', pt: 0.35 }}><Typography fontSize={10.5} fontWeight={900}>Total Sales</Typography><Typography fontSize={10.5} fontWeight={900}>{formatCurrency(displayReport.totals.netSales)}</Typography></Stack>

                        {!!displayReport.orderTypeSummary?.length && <>
                            <Typography className="shift-report-section" fontSize={12} fontWeight={900} sx={{ mt: 1.2, pb: 0.35, borderBottom: '1px dashed #000' }}>ORDER-TYPE SALES</Typography>
                            <Stack className="shift-report-table-row shift-report-table-head" direction="row" sx={{ py: 0.45, borderBottom: '1px dotted #777' }}>
                                <Typography fontSize={9.5} fontWeight={900} sx={{ flex: 1 }}>Order Type</Typography><Typography fontSize={9.5} fontWeight={900} sx={{ width: 44, textAlign: 'center' }}>Orders</Typography><Typography fontSize={9.5} fontWeight={900} sx={{ width: 90, textAlign: 'right' }}>Amount</Typography>
                            </Stack>
                            {displayReport.orderTypeSummary.map((entry) => <Stack className="shift-report-table-row" key={entry.orderType} direction="row" sx={{ py: 0.25 }}><Typography fontSize={10} sx={{ flex: 1 }}>{orderTypeLabel(entry.orderType)}</Typography><Typography fontSize={10} sx={{ width: 44, textAlign: 'center' }}>{entry.orderCount}</Typography><Typography fontSize={10} fontWeight={700} sx={{ width: 90, textAlign: 'right' }}>{formatCurrency(entry.amount)}</Typography></Stack>)}
                        </>}

                        {!!displayReport.soldItems?.length && <>
                            <Typography className="shift-report-section" fontSize={12} fontWeight={900} sx={{ mt: 1.2, pb: 0.35, borderBottom: '1px dashed #000' }}>SOLD ITEM DETAILS</Typography>
                            <Stack className="shift-report-table-row shift-report-item-row shift-report-table-head" direction="row" sx={{ py: 0.45, borderBottom: '1px dotted #777' }}>
                                <Typography fontSize={9.5} fontWeight={900} sx={{ flex: 1 }}>Item</Typography><Typography fontSize={9.5} fontWeight={900} sx={{ width: 34, textAlign: 'center' }}>Qty</Typography><Typography fontSize={9.5} fontWeight={900} sx={{ width: 78, textAlign: 'right' }}>Amount</Typography>
                            </Stack>
                            {displayReport.soldItems.map((item) => <Stack className="shift-report-table-row shift-report-item-row" key={`${item.productId}-${item.productName}`} direction="row" alignItems="flex-start" sx={{ py: 0.25 }}><Typography fontSize={9.5} sx={{ flex: 1, pr: 0.5, overflowWrap: 'anywhere' }}>{item.productName}</Typography><Typography fontSize={9.5} sx={{ width: 34, textAlign: 'center' }}>{item.quantity}</Typography><Typography fontSize={9.5} fontWeight={700} sx={{ width: 78, textAlign: 'right' }}>{formatCurrency(item.amount)}</Typography></Stack>)}
                            <Stack className="shift-report-table-row shift-report-item-row shift-report-total-row" direction="row" sx={{ borderTop: '1px dotted #777', pt: 0.35 }}><Typography fontSize={10} fontWeight={900} sx={{ flex: 1 }}>Total</Typography><Typography fontSize={10} fontWeight={900} sx={{ width: 34, textAlign: 'center' }}>{displayReport.totals.itemsSold}</Typography><Typography fontSize={10} fontWeight={900} sx={{ width: 78, textAlign: 'right' }}>{formatCurrency(displayReport.totals.netSales)}</Typography></Stack>
                        </>}

                        <Typography className="shift-report-section" fontSize={12} fontWeight={900} sx={{ mt: 1.2, pb: 0.35, borderBottom: '1px dashed #000' }}>CASH RECONCILIATION</Typography>
                        <Stack className="shift-report-list" spacing={0.35} sx={{ py: 0.75 }}>
                            <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5}>Opening Cash</Typography><Typography fontSize={10.5} fontWeight={700}>{formatCurrency(displayReport.openingCash)}</Typography></Stack>
                            <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5}>Expense Paid Out</Typography><Typography fontSize={10.5} fontWeight={700}>{formatCurrency(displayReport.totals.expensePaidOut || 0)}</Typography></Stack>
                            <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5}>Expense Refunds</Typography><Typography fontSize={10.5} fontWeight={700}>{formatCurrency(displayReport.totals.expenseRefunds || 0)}</Typography></Stack>
                            <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5} fontWeight={900}>Expected Cash</Typography><Typography fontSize={10.5} fontWeight={900}>{formatCurrency(displayReport.totals.expectedDrawerCash)}</Typography></Stack>
                            {displayReport.totals.countedCash != null && <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5}>Counted Cash</Typography><Typography fontSize={10.5} fontWeight={700}>{formatCurrency(displayReport.totals.countedCash)}</Typography></Stack>}
                            {displayReport.totals.cashDifference != null && <Stack direction="row" justifyContent="space-between"><Typography fontSize={10.5} fontWeight={900}>Variance</Typography><Typography fontSize={10.5} fontWeight={900}>{differenceLabel(displayReport.totals)}</Typography></Stack>}
                        </Stack>

                        <Typography className="shift-report-print-footer" align="center" fontSize={10} fontWeight={900} sx={{ borderTop: '1px dashed #000', pt: 1 }}>{displayReport.status === 'open' ? 'LIVE SUMMARY - SHIFT REMAINS OPEN' : 'FINAL REPORT - SHIFT CLOSED'}</Typography>
                        <Typography align="center" fontSize={9}>Printed {new Date().toLocaleString()}</Typography>
                    </Box>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDisplayReport(null)} disabled={printing}>Close</Button>
                    <Button variant="contained" startIcon={printing ? <CircularProgress size={17} color="inherit" /> : <Printer size={18} />} onClick={handlePrint} disabled={printing}>{printing ? 'Preparing...' : 'Print Report'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default POSShiftReportsPage;
