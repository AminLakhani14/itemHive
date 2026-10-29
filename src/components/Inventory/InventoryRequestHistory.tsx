import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { ArrowLeft, Printer } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import api from '../../api/axios';
import { printReceipt } from '../../lib/printReceipt';
import type { StockRequestData, RequestReceipt } from '../../lib/inventoryRequestExports';
import InventoryReceiptSlip from './InventoryReceiptSlip';
import { selectPrintSettings } from '../../features/branch/branchSlice';

export default function InventoryRequestHistory({ requests, initialRequest, onClose }: { requests: StockRequestData[]; initialRequest?: StockRequestData; onClose: () => void }) {
    const [selected, setSelected] = React.useState(initialRequest);
    const [detail, setDetail] = React.useState<StockRequestData>();
    const [receipts, setReceipts] = React.useState<RequestReceipt[]>([]);
    const [search, setSearch] = React.useState('');
    const [loading, setLoading] = React.useState(Boolean(initialRequest));
    const [error, setError] = React.useState('');
    const [printing, setPrinting] = React.useState('');
    const shopName = useSelector((state: RootState) => selectPrintSettings(state).shopName || 'Ozor');
    const load = React.useCallback(async () => {
        if (!selected) return;
        setLoading(true); setError(''); setDetail(undefined); setReceipts([]);
        try {
            const { data } = await api.get<{ request: StockRequestData; receipts: RequestReceipt[] }>(`/inventory-requests/${selected._id}/history`);
            setDetail(data.request); setReceipts(data.receipts);
        } catch { setError('Unable to load receiving history. Please retry.'); }
        finally { setLoading(false); }
    }, [selected]);
    React.useEffect(() => { void load(); }, [load]);
    const print = async (receipt: RequestReceipt) => {
        setPrinting(receipt._id); setError('');
        try {
            const id = `inventory-receipt-${receipt._id}`;
            const element = document.getElementById(id);
            if (!element) throw new Error('Receipt unavailable');
            await printReceipt(element, `#${id}`, 58);
        } catch { setError('Unable to prepare this receipt for printing.'); }
        finally { setPrinting(''); }
    };
    const records = requests.filter(request => [request._id, request.requestedByName, ...(request.items || []).map(item => item.name), ...(request.vendors || []).map(vendor => vendor.name)].join(' ').toLowerCase().includes(search.toLowerCase()));
    return <Dialog open fullWidth maxWidth="lg" onClose={() => { if (!printing) onClose(); }}>
        <DialogTitle>Order & Receiving History</DialogTitle>
        <DialogContent dividers>
            {!selected ? <>
                <TextField size="small" fullWidth label="Search order, item or vendor" value={search} onChange={event => setSearch(event.target.value)} sx={{ mb: 2 }} />
                {!records.length && <Alert severity="info">No matching order records.</Alert>}
                <Stack spacing={1.5}>{records.map(request => <Box key={request._id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Typography fontWeight={700}>Order #{request._id}</Typography><Typography variant="caption" color="text.secondary">{new Date(request.createdAt).toLocaleString()} / {request.requestedByName}</Typography><Typography variant="body2">{request.items?.map(item => `${item.name}: ${item.quantity} ${item.unit}`).join(', ')}</Typography><Typography variant="caption" color="text.secondary">Vendors: {request.vendors?.map(vendor => vendor.name).join(', ')}</Typography></Box><Button onClick={() => setSelected(request)}>View Records</Button></Stack>
                </Box>)}</Stack>
            </> : <>
                {requests.length > 1 && <Button startIcon={<ArrowLeft size={16} />} disabled={Boolean(printing)} onClick={() => { setSelected(undefined); setError(''); }} sx={{ mb: 2 }}>All Orders</Button>}
                {error && <Alert severity="error" action={<Button onClick={() => void load()}>Retry</Button>} sx={{ mb: 2 }}>{error}</Alert>}
                {loading && <CircularProgress size={28} />}
                {detail && <>
                    <Typography fontWeight={800}>Order #{detail._id}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Placed {new Date(detail.createdAt).toLocaleString()} by {detail.requestedByName} / {detail.status}</Typography>
                    {detail.decisionNote && <Typography variant="body2" sx={{ mb: 2 }}>Review note: {detail.decisionNote}</Typography>}
                    <TableContainer sx={{ mb: 3 }}><Table size="small" sx={{ minWidth: 550 }}><TableHead><TableRow>{['Ordered Item / Vendor', 'Ordered', 'Received', 'Missing', 'POS link'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{detail.items?.map((item, index) => <TableRow key={index}><TableCell>{item.name}<Typography variant="caption" display="block">{detail.vendors?.find(vendor => vendor.id === item.vendorId)?.name}</Typography></TableCell><TableCell>{item.quantity} {item.unit}</TableCell><TableCell>{item.receivedQuantity || 0}</TableCell><TableCell>{Number((item.quantity - (item.receivedQuantity || 0)).toPrecision(15))}</TableCell><TableCell>{item.productId ? item.productName || item.sku || item.productId : 'Record only'}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
                    <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Receiving Records ({receipts.length})</Typography>
                    {!receipts.length && <Alert severity="info">{detail.items?.some(item => (item.receivedQuantity || 0) > 0) ? 'This order has an earlier received balance shown above. Individual deliveries were not recorded before history was introduced.' : 'No deliveries received yet. The order record is saved above.'}</Alert>}
                    <Stack spacing={2}>{receipts.map((receipt, index) => <Box key={receipt._id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                        <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap"><Box><Typography fontWeight={800}>{receipt.kind === 'opening_balance' ? 'Earlier Received Balance' : `Delivery ${receipts.slice(0, index + 1).filter(record => record.kind === 'delivery').length}`} / #{receipt._id.slice(-8).toUpperCase()}</Typography><Typography variant="caption" color="text.secondary">{receipt.occurredAt ? new Date(receipt.occurredAt).toLocaleString() : 'Earlier date unavailable'} / {receipt.receivedByName || 'User unavailable'}</Typography></Box><Button size="small" disabled={Boolean(printing)} startIcon={<Printer size={16} />} onClick={() => void print(receipt)}>{printing === receipt._id ? 'Preparing...' : 'Print Receipt'}</Button></Stack>
                        {receipt.reference && <Typography variant="body2" sx={{ mt: 1 }}>Reference: {receipt.reference}</Typography>}
                        {receipt.note && <Typography variant="body2" sx={{ mt: 1 }}>{receipt.note}</Typography>}
                        <Stack spacing={1} sx={{ mt: 1.5 }}>{receipt.items.map((item, lineIndex) => <Box key={lineIndex} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                            <Typography fontWeight={700} variant="body2">{item.name}: +{item.quantity} {item.unit}</Typography><Typography variant="caption" display="block">Vendor: {item.vendorName || '-'} / Ordered: {item.orderedQuantity} / Total received: {item.totalReceived} / Missing: {item.remaining}</Typography>
                            <Chip size="small" sx={{ mt: 0.75 }} color={item.stockAction === 'product_updated' ? 'success' : 'default'} label={item.stockAction === 'product_updated' ? `POS updated: ${item.productName || item.sku || item.productId}` : item.stockAction === 'record_only' ? 'Record only - POS not updated' : 'Earlier stock action unavailable'} />
                        </Box>)}</Stack>
                        <InventoryReceiptSlip receipt={receipt} requestId={detail._id} shopName={shopName} />
                    </Box>)}</Stack>
                </>}
            </>}
        </DialogContent>
        <DialogActions><Button disabled={Boolean(printing)} onClick={onClose}>Close</Button></DialogActions>
    </Dialog>;
}
