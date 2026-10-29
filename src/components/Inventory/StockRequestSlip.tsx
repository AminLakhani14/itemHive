import { Box, Divider, Stack, Typography } from '@mui/material';
import type { StockRequestData } from '../../lib/inventoryRequestExports';

export default function StockRequestSlip({ request, shopName }: { request: StockRequestData; shopName: string }) {
    const divider = <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', my: 1 }} />;

    return <Box id={`stock-request-slip-${request._id}`} sx={{ display: 'none', color: '#000', bgcolor: '#fff' }}>
        <Typography align="center" fontWeight={900}>INVENTORY REQUEST</Typography>
        <Typography align="center" variant="caption" display="block">{shopName || 'Ozor'}</Typography>
        {divider}
        <Stack spacing={0.4}>
            <Typography variant="caption">Request: {request._id}</Typography>
            <Typography variant="caption">Date: {new Date(request.createdAt).toLocaleString()}</Typography>
            <Typography variant="caption">Requested by: {request.requestedByName}</Typography>
            <Typography variant="caption">Email: {request.requestedByEmail}</Typography>
            <Typography variant="caption">Status: {request.status}</Typography>
            <Typography variant="caption">Delivery: {request.deliveryStatus === 'complete' ? 'Complete' : request.deliveryStatus === 'partial' ? 'Partially received' : 'Not received'}</Typography>
        </Stack>
        {divider}
        <Typography fontWeight={900}>VENDORS</Typography>
        <Stack spacing={1} sx={{ mt: 0.5 }}>
            {request.vendors?.map((vendor, index) => <Box key={vendor.id}>
                <Typography variant="body2" fontWeight={700}>{index + 1}. {vendor.name}</Typography>
                {vendor.phone && <Typography variant="caption" display="block">Phone: {vendor.phone}</Typography>}
                {vendor.cnic && <Typography variant="caption" display="block">CNIC: {vendor.cnic}</Typography>}
                {vendor.address && <Typography variant="caption" display="block">{vendor.address}</Typography>}
            </Box>)}
        </Stack>
        {divider}
        <Typography fontWeight={900}>STOCK REQUIRED</Typography>
        <Stack spacing={1} sx={{ mt: 0.5 }}>
            {request.items?.map((item, index) => <Box key={index} sx={{ breakInside: 'avoid' }}>
                <Box className="kitchen-ticket-item" sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body2" fontWeight={700}>{index + 1}. {item.name}</Typography>
                    <Typography variant="body2" fontWeight={900}>x{item.quantity}</Typography>
                </Box>
                <Typography variant="caption" display="block">{item.sku ? `SKU: ${item.sku} | ` : ''}Unit: {item.unit}</Typography>
                {item.category && <Typography variant="caption" display="block">Category: {item.category}</Typography>}
                <Typography variant="caption" display="block">{item.productId ? `POS link: ${item.productName || item.sku || item.productId}` : 'Record only - no POS stock update'}</Typography>
                <Typography variant="caption" display="block">Received: {item.receivedQuantity || 0} | Missing: {Number((item.quantity - (item.receivedQuantity || 0)).toPrecision(15))}</Typography>
                <Typography variant="caption" display="block">Vendor: {request.vendors?.find(vendor => vendor.id === item.vendorId)?.name || '-'}</Typography>
                {item.remarks && <Typography variant="caption" display="block">Note: {item.remarks}</Typography>}
            </Box>)}
        </Stack>
        {divider}
        {request.decisionNote && <Typography variant="caption" display="block">Decision: {request.decisionNote}</Typography>}
        <Typography align="center" variant="caption" display="block" fontWeight={700}>Required stock - procurement request</Typography>
    </Box>;
}
