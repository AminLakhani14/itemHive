import { Box, Divider, Stack, Typography } from '@mui/material';
import type { RequestReceipt } from '../../lib/inventoryRequestExports';

export default function InventoryReceiptSlip({ receipt, requestId, shopName }: { receipt: RequestReceipt; requestId: string; shopName: string }) {
    return <Box id={`inventory-receipt-${receipt._id}`} sx={{ display: 'none', bgcolor: '#fff', color: '#000' }}>
        <Typography fontWeight={900} align="center">STOCK RECEIPT</Typography>
        <Typography align="center" variant="caption" display="block">{shopName}</Typography>
        <Divider sx={{ my: 1, borderStyle: 'dashed', borderColor: 'currentColor' }} />
        <Typography variant="caption" display="block">Receipt: {receipt._id}</Typography>
        <Typography variant="caption" display="block">Order: {requestId}</Typography>
        <Typography variant="caption" display="block">Date: {receipt.occurredAt ? new Date(receipt.occurredAt).toLocaleString() : 'Earlier date unavailable'}</Typography>
        <Typography variant="caption" display="block">Received by: {receipt.receivedByName || 'Unavailable'}</Typography>
        {receipt.reference && <Typography variant="caption" display="block">Reference: {receipt.reference}</Typography>}
        {receipt.kind === 'opening_balance' && <Typography variant="caption" display="block">Earlier total received balance; individual delivery details unavailable.</Typography>}
        <Divider sx={{ my: 1, borderStyle: 'dashed', borderColor: 'currentColor' }} />
        <Stack spacing={1}>{receipt.items.map((item, index) => <Box key={index} sx={{ breakInside: 'avoid' }}>
            <Box className="kitchen-ticket-item"><Typography variant="body2" fontWeight={700}>{item.name}</Typography><Typography variant="body2" fontWeight={900}>+{item.quantity}</Typography></Box>
            <Typography variant="caption" display="block">Unit: {item.unit} | Vendor: {item.vendorName || '-'}</Typography>
            <Typography variant="caption" display="block">Ordered: {item.orderedQuantity} | Total received: {item.totalReceived} | Missing: {item.remaining}</Typography>
            <Typography variant="caption" display="block">{item.stockAction === 'product_updated' ? `POS updated: ${item.productName || item.sku || item.productId}` : item.stockAction === 'record_only' ? 'Order record only; POS not updated' : 'Earlier stock action unavailable'}</Typography>
        </Box>)}</Stack>
        {receipt.note && <Typography variant="caption" display="block" sx={{ mt: 1 }}>Note: {receipt.note}</Typography>}
    </Box>;
}
