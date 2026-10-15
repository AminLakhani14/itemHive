import React from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { History } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import type { RequestVendor, StockRequestData } from '../../lib/inventoryRequestExports';
import InventoryVendorPicker from '../../components/Inventory/InventoryVendorPicker';
import InventoryRequestHistory from '../../components/Inventory/InventoryRequestHistory';

export default function VendorHistoryPage() {
    const [params, setParams] = useSearchParams();
    const vendorId = params.get('vendorId') || '';
    const [selectedVendor, setSelectedVendor] = React.useState<RequestVendor | null>(() => vendorId ? { id: vendorId, name: params.get('vendorName') || vendorId, phone: '', address: '' } : null);
    const [requests, setRequests] = React.useState<StockRequestData[]>([]);
    const [total, setTotal] = React.useState(0);
    const [page, setPage] = React.useState(0);
    const [pageSize, setPageSize] = React.useState(25);
    const [query, setQuery] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [delivery, setDelivery] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [refresh, setRefresh] = React.useState(0);
    const [viewing, setViewing] = React.useState<StockRequestData | null>(null);
    const vendorFilter = vendorId ? selectedVendor?.id === vendorId ? selectedVendor : { id: vendorId, name: params.get('vendorName') || vendorId, phone: '', address: '' } : null;
    React.useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(0); }, 300); return () => clearTimeout(timer); }, [query]);
    React.useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        api.get<{ requests: StockRequestData[]; total: number }>('/inventory-requests/vendor-history', { params: { page, pageSize, q: search, vendorId, deliveryStatus: delivery } })
            .then(({ data }) => { if (active) { setRequests(data.requests); setTotal(data.total); } })
            .catch(() => { if (active) setError('Unable to load vendor history. Please retry.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [page, pageSize, search, vendorId, delivery, refresh]);
    React.useEffect(() => {
        const reset = () => { setViewing(null); setSelectedVendor(null); setParams({}); setRequests([]); setPage(0); setQuery(''); setDelivery(''); setRefresh(value => value + 1); };
        window.addEventListener('itemhive-workspace-changed', reset);
        return () => window.removeEventListener('itemhive-workspace-changed', reset);
    }, [setParams]);
    return <Box>
        {viewing && <InventoryRequestHistory requests={[viewing]} initialRequest={viewing} onClose={() => setViewing(null)} />}
        <Typography variant="h4" fontWeight={800}>Vendor History</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>View vendor orders, received quantities, outstanding items and previous receiving receipts.</Typography>
        {error && <Alert severity="error" action={<Button onClick={() => setRefresh(value => value + 1)}>Retry</Button>} sx={{ mb: 2 }}>{error}</Alert>}
        <Card sx={{ borderRadius: 3 }}>
            <Grid container spacing={2} sx={{ p: 2.5 }}>
                <Grid size={{ xs: 12, md: 4 }}><InventoryVendorPicker value={vendorFilter} includeArchived onChange={vendor => { setSelectedVendor(vendor); setParams(vendor ? { vendorId: vendor.id, vendorName: vendor.name } : {}); setPage(0); }} /></Grid>
                <Grid size={{ xs: 12, sm: 7, md: 5 }}><TextField fullWidth size="small" label="Search item, vendor, phone or CNIC" value={query} onChange={event => setQuery(event.target.value)} /></Grid>
                <Grid size={{ xs: 12, sm: 5, md: 3 }}><TextField select fullWidth size="small" label="Delivery status" value={delivery} onChange={event => { setDelivery(event.target.value); setPage(0); }}><MenuItem value="">All orders</MenuItem><MenuItem value="not_received">Not received</MenuItem><MenuItem value="partial">Partially received</MenuItem><MenuItem value="complete">Complete</MenuItem></TextField></Grid>
            </Grid>
            {loading ? <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress size={30} /></Box> : <TableContainer><Table sx={{ minWidth: 940 }}><TableHead><TableRow>{['Order / Date', 'Vendor', 'Items / Ordered', 'Received / Missing', 'Status', 'Records'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
                {requests.map(request => {
                    const items = (request.items || []).filter(item => !vendorId || item.vendorId === vendorId);
                    const vendors = (request.vendors || []).filter(vendor => !vendorId || vendor.id === vendorId);
                    return <TableRow key={request._id}>
                        <TableCell><Typography variant="body2" fontWeight={700}>#{request._id.slice(-8).toUpperCase()}</Typography><Typography variant="caption" display="block">{new Date(request.createdAt).toLocaleString()}</Typography><Typography variant="caption" color="text.secondary">{request.requestedByName}</Typography></TableCell>
                        <TableCell>{vendors.map(vendor => <Box key={vendor.id} sx={{ mb: 0.75 }}><Typography variant="body2" fontWeight={700}>{vendor.name}</Typography><Typography variant="caption">{vendor.phone}</Typography></Box>)}</TableCell>
                        <TableCell>{items.map((item, index) => <Typography key={index} variant="body2" sx={{ mb: 0.75 }}>{item.name}: {item.quantity} {item.unit}</Typography>)}</TableCell>
                        <TableCell>{items.map((item, index) => <Box key={index} sx={{ mb: 0.75 }}><Typography variant="body2">{item.receivedQuantity || 0} {item.unit} received</Typography><Typography variant="caption" color={item.quantity > (item.receivedQuantity || 0) ? 'warning.main' : 'success.main'}>{Number((item.quantity - (item.receivedQuantity || 0)).toPrecision(15))} {item.unit} missing</Typography></Box>)}</TableCell>
                        <TableCell><Stack gap={0.75} alignItems="flex-start"><Chip size="small" label={request.deliveryStatus === 'complete' ? 'Complete' : request.deliveryStatus === 'partial' ? 'Partial' : 'Not received'} color={request.deliveryStatus === 'complete' ? 'success' : request.deliveryStatus === 'partial' ? 'warning' : 'default'} /><Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{request.status}</Typography></Stack></TableCell>
                        <TableCell><Button startIcon={<History size={16} />} onClick={() => setViewing(request)}>View History</Button></TableCell>
                    </TableRow>;
                })}
                {!requests.length && <TableRow><TableCell colSpan={6}><Typography align="center" sx={{ py: 3 }} color="text.secondary">No orders found for these filters.</Typography></TableCell></TableRow>}
            </TableBody></Table></TableContainer>}
            <TablePagination component="div" count={total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10, 25, 50, 100]} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={event => { setPageSize(Number(event.target.value)); setPage(0); }} />
        </Card>
    </Box>;
}
