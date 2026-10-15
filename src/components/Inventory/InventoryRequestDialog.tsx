import React from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store';
import api from '../../api/axios';
import { fetchProducts } from '../../features/inventory/inventorySlice';
import { downloadStockRequest, type InventoryRequestRecord } from '../../lib/inventoryRequestExports';
import { printReceipt } from '../../lib/printReceipt';
import StockRequestDetails from './StockRequestDetails';
import StockRequestSlip from './StockRequestSlip';

export default function InventoryRequestDialog({ request, onClose, onChanged }: { request: InventoryRequestRecord; onClose: () => void; onChanged: (request: InventoryRequestRecord, notice: string) => void }) {
    const dispatch = useDispatch<AppDispatch>();
    const user = useSelector((state: RootState) => state.auth.user);
    const shopName = useSelector((state: RootState) => state.settings.app?.shopName || 'ItemHive');
    const isManager = user?.role === 'admin' || user?.role === 'super_admin';
    const [note, setNote] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);
    const [printing, setPrinting] = React.useState(false);
    const [error, setError] = React.useState('');
    const review = async (status: 'approved' | 'rejected') => {
        setBusy(true); setError('');
        try {
            const { data } = await api.patch<{ request: InventoryRequestRecord }>(`/inventory-requests/${request._id}/review`, { status, decisionNote: note });
            onChanged(data.request, `Request ${status} successfully.`);
            if (status === 'approved' && request.requestType !== 'restock') void dispatch(fetchProducts({ force: true }));
        } catch (failure) { setError((failure as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to review this request.'); }
        finally { setBusy(false); }
    };
    const download = async (format: 'pdf' | 'xlsx') => {
        setExporting(true); setError('');
        try { await downloadStockRequest(request, format); }
        catch { setError('Unable to download the request. Please retry.'); }
        finally { setExporting(false); }
    };
    const print = async () => {
        setPrinting(true); setError('');
        try {
            const id = `stock-request-slip-${request._id}`;
            const element = document.getElementById(id);
            if (!element) throw new Error('Slip unavailable');
            await printReceipt(element, `#${id}`, 58);
        } catch { setError('Unable to prepare the slip for printing.'); }
        finally { setPrinting(false); }
    };
    return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!busy && !printing) onClose(); }}>
        <DialogTitle><Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}><Box><Typography component="span" variant="h6" fontWeight={800}>{request.requestType === 'restock' ? `Stock Request (${request.items?.length || 0} items)` : request.productData?.name || 'Product Request'}</Typography><Typography variant="caption" display="block" color="text.secondary">Request #{request._id}</Typography></Box><Chip label={request.status} color={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'error' : 'warning'} sx={{ textTransform: 'capitalize' }} /></Stack></DialogTitle>
        <DialogContent dividers>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {request.requestType === 'restock' ? <StockRequestDetails key={`${request._id}-${request.__v || 0}`} request={request} onUpdated={updated => {
                onChanged({ ...request, ...updated } as InventoryRequestRecord, 'Delivery and receiving record saved.');
                void dispatch(fetchProducts({ force: true }));
            }} /> : request.productData && <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>SKU {request.productData.sku} / {request.productData.category}</Typography>
                <Grid container spacing={2}>{[['Purchase Price', request.productData.purchasePrice], ['Sale Price', request.productData.salePrice], ['Requested Stock', request.productData.stock], ['Min Stock', request.productData.minStock]].map(([label, value]) => <Grid size={{ xs: 6 }} key={String(label)}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Grid>)}</Grid>
                {request.productData.description && <Typography variant="body2" sx={{ mt: 2 }}>{request.productData.description}</Typography>}
            </Box>}
            <Box sx={{ mt: 2 }}><Typography variant="caption" color="text.secondary">Requested By</Typography><Typography variant="body2" fontWeight={700}>{request.requestedByName} / {request.requestedByEmail}</Typography><Typography variant="caption" color="text.secondary">{new Date(request.createdAt).toLocaleString()}</Typography></Box>
            {request.requestType === 'restock' && <>
                <Stack direction="row" gap={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}><Button size="small" variant="outlined" disabled={exporting} onClick={() => void download('pdf')}>Download PDF</Button><Button size="small" variant="outlined" disabled={exporting} onClick={() => void download('xlsx')}>Download Excel</Button><Button size="small" variant="outlined" startIcon={<Printer size={16} />} disabled={printing} onClick={() => void print()}>{printing ? 'Preparing...' : 'Print Slip'}</Button></Stack>
                <StockRequestSlip request={request} shopName={shopName} />
            </>}
            {isManager && request.status === 'pending' && <Stack spacing={1.5} sx={{ mt: 2.5 }}><TextField label="Decision note" size="small" value={note} onChange={event => setNote(event.target.value)} disabled={busy} /><Stack direction="row" gap={1}><Button variant="contained" color="success" startIcon={<CheckCircle2 size={16} />} disabled={busy} onClick={() => void review('approved')}>Approve</Button><Button variant="outlined" color="error" startIcon={<XCircle size={16} />} disabled={busy || request.items?.some(item => (item.receivedQuantity || 0) > 0)} onClick={() => void review('rejected')}>Reject</Button></Stack></Stack>}
            {request.status !== 'pending' && <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}><Typography variant="body2" fontWeight={700}>Reviewed by {request.reviewedByName || 'Admin'}</Typography>{request.decisionNote && <Typography variant="body2">{request.decisionNote}</Typography>}</Box>}
        </DialogContent>
        <DialogActions><Button disabled={busy || printing} onClick={onClose}>Close</Button></DialogActions>
    </Dialog>;
}
