import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { ChevronDown, History, PackageCheck } from 'lucide-react';
import api from '../../api/axios';
import type { StockRequestData } from '../../lib/inventoryRequestExports';
import InventoryRequestHistory from './InventoryRequestHistory';
import InventoryProductLink from './InventoryProductLink';
import useInventoryRequestProducts from '../../hooks/useInventoryRequestProducts';
import { productLinkError } from '../../lib/inventoryProductLinks';

const remaining = (quantity: number, received = 0) => Number(Math.max(0, quantity - received).toPrecision(15));

export default function StockRequestDetails({ request, onUpdated }: { request: StockRequestData; onUpdated: (request: StockRequestData) => void }) {
    const [open, setOpen] = React.useState(false);
    const [quantities, setQuantities] = React.useState<string[]>([]);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [links, setLinks] = React.useState<{ productId: string; sizeId: string }[]>([]);
    const [reference, setReference] = React.useState('');
    const [note, setNote] = React.useState('');
    const productOptions = useInventoryRequestProducts(open);
    const items = request.items || [];
    const complete = items.length > 0 && items.every(item => (item.receivedQuantity || 0) === item.quantity);
    const partial = items.some(item => (item.receivedQuantity || 0) > 0);
    const outstanding = items.filter(item => remaining(item.quantity, item.receivedQuantity) > 0);
    const progress = items.length ? items.reduce((sum, item) => sum + (item.receivedQuantity || 0) / item.quantity, 0) / items.length * 100 : 0;
    const showDelivery = () => {
        setQuantities(items.map(item => String(item.receivedQuantity || 0)));
        setLinks(items.map(item => ({ productId: item.productId || '', sizeId: item.sizeId || '' })));
        setReference(''); setNote(''); setError(''); setOpen(true);
    };
    const save = async () => {
        if (quantities.some((value, index) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < (items[index].receivedQuantity || 0) || Number(value) > items[index].quantity)) {
            setError('Total received must be at least the previously received amount and no greater than the ordered quantity.'); return;
        }
        for (let index = 0; index < items.length; index++) {
            if (!links[index]?.productId) continue;
            const linkError = productLinkError(productOptions.products.find(product => product.id === links[index].productId), { ...links[index], unit: items[index].unit, quantity: Number(quantities[index]) - (items[index].receivedQuantity || 0) });
            if (linkError) { setError(`${items[index].name}: ${linkError}`); return; }
        }
        setSaving(true); setError('');
        try {
            const { data } = await api.patch<{ request: StockRequestData }>(`/inventory-requests/${request._id}/receive`, { version: request.__v || 0, receivedQuantities: quantities.map(Number), links, reference, note });
            onUpdated(data.request); setOpen(false);
        } catch (failure) {
            setError((failure as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unable to save delivery. Please retry.');
        } finally { setSaving(false); }
    };

    return <Box sx={{ mt: 2 }}>
        {historyOpen && <InventoryRequestHistory requests={[request]} initialRequest={request} onClose={() => setHistoryOpen(false)} />}
        <Box sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}><Typography fontWeight={800}>Delivery</Typography><Chip size="small" color={complete ? 'success' : partial ? 'warning' : 'default'} label={complete ? 'Complete' : partial ? 'Partially received' : 'Not received'} /></Stack>
            <LinearProgress variant="determinate" value={progress} color={complete ? 'success' : 'primary'} sx={{ height: 6, borderRadius: 3 }} />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>{complete ? 'All ordered items have arrived.' : `${outstanding.length} of ${items.length} items still have outstanding quantities.`}</Typography>
            {request.receivedAt && <Typography variant="caption" color="text.secondary" display="block">Last received: {new Date(request.receivedAt).toLocaleString()} by {request.receivedByName || '-'}</Typography>}
            {!complete && request.status !== 'rejected' && <Button startIcon={<PackageCheck size={16} />} onClick={showDelivery} sx={{ mt: 1 }}>Update Delivery</Button>}
            <Button startIcon={<History size={16} />} onClick={() => setHistoryOpen(true)} sx={{ mt: 1 }}>History</Button>
        </Box>
        <Accordion defaultExpanded disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '10px !important', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={700}>Ordered Stock ({items.length})</Typography></AccordionSummary>
            <AccordionDetails sx={{ px: 1 }}><TableContainer><Table size="small" sx={{ minWidth: 560 }}><TableHead><TableRow>{['Item / Vendor', 'Ordered', 'Received', 'Missing'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
                {items.map((item, index) => <TableRow key={index}><TableCell><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="caption" display="block" color="text.secondary">{item.sku || 'Material'} / {request.vendors?.find(vendor => vendor.id === item.vendorId)?.name || '-'}</Typography>{item.remarks && <Typography variant="caption" display="block">{item.remarks}</Typography>}</TableCell><TableCell>{item.quantity} {item.unit}</TableCell><TableCell>{item.receivedQuantity || 0}</TableCell><TableCell><Typography variant="body2" fontWeight={700} color={remaining(item.quantity, item.receivedQuantity) ? 'warning.main' : 'success.main'}>{remaining(item.quantity, item.receivedQuantity)}</Typography></TableCell></TableRow>)}
            </TableBody></Table></TableContainer></AccordionDetails>
        </Accordion>
        <Accordion disableGutters elevation={0} sx={{ mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: '10px !important', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography fontWeight={700}>Vendor Details ({request.vendors?.length || 0})</Typography></AccordionSummary>
            <AccordionDetails><Stack spacing={1.5}>{request.vendors?.map(vendor => <Box key={vendor.id}><Typography fontWeight={700} variant="body2">{vendor.name}</Typography><Typography variant="caption" display="block">{vendor.phone || 'No contact number'}</Typography>{vendor.cnic && <Typography variant="caption" display="block">CNIC: {vendor.cnic}</Typography>}{vendor.address && <Typography variant="caption" display="block">{vendor.address}</Typography>}</Box>)}</Stack></AccordionDetails>
        </Accordion>
        <Dialog open={open} fullWidth maxWidth="md" onClose={() => { if (!saving) setOpen(false); }}>
            <DialogTitle>Receive Stock</DialogTitle>
            <DialogContent dividers>
                <Alert severity="info" sx={{ mb: 2 }}>Enter total received so far. Only newly received quantities linked to an existing product update POS stock. Unlinked items keep an order and receiving record. Links apply to future deliveries only.</Alert>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Button disabled={saving} onClick={() => setQuantities(items.map(item => String(item.quantity)))} sx={{ mb: 1 }}>Mark all items fully received</Button>
                <TableContainer><Table size="small" sx={{ minWidth: 540 }}><TableHead><TableRow>{['Item', 'Ordered', 'Total received', 'Still missing'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
                    {items.map((item, index) => <TableRow key={index}><TableCell><Typography fontWeight={700} variant="body2">{item.name}</Typography><Typography variant="caption">{request.vendors?.find(vendor => vendor.id === item.vendorId)?.name}</Typography></TableCell><TableCell>{item.quantity} {item.unit}</TableCell><TableCell><TextField disabled={saving} size="small" type="number" value={quantities[index] || ''} onChange={event => setQuantities(current => current.map((value, i) => i === index ? event.target.value : value))} slotProps={{ htmlInput: { min: item.receivedQuantity || 0, max: item.quantity, step: 'any', 'aria-label': `Total received for ${item.name}` } }} helperText={`Already received: ${item.receivedQuantity || 0}`} /></TableCell><TableCell>{remaining(item.quantity, Number(quantities[index]) || 0)} {item.unit}</TableCell></TableRow>)}
                </TableBody></Table></TableContainer>
                {productOptions.error && <Alert severity="warning" action={<Button onClick={() => void productOptions.reload()}>Retry</Button>} sx={{ mt: 2 }}>{productOptions.error}</Alert>}
                <Typography fontWeight={800} sx={{ mt: 3, mb: 1.5 }}>Product Links for This Delivery</Typography>
                <Stack spacing={2}>{items.map((item, index) => <Box key={index} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>{item.name} / Order unit: {item.unit}</Typography>
                    <InventoryProductLink products={productOptions.products} loading={productOptions.loading} disabled={saving} productId={links[index]?.productId} sizeId={links[index]?.sizeId} onChange={(productId, sizeId) => setLinks(current => current.map((link, i) => i === index ? { productId, sizeId } : link))} />
                </Box>)}</Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
                    <TextField fullWidth disabled={saving} label="Delivery / Invoice reference (optional)" value={reference} onChange={event => setReference(event.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
                    <TextField fullWidth disabled={saving} label="Receiving note (optional)" value={note} onChange={event => setNote(event.target.value)} slotProps={{ htmlInput: { maxLength: 600 } }} />
                </Stack>
            </DialogContent>
            <DialogActions><Button disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || (productOptions.loading && links.some(link => link.productId))} variant="contained" onClick={() => void save()}>{saving ? 'Saving...' : 'Save Delivery'}</Button></DialogActions>
        </Dialog>
    </Box>;
}
