import React from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardActions,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    Stack,
    Typography,
    alpha,
} from '@mui/material';
import { Clock3, FilePenLine, Plus, QrCode, ShoppingBag, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from '../../api/axios';
import type { RootState } from '../../store';
import type { AppDispatch } from '../../store';
import { clearCart } from '../../features/pos/posSlice';
import useAppCurrency from '../../hooks/useAppCurrency';
import type { OrderDraft } from '../../types/orderDraft';
import { useOrderDrafts } from '../../hooks/useTableOrders';

const getRequestErrorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

const orderTypeLabel = (draft: OrderDraft) => {
    if (draft.orderType === 'dine_in') return 'Dine In';
    if (draft.orderType === 'takeaway') return 'Takeaway';
    if (draft.orderType === 'foodpanda') return 'Foodpanda';
    if (draft.orderType === 'other') return draft.otherOrderType || 'Other';
    return draft.orderType || 'Order type pending';
};

const OrderDraftsPage: React.FC = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { formatCurrency } = useAppCurrency();
    const { app } = useSelector((state: RootState) => state.settings);
    const { orders: drafts, loading, error: loadError, removeLocalDraft } = useOrderDrafts(true);
    const [error, setError] = React.useState('');
    const [deleting, setDeleting] = React.useState<OrderDraft | null>(null);
    const [deleteBusy, setDeleteBusy] = React.useState(false);

    const getDraftTotal = (draft: OrderDraft) => {
        const subtotal = draft.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        const tax = subtotal * (Number(app?.salesTaxRate || 0) / 100);
        const configuredDiscounts = (app?.discountOptions || []).map(Number);
        const appliedDiscount = app?.discountsEnabled && configuredDiscounts.includes(Number(draft.discountPercent))
            ? Number(draft.discountPercent)
            : 0;
        const discount = subtotal * (appliedDiscount / 100);
        return subtotal + tax - discount;
    };

    const handleNewOrder = () => {
        dispatch(clearCart());
        navigate('/pos');
    };

    const handleDelete = async () => {
        if (!deleting || deleteBusy) return;
        setDeleteBusy(true);
        try {
            await api.delete(`/order-drafts/${deleting._id}`);
            removeLocalDraft(deleting._id);
            window.dispatchEvent(new Event('itemhive-order-drafts-changed'));
            setDeleting(null);
        } catch (requestError: unknown) {
            setError(getRequestErrorMessage(requestError, 'Order draft could not be deleted.'));
        } finally {
            setDeleteBusy(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 1500, mx: 'auto' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                <Box>
                    <Typography variant="h4" fontWeight={900}>Order Drafts</Typography>
                    <Typography color="text.secondary">Review table QR orders and saved POS orders, then open them in POS for billing. Table orders appear automatically.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={19} />} onClick={handleNewOrder} sx={{ borderRadius: 2.5, px: 2.5, py: 1.1, fontWeight: 800 }}>
                    New POS Order
                </Button>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            {loadError && <Alert severity="warning" sx={{ mb: 2 }}>{loadError}</Alert>}

            {loading ? (
                <Box sx={{ minHeight: 300, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
            ) : drafts.length === 0 ? (
                <Card variant="outlined" sx={{ borderRadius: 4, py: 7, textAlign: 'center', borderStyle: 'dashed' }}>
                    <CardContent>
                        <ShoppingBag size={48} style={{ opacity: 0.35 }} />
                        <Typography variant="h6" fontWeight={800} sx={{ mt: 1 }}>No saved drafts</Typography>
                        <Typography color="text.secondary" sx={{ mb: 2 }}>Orders placed through table QR menus and drafts saved from POS will appear here.</Typography>
                        <Button variant="contained" onClick={handleNewOrder}>Open POS Terminal</Button>
                    </CardContent>
                </Card>
            ) : (
                <Grid container spacing={2}>
                    {drafts.map((draft) => (
                        <Grid key={draft._id} size={{ xs: 12, md: 6, xl: 4 }}>
                            <Card variant="outlined" sx={{ height: '100%', borderRadius: 3.5, display: 'flex', flexDirection: 'column', '&:hover': { borderColor: 'primary.main', boxShadow: (theme) => `0 12px 32px ${alpha(theme.palette.primary.main, 0.12)}` } }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                        <Box>
                                            <Typography variant="h6" fontWeight={900}>{draft.draftCode}</Typography>
                                            {draft.digitalMenuTable?.trim() && (
                                                <Stack spacing={0.5} sx={{ my: 1 }}>
                                                    <Chip
                                                        icon={<QrCode size={18} />}
                                                        label={`Placed from ${draft.digitalMenuTable.trim()}`}
                                                        color="warning"
                                                        sx={{ alignSelf: 'flex-start', height: 'auto', fontSize: '1rem', fontWeight: 800, '& .MuiChip-label': { py: 0.75, whiteSpace: 'normal', overflowWrap: 'anywhere' } }}
                                                    />
                                                    <Typography variant="caption" color="text.secondary">Table QR order</Typography>
                                                </Stack>
                                            )}
                                            <Stack direction="row" spacing={0.75} alignItems="center" color="text.secondary">
                                                <Clock3 size={14} />
                                                <Typography variant="caption">Updated {new Date(draft.updatedAt).toLocaleString()}</Typography>
                                            </Stack>
                                        </Box>
                                        <Chip size="small" label={orderTypeLabel(draft)} color={draft.orderType ? 'primary' : 'default'} variant="outlined" />
                                    </Stack>

                                    <Stack spacing={0.8} sx={{ my: 2 }}>
                                        {draft.items.slice(0, 4).map((item) => (
                                            <Stack key={`${item.productId}:${item.sizeId || ''}`} direction="row" justifyContent="space-between" spacing={2}>
                                                <Typography variant="body2" noWrap>{item.quantity} × {item.productName}</Typography>
                                                <Typography variant="body2" fontWeight={700}>{formatCurrency(item.quantity * item.unitPrice)}</Typography>
                                            </Stack>
                                        ))}
                                        {draft.items.length > 4 && <Typography variant="caption" color="text.secondary">+{draft.items.length - 4} more products</Typography>}
                                    </Stack>

                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">Saved by</Typography>
                                            <Typography variant="body2" fontWeight={700}>{draft.createdByName}</Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="caption" color="text.secondary">Estimated total</Typography>
                                            <Typography variant="h6" fontWeight={900} color="primary.main">{formatCurrency(getDraftTotal(draft))}</Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                                <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
                                    <Button fullWidth variant="contained" startIcon={<FilePenLine size={18} />} onClick={() => navigate(`/pos?draft=${draft._id}`)} sx={{ fontWeight: 800 }}>
                                        {draft.digitalMenuTable?.trim() ? `Open ${draft.digitalMenuTable} in POS` : 'Edit Order'}
                                    </Button>
                                    <IconButton color="error" aria-label={`Delete ${draft.draftCode}`} onClick={() => setDeleting(draft)}>
                                        <Trash2 size={19} />
                                    </IconButton>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog open={Boolean(deleting)} onClose={deleteBusy ? undefined : () => setDeleting(null)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={800}>Delete draft?</DialogTitle>
                <DialogContent>
                    <Typography>This will remove {deleting?.draftCode}. Inventory and completed sales will not be affected.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteBusy} startIcon={deleteBusy ? <CircularProgress size={16} color="inherit" /> : <Trash2 size={17} />}>
                        {deleteBusy ? 'Deleting...' : 'Delete Draft'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default OrderDraftsPage;
