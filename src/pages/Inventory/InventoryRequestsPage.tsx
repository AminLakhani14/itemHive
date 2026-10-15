import React from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, Grid, MenuItem, Snackbar, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { Eye, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import api from '../../api/axios';
import { StockRequestForm } from '../../components/Inventory/StockRequest';
import InventoryRequestDialog from '../../components/Inventory/InventoryRequestDialog';
import type { InventoryRequestRecord } from '../../lib/inventoryRequestExports';

interface RequestsResponse { requests: InventoryRequestRecord[]; total: number; pendingCount: number }

export default function InventoryRequestsPage() {
    const user = useSelector((state: RootState) => state.auth.user);
    const isManager = user?.role === 'super_admin' || user?.role === 'admin';
    const [requests, setRequests] = React.useState<InventoryRequestRecord[]>([]);
    const [selected, setSelected] = React.useState<InventoryRequestRecord | null>(null);
    const [page, setPage] = React.useState(0);
    const [pageSize, setPageSize] = React.useState(10);
    const [total, setTotal] = React.useState(0);
    const [pendingCount, setPendingCount] = React.useState(0);
    const [query, setQuery] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [status, setStatus] = React.useState('');
    const [delivery, setDelivery] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [snack, setSnack] = React.useState('');
    const [refresh, setRefresh] = React.useState(0);
    const [formVersion, setFormVersion] = React.useState(0);
    React.useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(0); }, 300); return () => clearTimeout(timer); }, [query]);
    React.useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        api.get<RequestsResponse>('/inventory-requests', { params: { page, pageSize, q: search, status, deliveryStatus: delivery } })
            .then(({ data }) => {
                if (!active) return;
                if (!Array.isArray(data.requests)) throw new Error('The connected inventory service needs to be updated.');
                setTotal(data.total); setPendingCount(data.pendingCount);
                if (page > 0 && page * pageSize >= data.total) setPage(Math.max(0, Math.ceil(data.total / pageSize) - 1));
                else setRequests(data.requests);
            })
            .catch(failure => { if (active) { setRequests([]); setTotal(0); setError(failure?.response?.data?.message || failure?.message || 'Unable to load inventory requests. Please retry.'); } })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [page, pageSize, search, status, delivery, refresh]);
    React.useEffect(() => {
        const reset = () => { setSelected(null); setRequests([]); setTotal(0); setPendingCount(0); setPage(0); setQuery(''); setSearch(''); setStatus(''); setDelivery(''); setFormVersion(value => value + 1); setRefresh(value => value + 1); };
        window.addEventListener('itemhive-workspace-changed', reset);
        return () => window.removeEventListener('itemhive-workspace-changed', reset);
    }, []);
    return <Box>
        {selected && <InventoryRequestDialog key={selected._id} request={selected} onClose={() => setSelected(null)} onChanged={(updated, notice) => { setSelected(updated); setSnack(notice); setRefresh(value => value + 1); }} />}
        <Snackbar open={Boolean(snack)} autoHideDuration={3000} onClose={() => setSnack('')} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}><Alert severity="success" onClose={() => setSnack('')}>{snack}</Alert></Snackbar>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ mb: 3 }}><Box><Typography variant="h4" fontWeight={800}>Inventory Requests</Typography><Typography variant="body2" color="text.secondary">{isManager ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting for review.` : 'Track your inventory orders and receiving records.'}</Typography></Box><Button component={Link} to="/vendor-history" variant="outlined" startIcon={<History size={18} />}>Order & Receiving History</Button></Stack>
        <StockRequestForm key={formVersion} onSaved={() => { setSnack('Stock request submitted successfully.'); setPage(0); setRefresh(value => value + 1); }} />
        <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Submitted Requests</Typography>
        {error && <Alert severity="error" action={<Button onClick={() => setRefresh(value => value + 1)}>Retry</Button>} sx={{ mb: 2 }}>{error}</Alert>}
        <Card sx={{ borderRadius: 3 }}>
            <Grid container spacing={2} sx={{ p: 2 }}><Grid size={{ xs: 12, md: 6 }}><TextField fullWidth size="small" label="Search request, item, vendor or requester" value={query} onChange={event => setQuery(event.target.value)} /></Grid><Grid size={{ xs: 6, md: 3 }}><TextField select fullWidth size="small" label="Approval status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><MenuItem value="">All requests</MenuItem><MenuItem value="pending">Pending</MenuItem><MenuItem value="approved">Approved</MenuItem><MenuItem value="rejected">Rejected</MenuItem></TextField></Grid><Grid size={{ xs: 6, md: 3 }}><TextField select fullWidth size="small" label="Delivery status" value={delivery} onChange={event => { setDelivery(event.target.value); setPage(0); }}><MenuItem value="">All deliveries</MenuItem><MenuItem value="not_received">Not received</MenuItem><MenuItem value="partial">Partial</MenuItem><MenuItem value="complete">Complete</MenuItem></TextField></Grid></Grid>
            {loading ? <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress size={30} /></Box> : <TableContainer><Table size="small" sx={{ minWidth: 900 }}><TableHead><TableRow>{['Request / Date', 'Items', 'Vendors', 'Approval', 'Delivery', 'Requested by', ''].map((label, index) => <TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
                {requests.map(request => {
                    const restock = request.requestType === 'restock';
                    const names = restock ? (request.items || []).map(item => item.name) : [request.productData?.name || 'Product request'];
                    const vendors = request.vendors || [];
                    return <TableRow key={request._id} hover>
                        <TableCell sx={{ py: 1.5 }}><Typography fontWeight={700} variant="body2">#{request._id.slice(-8).toUpperCase()}</Typography><Typography variant="caption" color="text.secondary">{new Date(request.createdAt).toLocaleDateString()}</Typography></TableCell>
                        <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 220 }} title={names.join(', ')}>{names.slice(0, 2).join(', ')}{names.length > 2 ? ` +${names.length - 2} more` : ''}</Typography><Typography variant="caption" color="text.secondary">{restock ? `${names.length} item${names.length === 1 ? '' : 's'}` : request.productData?.sku}</Typography></TableCell>
                        <TableCell><Typography noWrap variant="body2" sx={{ maxWidth: 180 }} title={vendors.map(vendor => vendor.name).join(', ')}>{vendors[0]?.name || '-'}{vendors.length > 1 ? ` +${vendors.length - 1}` : ''}</Typography></TableCell>
                        <TableCell><Chip size="small" label={request.status} color={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'error' : 'warning'} sx={{ textTransform: 'capitalize' }} /></TableCell>
                        <TableCell>{restock ? <Chip size="small" variant="outlined" label={request.deliveryStatus === 'complete' ? 'Complete' : request.deliveryStatus === 'partial' ? 'Partial' : 'Not received'} color={request.deliveryStatus === 'complete' ? 'success' : request.deliveryStatus === 'partial' ? 'warning' : 'default'} /> : '-'}</TableCell>
                        <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>{request.requestedByName}</Typography></TableCell>
                        <TableCell align="right"><Button size="small" startIcon={<Eye size={16} />} onClick={() => setSelected(request)} sx={{ whiteSpace: 'nowrap' }}>View Details</Button></TableCell>
                    </TableRow>;
                })}
                {!requests.length && <TableRow><TableCell colSpan={7}><Typography align="center" color="text.secondary" sx={{ py: 4 }}>No requests found. Adjust your filters or create a stock request above.</Typography></TableCell></TableRow>}
            </TableBody></Table></TableContainer>}
            <TablePagination component="div" count={total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10, 25, 50]} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={event => { setPageSize(Number(event.target.value)); setPage(0); }} />
        </Card>
    </Box>;
}
