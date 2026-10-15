import React from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    Snackbar,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { CheckCircle2, ClipboardCheck, History, Printer, XCircle } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import api from '../../api/axios';
import { StockRequestForm } from '../../components/Inventory/StockRequest';
import StockRequestDetails from '../../components/Inventory/StockRequestDetails';
import { downloadStockRequest, type RequestVendor, type RequestItem, type StockRequestData } from '../../lib/inventoryRequestExports';
import { fetchProducts } from '../../features/inventory/inventorySlice';
import StockRequestSlip from '../../components/Inventory/StockRequestSlip';
import { printReceipt } from '../../lib/printReceipt';
import InventoryRequestHistory from '../../components/Inventory/InventoryRequestHistory';

interface InventoryRequest extends StockRequestData {
    requestType?: 'product' | 'restock';
    vendors?: RequestVendor[];
    items?: RequestItem[];
    _id: string;
    requestedByName: string;
    requestedByEmail: string;
    status: 'pending' | 'approved' | 'rejected';
    decisionNote?: string;
    approvedProductId?: string;
    createdAt: string;
    reviewedByName?: string;
    productData: {
        sku: string;
        name: string;
        category: string;
        purchasePrice: number;
        salePrice: number;
        stock: number;
        minStock: number;
        description?: string;
    };
}

const requestErrorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const InventoryRequestsPage: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { user } = useSelector((state: RootState) => state.auth);
    const shopName = useSelector((state: RootState) => state.settings.app?.shopName || 'ItemHive');
    const isManager = user?.role === 'super_admin' || user?.role === 'admin';
    const [requests, setRequests] = React.useState<InventoryRequest[]>([]);
    const [notes, setNotes] = React.useState<Record<string, string>>({});
    const [loading, setLoading] = React.useState(true);
    const [busyId, setBusyId] = React.useState('');
    const [error, setError] = React.useState('');
    const [snack, setSnack] = React.useState('');
    const [formVersion, setFormVersion] = React.useState(0);
    const [exporting, setExporting] = React.useState('');
    const [printing, setPrinting] = React.useState('');
    const [historyOpen, setHistoryOpen] = React.useState(false);

    const printRequest = async (request: InventoryRequest) => {
        if (printing) return;
        setPrinting(request._id);
        setError('');
        try {
            const slipId = `stock-request-slip-${request._id}`;
            const slip = document.getElementById(slipId);
            if (!slip) throw new Error('Request slip is unavailable. Please retry.');
            await printReceipt(slip, `#${slipId}`, 58);
        } catch {
            setError('Unable to prepare this request slip for printing. Please retry.');
        } finally { setPrinting(''); }
    };

    const download = async (request: InventoryRequest, format: 'pdf' | 'xlsx') => {
        setExporting(request._id);
        try { await downloadStockRequest(request, format); }
        catch { setError('Unable to download the request. Please retry.'); }
        finally { setExporting(''); }
    };

    const loadRequests = React.useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const response = await api.get('/inventory-requests');
            setRequests(response.data as InventoryRequest[]);
        } catch (requestError) {
            setError(requestErrorMessage(requestError, 'Unable to load inventory requests right now.'));
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadRequests();
        const refresh = () => { setFormVersion(current => current + 1); setHistoryOpen(false); setRequests([]); setNotes({}); void loadRequests(); };
        window.addEventListener('itemhive-workspace-changed', refresh);
        return () => window.removeEventListener('itemhive-workspace-changed', refresh);
    }, [loadRequests]);

    const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
        setBusyId(requestId);

        try {
            await api.patch(`/inventory-requests/${requestId}/review`, {
                status,
                decisionNote: notes[requestId] || '',
            });
            await loadRequests();
            setSnack(`Request ${status} successfully.`);
        } catch (requestError) {
            setError(requestErrorMessage(requestError, 'Unable to review this request.'));
        } finally {
            setBusyId('');
        }
    };

    const pendingCount = requests.filter((request) => request.status === 'pending').length;

    return (
        <Box>
            {historyOpen && <InventoryRequestHistory requests={requests.filter(request => request.requestType === 'restock')} onClose={() => setHistoryOpen(false)} />}
            <Snackbar
                open={Boolean(snack)}
                autoHideDuration={2600}
                onClose={() => setSnack('')}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert onClose={() => setSnack('')} severity="success" sx={{ width: '100%' }}>
                    {snack}
                </Alert>
            </Snackbar>

            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight={800}>Inventory Requests</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {isManager
                            ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting for review.`
                            : 'Track the inventory requests you have sent for approval.'}
                    </Typography>
                </Box>
                <Button variant="outlined" startIcon={<History size={18} />} disabled={loading} onClick={() => setHistoryOpen(true)}>Order & Receiving History</Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    {error}
                </Alert>
            )}

            <StockRequestForm key={formVersion} onSaved={() => { setSnack('Stock request submitted successfully.'); void loadRequests(); }} />
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Submitted Requests</Typography>

            {loading ? (
                <Box sx={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
                    <CircularProgress />
                </Box>
            ) : (
                <Grid container spacing={3}>
                    {requests.map((request) => {
                        const isBusy = busyId === request._id;

                        return (
                            <Grid key={request._id} size={{ xs: 12, lg: request.requestType === 'restock' ? 12 : 6 }}>
                                <Card sx={{ borderRadius: 4, height: '100%' }}>
                                    <CardContent sx={{ p: 3 }}>
                                        <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
                                            <Box>
                                                <Typography variant="h6" fontWeight={800}>{request.requestType === 'restock' ? `Stock Request (${request.items?.length || 0} items)` : request.productData.name}</Typography>
                                                {request.requestType === 'restock' ? <Typography variant="body2" color="text.secondary">Request #{request._id}</Typography> :
                                                <Typography variant="body2" color="text.secondary">
                                                    SKU {request.productData.sku} • {request.productData.category}
                                                </Typography>}
                                            </Box>
                                            <Chip
                                                label={request.status}
                                                color={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'error' : 'warning'}
                                                sx={{ textTransform: 'capitalize', fontWeight: 700 }}
                                            />
                                        </Stack>

                                        {request.requestType === 'restock' ? <StockRequestDetails key={`${request._id}-${request.__v || 0}`} request={request} onUpdated={(updated) => {
                                            setRequests(current => current.map(row => row._id === updated._id ? { ...row, ...updated } as InventoryRequest : row));
                                            setSnack('Delivery and receiving record saved.');
                                            void dispatch(fetchProducts({ force: true }));
                                        }} /> : <Grid container spacing={1.5} sx={{ mt: 2 }}>
                                            <Grid size={{ xs: 6 }}>
                                                <Typography variant="caption" color="text.secondary">Purchase Price</Typography>
                                                <Typography variant="body2" fontWeight={700}>{request.productData.purchasePrice}</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6 }}>
                                                <Typography variant="caption" color="text.secondary">Sale Price</Typography>
                                                <Typography variant="body2" fontWeight={700}>{request.productData.salePrice}</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6 }}>
                                                <Typography variant="caption" color="text.secondary">Requested Stock</Typography>
                                                <Typography variant="body2" fontWeight={700}>{request.productData.stock}</Typography>
                                            </Grid>
                                            <Grid size={{ xs: 6 }}>
                                                <Typography variant="caption" color="text.secondary">Min Stock</Typography>
                                                <Typography variant="body2" fontWeight={700}>{request.productData.minStock}</Typography>
                                            </Grid>
                                        </Grid>}

                                        <Box sx={{ mt: 2 }}>
                                            <Typography variant="caption" color="text.secondary">Requested By</Typography>
                                            <Typography variant="body2" fontWeight={700}>
                                                {request.requestedByName} • {request.requestedByEmail}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(request.createdAt).toLocaleString()}
                                            </Typography>
                                        </Box>

                                        {request.requestType !== 'restock' && request.productData.description && (
                                            <Box sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: 'action.hover' }}>
                                                <Typography variant="caption" color="text.secondary">Description</Typography>
                                                <Typography variant="body2">{request.productData.description}</Typography>
                                            </Box>
                                        )}

                                        {request.requestType === 'restock' && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                                            <Button variant="outlined" disabled={exporting === request._id} onClick={() => void download(request, 'pdf')}>Download PDF</Button>
                                            <Button variant="outlined" disabled={exporting === request._id} onClick={() => void download(request, 'xlsx')}>Download Excel</Button>
                                            <Button variant="outlined" startIcon={<Printer size={16} />} disabled={Boolean(printing)} onClick={() => void printRequest(request)}>{printing === request._id ? 'Preparing...' : 'Print Slip'}</Button>
                                        </Stack>}

                                        {request.requestType === 'restock' && <StockRequestSlip request={request} shopName={shopName} />}

                                        {isManager && request.status === 'pending' && (
                                            <Stack spacing={1.5} sx={{ mt: 2.5 }}>
                                                <TextField
                                                    label="Decision note"
                                                    size="small"
                                                    value={notes[request._id] || ''}
                                                    onChange={(event) => setNotes((current) => ({
                                                        ...current,
                                                        [request._id]: event.target.value,
                                                    }))}
                                                />
                                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                                    <Button
                                                        fullWidth
                                                        variant="contained"
                                                        color="success"
                                                        startIcon={<CheckCircle2 size={16} />}
                                                        onClick={() => handleReview(request._id, 'approved')}
                                                        disabled={isBusy}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        fullWidth
                                                        variant="outlined"
                                                        color="error"
                                                        startIcon={<XCircle size={16} />}
                                                        onClick={() => handleReview(request._id, 'rejected')}
                                                        disabled={isBusy}
                                                    >
                                                        Reject
                                                    </Button>
                                                </Stack>
                                            </Stack>
                                        )}

                                        {request.status !== 'pending' && (
                                            <Box sx={{ mt: 2.5, p: 2, borderRadius: 3, bgcolor: 'action.hover' }}>
                                                <Typography variant="subtitle2" fontWeight={700}>
                                                    Reviewed by {request.reviewedByName || 'Admin'}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {request.decisionNote || 'No review note was added.'}
                                                </Typography>
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}

                    {!requests.length && (
                        <Grid size={12}>
                            <Card sx={{ borderRadius: 4 }}>
                                <CardContent sx={{ p: 4, textAlign: 'center' }}>
                                    <ClipboardCheck size={38} style={{ opacity: 0.45, marginBottom: 12 }} />
                                    <Typography variant="h6" fontWeight={800}>No inventory requests yet</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {isManager
                                            ? 'Requests from users will appear here as soon as they are submitted.'
                                            : 'Create your first inventory request in Stock Required above.'}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    )}
                </Grid>
            )}
        </Box>
    );
};

export default InventoryRequestsPage;
