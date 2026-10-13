import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Stack, Typography } from '@mui/material';
import { BellRing, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { OrderDraft } from '../../types/orderDraft';
import useTableOrders from '../../hooks/useTableOrders';
import useAppCurrency from '../../hooks/useAppCurrency';
import { hasScreenAccess } from '../../lib/screenPermissions';

const NOTICE_MS = 30_000;
// Orders already announced in this session (dismissed or timed out), so returning to POS does not repeat them.
let announcedOrders: string[] = [];

type Props = {
    compact?: boolean;
    activeDraftId?: string | null;
    activeDraftUpdatedAt?: string;
    confirmSwitch?: boolean;
    busy?: boolean;
    onOpenOrder?: (draft: OrderDraft) => void;
};

export default function TableOrdersPanel({ compact = false, activeDraftId, activeDraftUpdatedAt, confirmSwitch, busy, onOpenOrder }: Props) {
    const navigate = useNavigate();
    const { app } = useSelector((state: RootState) => state.settings);
    const user = useSelector((state: RootState) => state.auth.user);
    const enabled = Boolean(app?.restaurantEnabled);
    const { orders, loading, error } = useTableOrders(enabled);
    const { formatCurrency } = useAppCurrency();
    const [switchTo, setSwitchTo] = useState<OrderDraft | null>(null);
    const [announced, setAnnounced] = useState(announcedOrders);
    // A new order, or a change to one, shows the notice again for another 30 seconds.
    const orderKeys = orders.map(order => `${order._id}:${order.updatedAt}`).join('|');
    const showNotice = orders.some(order => !announced.includes(`${order._id}:${order.updatedAt}`));
    const dismissNotice = () => { announcedOrders = orderKeys.split('|'); setAnnounced(announcedOrders); };
    useEffect(() => {
        if (!compact || !showNotice) return;
        const timer = window.setTimeout(() => { announcedOrders = orderKeys.split('|'); setAnnounced(announcedOrders); }, NOTICE_MS);
        return () => window.clearTimeout(timer);
    }, [compact, showNotice, orderKeys]);
    const canOpenPos = hasScreenAccess(user, 'pos');
    const open = (order: OrderDraft) => {
        if (onOpenOrder) onOpenOrder(order);
        else navigate(`/pos?draft=${order._id}`);
    };
    const requestOpen = (order: OrderDraft) => {
        if (confirmSwitch) setSwitchTo(order);
        else open(order);
    };
    const isUpdated = (order: OrderDraft) => order._id === activeDraftId && Boolean(activeDraftUpdatedAt && order.updatedAt > activeDraftUpdatedAt);
    const orderButton = (order: OrderDraft) => <Button key={order._id} size="small" variant="outlined" disabled={busy || (order._id === activeDraftId && !isUpdated(order))} onClick={() => requestOpen(order)}>
        {order._id === activeDraftId ? isUpdated(order) ? `Reload ${order.digitalMenuTable}` : `${order.digitalMenuTable} open in POS` : `Open ${order.digitalMenuTable} in POS`}
    </Button>;

    if (!enabled) return null;
    return <Box sx={{ mb: 2, flexShrink: 0, '@media print': { display: 'none' } }}>
        {error && <Alert severity="warning" sx={{ mb: 1 }}>{error}</Alert>}
        {compact ? showNotice && <Alert severity="info" icon={<BellRing size={20} />} onClose={dismissNotice}>
            <AlertTitle>Customer orders from {orders.map(order => order.digitalMenuTable).join(', ')}</AlertTitle>
            <Typography variant="body2">{orders.length} pending table order{orders.length === 1 ? '' : 's'}. {orders.some(isUpdated) ? 'The open table order was updated. Reload it to review the latest items.' : 'Review the orders before taking payment.'}</Typography>
            <Stack direction="row" gap={1} useFlexGap flexWrap="wrap" sx={{ mt: 1, maxHeight: 100, overflowY: 'auto' }}>{canOpenPos && orders.map(orderButton)}{canOpenPos && <Button size="small" onClick={() => navigate('/order-drafts')}>View Order Drafts</Button>}</Stack>
        </Alert> : <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}><QrCode size={22} /><Typography variant="h6" fontWeight={800}>Table QR orders</Typography><Chip size="small" label={`${orders.length} pending`} color={orders.length ? 'warning' : 'default'} /></Stack>
            {loading ? <Typography color="text.secondary">Checking table orders...</Typography> : orders.length === 0 && !error ? <Typography color="text.secondary">Orders placed through a table QR code will appear here.</Typography> : null}
            <Grid container spacing={2}>
                {orders.map(order => <Grid key={order._id} size={{ xs: 12, md: 6, xl: 4 }}><Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}><CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Typography variant="h6" fontWeight={900}>{order.digitalMenuTable}</Typography><Chip label="Awaiting payment" size="small" color="warning" variant="outlined" /></Stack>
                    <Typography variant="body2" color="text.secondary">Placed from this table's QR menu</Typography>
                    <Typography variant="caption" color="text.secondary">{order.draftCode} · Updated {new Date(order.updatedAt).toLocaleString()}</Typography>
                    <Stack spacing={.75} sx={{ my: 2, maxHeight: 220, overflowY: 'auto' }}>{order.items.map(item => <Stack key={`${item.productId}:${item.sizeId || ''}`} direction="row" justifyContent="space-between" gap={2}><Typography variant="body2">{item.quantity} × {item.productName}</Typography><Typography variant="body2" fontWeight={700}>{formatCurrency(item.unitPrice * item.quantity)}</Typography></Stack>)}</Stack>
                    <Typography fontWeight={800} sx={{ mb: 1 }}>Subtotal: {formatCurrency(order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0))}</Typography>
                    {canOpenPos && orderButton(order)}
                </CardContent></Card></Grid>)}
            </Grid>
        </Stack>}
        <Dialog open={Boolean(switchTo)} onClose={() => setSwitchTo(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Open order from {switchTo?.digitalMenuTable}?</DialogTitle>
            <DialogContent>This replaces the current POS cart with the table's latest order. Save your current changes as a draft first if you need to keep them.</DialogContent>
            <DialogActions><Button onClick={() => setSwitchTo(null)}>Cancel</Button><Button variant="contained" disabled={busy} onClick={() => { if (switchTo) open(switchTo); setSwitchTo(null); }}>Open table order</Button></DialogActions>
        </Dialog>
    </Box>;
}
