import api from '../../api/axios';
import { createPortal } from 'react-dom';
import './reportsPrint.css';
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
    Box,
    Typography,
    Grid,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert,
    Button,
    ButtonGroup,
    TextField,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
    TrendingDown,
    BarChart as BarChartIcon,
    Download,
    FileDown
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area
} from 'recharts';
import useAppCurrency from '../../hooks/useAppCurrency';
import * as XLSX from 'xlsx';
import { fetchProducts, normalizeProduct, type Product } from '../../features/inventory/inventorySlice';
import BranchScopeToggle, { type BranchViewScope } from '../../components/Common/BranchScopeToggle';
import { type SalesTrendPoint, type CategoryValuationPoint, type TopSellingProduct, type ReportFilters, type ReportPeriod } from '../../features/reports/reportSlice';
import { buildInvoicePdfBlob } from '../../lib/invoicePdf';

const ReportsPage: React.FC = () => {
    const theme = useTheme();
    const dispatch = useDispatch<AppDispatch>();
    const { products: branchProducts } = useSelector((state: RootState) => state.inventory);
    // The combined view of every branch is loaded here, so other screens keep the active branch's products.
    const [scope, setScope] = useState<BranchViewScope>('branch');
    const scopeRef = useRef<BranchViewScope>('branch');
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const products = scope === 'all' ? allProducts : branchProducts;
    const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
    const [categoryValuation, setCategoryValuation] = useState<CategoryValuationPoint[]>([]);
    const [topSelling, setTopSelling] = useState<TopSellingProduct[]>([]);
    const [error, setError] = useState('');
    const [generating, setGenerating] = useState(false);
    const [generated, setGenerated] = useState(false);
    const requestId = useRef(0);
    const { currency, formatCurrency } = useAppCurrency();
    const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('7days');
    const [selectedHourlyHours, setSelectedHourlyHours] = useState(24);
    const [generatedFilters, setGeneratedFilters] = useState<ReportFilters>({ period: '7days' });
    const [fromDate, setFromDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 6);
        return date.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

    const generate = useCallback(async (filters: ReportFilters) => {
        const request = ++requestId.current;
        setGenerating(true); setGenerated(false); setError('');
        const allBranches = scopeRef.current === 'all';
        const scopeParams = allBranches ? { branchScope: 'all' } : {};
        try {
            const [trend, valuation, selling, combinedProducts] = await Promise.all([
                api.get<SalesTrendPoint[]>('/reports/sales-trend', { params: { ...filters, ...scopeParams } }),
                api.get<CategoryValuationPoint[]>('/reports/category-valuation', { params: scopeParams }),
                api.get<TopSellingProduct[]>('/reports/top-selling', { params: { ...filters, ...scopeParams } }),
                allBranches ? api.get('/products', { params: scopeParams }) : null,
            ]);
            if (request !== requestId.current) return;
            setSalesTrend(trend.data); setCategoryValuation(valuation.data); setTopSelling(selling.data);
            setGeneratedFilters(filters); setGenerated(true);
            if (combinedProducts) setAllProducts(combinedProducts.data.map(normalizeProduct));
            else dispatch(fetchProducts());
        } catch (failure) {
            if (request !== requestId.current) return;
            const response = (failure as { response?: { status?: number; data?: { message?: string } } }).response;
            setError(response?.status === 404 ? 'The report API is unavailable on the connected backend. Deploy the updated backend and retry.' : response?.data?.message || 'Unable to generate reports. Check your connection and retry.');
        } finally { if (request === requestId.current) setGenerating(false); }
    }, [dispatch]);
    const buildFilters = (): ReportFilters => (
        selectedPeriod === 'custom'
            ? { period: 'custom', from: fromDate, to: toDate }
            : selectedPeriod === 'hourly'
                ? { period: 'hourly', hours: selectedHourlyHours }
            : { period: selectedPeriod }
    );

    const handlePeriodChange = (period: ReportPeriod) => {
        setSelectedPeriod(period);
        void generate(
            period === 'custom'
                ? { period, from: fromDate, to: toDate }
                : period === 'hourly'
                    ? { period, hours: selectedHourlyHours }
                    : { period }
        );
    };

    const handleScopeChange = (next: BranchViewScope) => {
        scopeRef.current = next;
        setScope(next);
        void generate(buildFilters());
    };

    const handleHourlyHoursChange = (hours: number) => {
        setSelectedHourlyHours(hours);
        if (selectedPeriod === 'hourly') {
            void generate({ period: 'hourly', hours });
        }
    };

    useEffect(() => {
        const refresh = () => { setSalesTrend([]); setCategoryValuation([]); setTopSelling([]); void generate({ period: '7days' }); };
        refresh();
        window.addEventListener('itemhive-workspace-changed', refresh);
        return () => { ++requestId.current; window.removeEventListener('itemhive-workspace-changed', refresh); };
    }, [generate]);
    const handleGenerateReport = () => {
        if (selectedPeriod === 'custom' && (!fromDate || !toDate || fromDate > toDate)) {
            setError('Choose a valid From and To date, with From on or before To.'); return;
        }
        void generate(buildFilters());
    };

    const getReportFileName = (extension: string) => `ozor_analytics_${generatedFilters.period}_${new Date().toISOString().slice(0, 10)}.${extension}`;
    const formatItemSales = (items: SalesTrendPoint['items']) =>
        items?.map((item) => `${item.name}: ${item.quantity}`).join(', ') || '-';

    const handleDownloadExcel = () => {
        const workbook = XLSX.utils.book_new();
        const salesRows = trendData.map((row) => ({
            Period: row.name,
            Revenue: row.revenue,
            'Units Sold': row.sales,
            'Item-wise Sales': formatItemSales(row.items),
        }));
        const productsRows = topSellingRows.map(({ name, totalReduced, revenue, profit, product }) => ({
            Product: name,
            'Units Sold': totalReduced,
            Revenue: revenue,
            'Profit / Loss': profit || 0,
            'Current Stock': product?.stock ?? 0,
        }));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesRows), 'Sales Trend');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsRows), 'Top Products');
        XLSX.writeFile(workbook, getReportFileName('xlsx'));
    };

    const handleDownloadPdf = async () => {
        try {
            const blob = await buildInvoicePdfBlob({
                title: 'Inventory Analytics Report',
                shop: { name: 'Ozor' },
                billToLabel: 'Report period',
                billTo: reportHeading,
                meta: [{ label: 'Generated', value: new Date().toLocaleString() }],
                columns: [
                    { label: 'Period', width: 1.2 },
                    { label: 'Revenue', width: 1.5, align: 'right' },
                    { label: 'Units', width: 0.8, align: 'right' },
                    { label: 'Item-wise sales', width: 3.5 },
                ],
                rows: trendData.map((row) => [
                    row.name,
                    formatCurrency(row.revenue),
                    String(row.sales),
                    formatItemSales(row.items),
                ]),
                totals: [{ label: 'Total profit / loss', value: formatCurrency(totalProfit), strong: true }],
                footer: 'Item-wise quantities show the products sold in each reporting period.',
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = getReportFileName('pdf');
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch {
            setError('Could not generate the PDF download. Please try again.');
        }
    };

    const handleDownloadPdfLegacy = () => {
        const escapeHtml = (value: string | number) => String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const popup = window.open('', '_blank', 'width=900,height=700');
        if (!popup) return;

        const salesRows = trendData.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(formatCurrency(row.revenue))}</td><td>${escapeHtml(row.sales)}<br><small>Items: ${escapeHtml(formatItemSales(row.items))}</small></td></tr>`).join('');
        const productRows = topSellingRows.map(({ name, totalReduced, revenue, profit, product }) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(totalReduced)}</td><td>${escapeHtml(formatCurrency(revenue))}</td><td>${escapeHtml(formatCurrency(profit || 0))}</td><td>${escapeHtml(product?.stock ?? 0)}</td></tr>`).join('');
        popup.document.write(`<!doctype html><html><head><title>${getReportFileName('pdf')}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:32px}h1{margin:0 0 6px}p{color:#5b6576}table{width:100%;border-collapse:collapse;margin:20px 0 32px}th,td{border:1px solid #d7dce5;padding:9px;text-align:left}th{background:#f2f5f9} .summary{font-weight:bold;font-size:18px;color:#126b45}@media print{body{margin:18px}}</style></head><body><h1>Inventory Analytics Report</h1><p>Period: ${escapeHtml(reportHeading)} · Generated: ${escapeHtml(new Date().toLocaleString())}</p><p class="summary">Total profit / loss: ${escapeHtml(formatCurrency(totalProfit))}</p><h2>Sales Trend</h2><table><thead><tr><th>Period</th><th>Revenue</th><th>Units Sold</th></tr></thead><tbody>${salesRows}</tbody></table><h2>Top Selling Products</h2><table><thead><tr><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Profit / Loss</th><th>Current Stock</th></tr></thead><tbody>${productRows}</tbody></table></body></html>`);
        popup.document.close();
        popup.focus();
        window.setTimeout(() => popup.print(), 250);
    };

    // Keep the legacy print popup isolated; Download PDF now uses a Blob download.
    void handleDownloadPdfLegacy;

    const reportHeading = useMemo(() => {
        if (generatedFilters.period === 'hourly') return `Last ${generatedFilters.hours || 24} Hours`;
        if (generatedFilters.period === 'monthly') return 'Last 30 Days';
        if (generatedFilters.period === 'yearly') return 'Last 12 Months';
        if (generatedFilters.period === 'custom') {
            return `${generatedFilters.from || fromDate} to ${generatedFilters.to || toDate}`;
        }
        return 'Last 7 Days';
    }, [fromDate, generatedFilters, toDate]);

    const reportPalette = useMemo(
        () => [
            theme.palette.primary.main,
            theme.palette.secondary.main,
            theme.palette.success.main,
            theme.palette.warning.main,
            '#0ea5e9',
            '#a855f7',
        ],
        [theme.palette]
    );

    const trendData = useMemo(() => {
        if (generatedFilters.period === 'hourly') {
            const hourCount = generatedFilters.hours || 24;
            return [...Array(hourCount)].map((_, i) => {
                const date = new Date();
                date.setHours(date.getHours() - ((hourCount - 1) - i), 0, 0, 0);
                const hourKey = new Intl.DateTimeFormat('en-GB', {
                    hour: '2-digit',
                    hourCycle: 'h23',
                    timeZone: 'Asia/Karachi',
                }).format(date);
                const point = salesTrend.find((entry) => entry._id === hourKey);
                return {
                    name: date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'Asia/Karachi' }),
                    revenue: point?.revenue || 0,
                    sales: point?.sales || 0,
                    items: point?.items || [],
                };
            });
        }

        if (generatedFilters.period === 'yearly') {
            return [...Array(12)].map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - (11 - i), 1);
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                const point = salesTrend.find((entry) => entry._id === monthKey);
                return { name: monthLabel, revenue: point?.revenue || 0, sales: point?.sales || 0, items: point?.items || [] };
            });
        }

        const start = generatedFilters.period === 'custom'
            ? new Date(generatedFilters.from || fromDate)
            : null;
        const end = generatedFilters.period === 'custom'
            ? new Date(generatedFilters.to || toDate)
            : null;

        if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
            const rows: Array<{ name: string; revenue: number; sales: number; items: SalesTrendPoint['items'] }> = [];
            const cursor = new Date(start);
            while (cursor <= end) {
                const dateStr = cursor.toISOString().split('T')[0];
                const point = salesTrend.find((entry) => entry._id === dateStr);
                rows.push({
                    name: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    revenue: point?.revenue || 0,
                    sales: point?.sales || 0,
                    items: point?.items || [],
                });
                cursor.setDate(cursor.getDate() + 1);
            }
            return rows;
        }

        const totalDays = generatedFilters.period === 'monthly' ? 30 : 7;
        return [...Array(totalDays)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - ((totalDays - 1) - i));
            const dateStr = d.toISOString().split('T')[0];
            const point = salesTrend.find((entry) => entry._id === dateStr);
            const label = generatedFilters.period === 'monthly'
                ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return { name: label, revenue: point?.revenue || 0, sales: point?.sales || 0, items: point?.items || [] };
        });
    }, [fromDate, generatedFilters, salesTrend, toDate]);

    const pieData = useMemo(() => categoryValuation, [categoryValuation]);

    const stockLevelData = useMemo(
        () => [...products]
            .map(p => ({
                name: p.name.length > 13 ? `${p.name.substring(0, 13)}...` : p.name,
                stock: p.stock,
                min: p.minStock,
                gap: p.stock - p.minStock,
            }))
            .sort((a, b) => a.gap - b.gap)
            .slice(0, 10),
        [products]
    );

    const topSellingRows = useMemo(
        () => topSelling.map((row) => ({
            ...row,
            product: products.find((product) => product.id === row._id),
        })),
        [topSelling, products]
    );

    const totalProfit = useMemo(
        () => salesTrend.reduce((sum, point) => sum + (point.profit || 0), 0),
        [salesTrend]
    );

    return (
        <Box>
            {createPortal(<section id="itemhive-report-print">
                <h1>Ozor Inventory &amp; Sales Report</h1>
                <p>{reportHeading} | Currency: {currency}</p>
                <p>Total profit/loss: {formatCurrency(totalProfit)}</p>
                <h2>Sales Summary</h2>
                {salesTrend.length === 0 ? <p>No sales recorded for this period.</p> : <table><thead><tr><th>Date / hour</th><th>Revenue</th><th>Units sold</th><th>Item-wise sales</th><th>Profit/loss</th></tr></thead><tbody>{salesTrend.map(row => <tr key={row._id}><td>{row._id}</td><td>{formatCurrency(row.revenue)}</td><td>{row.sales}</td><td>{formatItemSales(row.items)}</td><td>{formatCurrency(row.profit || 0)}</td></tr>)}</tbody></table>}
                <h2>Top Selling Products</h2>
                {topSelling.length === 0 ? <p>No sales recorded for this period.</p> : <table><thead><tr><th>Product</th><th>Units sold</th><th>Revenue</th><th>Profit/loss</th></tr></thead><tbody>{topSelling.map(row => <tr key={row._id}><td>{row.name}</td><td>{row.totalReduced}</td><td>{formatCurrency(row.revenue)}</td><td>{formatCurrency(row.profit || 0)}</td></tr>)}</tbody></table>}
                <h2>Current Inventory Valuation</h2><p>Current stock values, independent of the selected sales period.</p>
                <table><thead><tr><th>Category</th><th>Stock value</th></tr></thead><tbody>{categoryValuation.map(row => <tr key={row.name}><td>{row.name}</td><td>{formatCurrency(row.value)}</td></tr>)}</tbody></table>
            </section>, document.body)}

            <Box
                sx={{
                    mb: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    '@media print': { display: 'none' }
                }}
            >
                <Box>
                    <Typography variant="h4" fontWeight={800}>Inventory Analytics & Reports</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Generate hourly, daily, monthly, yearly, or custom date range reports from the controls below.
                    </Typography>
                    <Box sx={{ mt: 1.5 }}><BranchScopeToggle value={scope} onChange={handleScopeChange} /></Box>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
                    <ButtonGroup variant="outlined" size="small" sx={{ '& .MuiButton-root': { whiteSpace: 'nowrap', minHeight: 40 } }}>
                        <Button variant={selectedPeriod === '7days' ? 'contained' : 'outlined'} onClick={() => handlePeriodChange('7days')}>
                            7 Days
                        </Button>
                        <Button variant={selectedPeriod === 'monthly' ? 'contained' : 'outlined'} onClick={() => handlePeriodChange('monthly')}>
                            Monthly
                        </Button>
                        <Button variant={selectedPeriod === 'yearly' ? 'contained' : 'outlined'} onClick={() => handlePeriodChange('yearly')}>
                            Yearly
                        </Button>
                        <Button variant={selectedPeriod === 'custom' ? 'contained' : 'outlined'} onClick={() => handlePeriodChange('custom')}>
                            Custom Range
                        </Button>
                        <Button variant={selectedPeriod === 'hourly' ? 'contained' : 'outlined'} onClick={() => handlePeriodChange('hourly')}>
                            Hourly
                        </Button>
                    </ButtonGroup>
                    <Button variant="contained" size="small" sx={{ minHeight: 40, whiteSpace: 'nowrap' }} disabled={generating} onClick={handleGenerateReport}>
                        {generating ? 'Generating...' : 'Generate Report'}
                    </Button>
                    <Button variant="outlined" size="small" sx={{ minHeight: 40, whiteSpace: 'nowrap' }} startIcon={<FileDown size={18} />} onClick={handleDownloadPdf}>
                        Download PDF
                    </Button>
                    <Button variant="outlined" size="small" sx={{ minHeight: 40, whiteSpace: 'nowrap' }} startIcon={<Download size={18} />} onClick={handleDownloadExcel}>
                        Download Excel
                    </Button>
                </Box>
                {selectedPeriod === 'custom' && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Custom date range:</Typography>
                        <TextField
                            type="date"
                            size="small"
                            label="From"
                            InputLabelProps={{ shrink: true }}
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                        <TextField
                            type="date"
                            size="small"
                            label="To"
                            InputLabelProps={{ shrink: true }}
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </Box>
                )}
                {selectedPeriod === 'hourly' && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" fontWeight={700}>Show hourly activity for:</Typography>
                        <ButtonGroup size="small" variant="outlined">
                            {[6, 12, 24].map((hours) => (
                                <Button
                                    key={hours}
                                    variant={selectedHourlyHours === hours ? 'contained' : 'outlined'}
                                    onClick={() => handleHourlyHoursChange(hours)}
                                >
                                    Last {hours} hours
                                </Button>
                            ))}
                        </ButtonGroup>
                        <Typography variant="caption" color="text.secondary">Charts update when you choose a window.</Typography>
                    </Box>
                )}
            </Box>

            {generated && !error && <Alert severity="success" sx={{ mb: 2 }}>Report generated for {reportHeading}. {salesTrend.length === 0 ? 'No sales were recorded in this period.' : ''}</Alert>}
            <Button variant="outlined" disabled={!generated || generating || Boolean(error)} sx={{ mb: 2 }} onClick={() => window.print()}>Print as PDF</Button>
            <Typography variant="caption" display="block" sx={{ mb: 2 }}>Generate your report, then choose Save as PDF in the print dialog.</Typography>
            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            <Alert severity={totalProfit >= 0 ? 'success' : 'warning'} sx={{ mb: 3 }}>
                Total profit/loss for {reportHeading.toLowerCase()}: {formatCurrency(totalProfit, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </Alert>

            <Grid container spacing={3}>
                {/* Revenue Trend Line Chart */}
                <Grid size={{ xs: 12, md: 8 }}>
                    <Card sx={{ borderRadius: 4 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={700} gutterBottom>{`Revenue Trend (${reportHeading})`}</Typography>
                            <Box sx={{ height: { xs: 240, sm: 280, md: 300 }, mt: 2.5 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={trendData}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.22} />
                                                <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.text.primary, 0.1)} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={generatedFilters.period === 'monthly' || generatedFilters.period === 'custom' ? 24 : 8} />
                                        <YAxis axisLine={false} tickLine={false} />
                                        <Tooltip formatter={(value: number | string | undefined) => [formatCurrency(Number(value || 0)), `Revenue (${currency})`]} />
                                        <Area type="monotone" dataKey="revenue" stroke={theme.palette.primary.main} strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" name={`Revenue (${currency})`} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Sales Volume Bar Chart */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card sx={{ borderRadius: 4 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={700} gutterBottom>{`Sales Volume (${reportHeading})`}</Typography>
                            <Box sx={{ height: { xs: 240, sm: 280, md: 300 }, mt: 2.5 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.text.primary, 0.1)} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={generatedFilters.period === 'monthly' || generatedFilters.period === 'custom' ? 24 : 8} />
                                        <YAxis axisLine={false} tickLine={false} />
                                        <Tooltip formatter={(value: number | string | undefined) => [Number(value || 0), 'Units Sold']} />
                                        <Bar dataKey="sales" fill={theme.palette.success.main} radius={[4, 4, 0, 0]} name="Units Sold" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ borderRadius: 4 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <BarChartIcon size={20} /> Stock Level (Top 10 Critical)
                            </Typography>
                            <Box sx={{ height: { xs: 240, sm: 280, md: 300 }, mt: 2.5 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stockLevelData} layout="vertical" margin={{ left: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={alpha(theme.palette.text.primary, 0.1)} />
                                        <XAxis type="number" axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            formatter={(value: number | string | undefined, name) => [Number(value || 0), name === 'stock' ? 'Current Stock' : 'Min Threshold']}
                                        />
                                        <Legend />
                                        <Bar dataKey="stock" fill={theme.palette.primary.main} radius={[0, 4, 4, 0]} name="Current Stock" />
                                        <Bar dataKey="min" fill={theme.palette.error.main} radius={[0, 4, 4, 0]} name="Min Threshold" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ borderRadius: 4 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={700} gutterBottom>Inventory Value by Category</Typography>
                            <Box sx={{ height: { xs: 240, sm: 280, md: 300 }, mt: 2.5 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {pieData.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={reportPalette[index % reportPalette.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: number | string | undefined) => [formatCurrency(Number(value || 0), { minimumFractionDigits: 0, maximumFractionDigits: 0 }), `Value (${currency})`]} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={12}>
                    <Card sx={{ borderRadius: 4 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={700} gutterBottom>Top Selling Products (Performance)</Typography>
                            <TableContainer sx={{ overflowX: 'auto' }}>
                                <Table sx={{ minWidth: 640 }}>
                                    <TableHead sx={{ bgcolor: 'rgba(0,0,0,0.02)' }}>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>PRODUCT</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>TOTAL REDUCED</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>REVENUE GENERATED</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>PROFIT / LOSS</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>CURRENT STOCK</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {topSellingRows.map(({ product, _id, name, totalReduced, revenue, profit }) => (
                                            <TableRow key={_id}>
                                                <TableCell sx={{ fontWeight: 600 }}>{name}</TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <TrendingDown size={14} color={theme.palette.error.main} />
                                                        {totalReduced} Units
                                                    </Box>
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>
                                                    {formatCurrency(revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: 700, color: (profit || 0) >= 0 ? 'success.main' : 'error.main' }}>
                                                    {formatCurrency(profit || 0, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </TableCell>
                                                <TableCell>{product?.stock ?? 0} Units</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};


export default ReportsPage;

