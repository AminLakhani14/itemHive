import React, { useState } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Grid,
    TextField,
    Button,
    InputAdornment,
    Divider,
    Alert,
    Autocomplete,
    Avatar,
    Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Snackbar
} from '@mui/material';
import {
    ShoppingCart,
    MinusCircle,
    Search,
    Package,
    Printer,
    Share2,
    X
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { reduceStockApi } from '../../features/inventory/inventorySlice';
import type { AppDispatch } from '../../store';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import useAppCurrency from '../../hooks/useAppCurrency';
import InvoiceLetterhead from '../../components/Common/InvoiceLetterhead';
import InvoiceItemsTable from '../../components/Common/InvoiceItemsTable';
import { DEFAULT_APP_SETTINGS } from '../../features/settings/settingsSlice';
import { amountToWords } from '../../lib/numberToWords';
import { buildInvoicePdfBlob, shareOrDownloadPdf } from '../../lib/invoicePdf';
import { thermalInvoicePrintCss } from '../../lib/thermalPrintCss';
import { selectPrintSettings } from '../../features/branch/branchSlice';

const ReduceStock: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { products } = useSelector((state: RootState) => state.inventory);
    const { user } = useSelector((state: RootState) => state.auth);
    const app = useSelector(selectPrintSettings);
    const appSettings = app || DEFAULT_APP_SETTINGS;
    const { formatCurrency } = useAppCurrency();

    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [reduceAmount, setReduceAmount] = useState<number | string>(1);
    const [success, setSuccess] = useState(false);
    const [lastTx, setLastTx] = useState<any>(null);
    const [showInvoice, setShowInvoice] = useState(false);
    const [sharingInvoice, setSharingInvoice] = useState(false);
    const [shareMessage, setShareMessage] = useState<string | null>(null);

    const handleReduce = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct) return;

        const amount = parseInt(reduceAmount.toString());
        if (amount <= 0 || amount > selectedProduct.stock) {
            alert('Invalid amount or insufficient stock');
            return;
        }

        const invoiceId = Math.random().toString(36).substr(2, 9).toUpperCase();
        const newTx = {
            id: invoiceId,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            type: 'reduction' as const,
            amount,
            userName: user?.name || 'Unknown',
            timestamp: new Date().toISOString(),
            totalPrice: amount * selectedProduct.price
        };

        dispatch(reduceStockApi({ id: selectedProduct.id, amount, transaction: newTx }));

        setLastTx(newTx);
        setSuccess(true);
        setSelectedProduct(null);
        setReduceAmount(1);

        setTimeout(() => {
            setSuccess(false);
        }, 8000);
    };

    const handlePrint = () => {
        window.print();
    };

    const invoiceMoney = (value: number) => formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    const handleShareInvoice = async () => {
        if (!lastTx) return;
        setSharingInvoice(true);
        try {
            const money = (value: number) => formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            const unitPrice = lastTx.amount > 0 ? lastTx.totalPrice / lastTx.amount : 0;

            const blob = await buildInvoicePdfBlob({
                title: 'Invoice',
                bannerDataUrl: appSettings.invoiceLogoUrl || appSettings.receiptBannerUrl || undefined,
                shop: {
                    name: appSettings.shopName || DEFAULT_APP_SETTINGS.shopName,
                    address: appSettings.shopAddress,
                    phone: appSettings.shopPhone,
                },
                billToLabel: 'Issued by',
                billTo: lastTx.userName,
                meta: [
                    { label: 'Invoice date', value: format(new Date(lastTx.timestamp), 'yyyy-MM-dd') },
                    { label: 'Invoice time', value: format(new Date(lastTx.timestamp), 'hh:mm a') },
                    { label: 'Invoice number', value: `#${lastTx.id}` },
                ],
                columns: [
                    { label: '#', width: 0.6 },
                    { label: 'Description', width: 5 },
                    { label: 'Qty', width: 1, align: 'right' },
                    { label: 'Unit price', width: 1.7, align: 'right' },
                    { label: 'Total', width: 1.9, align: 'right' },
                ],
                rows: [['1', lastTx.productName, String(lastTx.amount), money(unitPrice), money(lastTx.totalPrice || 0)]],
                totals: [{ label: 'Total Amount', value: money(lastTx.totalPrice || 0), strong: true }],
                amountInWords: amountToWords(lastTx.totalPrice || 0),
                footer: 'Thank you for your purchase.',
            });

            const result = await shareOrDownloadPdf(blob, `invoice-${lastTx.id}.pdf`, 'Invoice');
            setShareMessage(result === 'shared' ? 'Invoice shared.' : 'Invoice PDF downloaded.');
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setShareMessage('Could not build the invoice PDF.');
        } finally {
            setSharingInvoice(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            <Box sx={{ mb: 4, '@media print': { display: 'none' } }}>
                <Typography variant="h4" fontWeight={800} gutterBottom>Reduce Stock / New Sale</Typography>
                <Typography variant="body1" color="text.secondary">Select a product and the quantity to remove from inventory.</Typography>
            </Box>

            {success && lastTx && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '24px' }}>
                    <Alert
                        severity="success"
                        sx={{ borderRadius: 2 }}
                        action={
                            <Button color="inherit" size="small" startIcon={<Printer size={16} />} onClick={() => setShowInvoice(true)}>
                                VIEW INVOICE
                            </Button>
                        }
                    >
                        Stock reduced successfully! Transaction ID: #{lastTx.id}
                    </Alert>
                </motion.div>
            )}

            <Grid container spacing={3} sx={{ '@media print': { display: 'none' } }}>
                <Grid size={{ xs: 12, md: 7 }}>
                    <Card sx={{ borderRadius: 4 }}>
                        <CardContent sx={{ p: 4 }}>
                            <form onSubmit={handleReduce}>
                                <Typography variant="h6" fontWeight={700} gutterBottom>Transaction Details</Typography>
                                <Divider sx={{ mb: 3 }} />

                                <Box sx={{ mb: 3 }}>
                                    <Autocomplete
                                        options={products}
                                        getOptionLabel={(option) => option.name}
                                        value={selectedProduct}
                                        onChange={(_, newValue) => setSelectedProduct(newValue)}
                                        renderOption={(props, option) => (
                                            <Box component="li" {...props} sx={{ display: 'flex', gap: 2 }}>
                                                <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: 'rgba(99, 102, 241, 0.1)', color: 'primary.main' }}>
                                                    {option.name.charAt(0)}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>{option.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{option.category} • {option.stock} in stock</Typography>
                                                </Box>
                                            </Box>
                                        )}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Search Product"
                                                required
                                                placeholder="Type product name..."
                                                InputProps={{
                                                    ...params.InputProps,
                                                    startAdornment: (
                                                        <InputAdornment position="start">
                                                            <Search size={20} />
                                                        </InputAdornment>
                                                    ),
                                                }}
                                            />
                                        )}
                                    />
                                </Box>

                                <Box sx={{ mb: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Quantity to Reduce"
                                        type="number"
                                        required
                                        value={reduceAmount}
                                        onChange={(e) => setReduceAmount(e.target.value)}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <MinusCircle size={20} color="#f43f5e" />
                                                </InputAdornment>
                                            ),
                                        }}
                                        helperText={selectedProduct ? `Available stock: ${selectedProduct.stock} ` : ''}
                                    />
                                </Box>

                                <Button
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    type="submit"
                                    disabled={!selectedProduct || parseInt(reduceAmount.toString()) <= 0 || parseInt(reduceAmount.toString()) > (selectedProduct?.stock || 0)}
                                    startIcon={<ShoppingCart size={20} />}
                                    sx={{ py: 1.5, borderRadius: 2, fontWeight: 700 }}
                                >
                                    Process Transaction
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }}>
                    <AnimatePresence mode="wait">
                        {selectedProduct ? (
                            <motion.div
                                key="product-details"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                            >
                                <Card sx={{ borderRadius: 4, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                                    <CardContent sx={{ p: 4 }}>
                                        <Typography variant="h6" fontWeight={700} gutterBottom>Product Summary</Typography>
                                        <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.2)' }} />

                                        <Box sx={{ textAlign: 'center', mb: 3 }}>
                                            <Avatar
                                                variant="rounded"
                                                sx={{ width: 80, height: 80, mx: 'auto', mb: 2, bgcolor: 'rgba(255,255,255,0.2)', fontSize: '2rem', fontWeight: 800 }}
                                            >
                                                {selectedProduct.name.charAt(0)}
                                            </Avatar>
                                            <Typography variant="h5" fontWeight={800}>{selectedProduct.name}</Typography>
                                            <Typography variant="body2" sx={{ opacity: 0.8 }}>{selectedProduct.category}</Typography>
                                        </Box>

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2">Current Stock:</Typography>
                                            <Typography variant="body2" fontWeight={700}>{selectedProduct.stock} Units</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2">Unit Price:</Typography>
                                            <Typography variant="body2" fontWeight={700}>{formatCurrency(selectedProduct.price)}</Typography>
                                        </Box>
                                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.2)' }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="h6">Total Value:</Typography>
                                            <Typography variant="h6" fontWeight={800}>
                                                {formatCurrency(parseInt(reduceAmount.toString() || '0') * selectedProduct.price, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="no-product"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        borderRadius: 4,
                                        p: 4,
                                        textAlign: 'center',
                                        borderStyle: 'dashed',
                                        bgcolor: 'rgba(0,0,0,0.01)'
                                    }}
                                >
                                    <Package size={48} color="#64748b" style={{ marginBottom: 16, opacity: 0.5 }} />
                                    <Typography color="text.secondary">
                                        Select a product to see details and price calculation.
                                    </Typography>
                                </Paper>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Grid>
            </Grid>

            {/* Invoice Dialog */}
            <Dialog open={showInvoice} onClose={() => setShowInvoice(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight={800}>Sales Invoice</Typography>
                    <IconButton onClick={() => setShowInvoice(false)} size="small">
                        <X size={20} />
                    </IconButton>
                </DialogTitle>
                <DialogContent id="printable-invoice">
                    {lastTx && (
                        <Box sx={{ p: 2 }}>
                            <InvoiceLetterhead
                                title="Invoice"
                                billToLabel="Issued by"
                                billTo={lastTx.userName}
                                meta={[
                                    { label: 'Invoice date', value: format(new Date(lastTx.timestamp), 'yyyy-MM-dd') },
                                    { label: 'Invoice time', value: format(new Date(lastTx.timestamp), 'hh:mm a') },
                                    { label: 'Invoice number', value: `#${lastTx.id}` },
                                ]}
                                sx={{ mb: 4 }}
                            />

                            <Divider sx={{ mb: 3 }} />

                            <InvoiceItemsTable
                                items={[{
                                    description: lastTx.productName,
                                    quantity: lastTx.amount,
                                    unitPrice: invoiceMoney(lastTx.amount > 0 ? lastTx.totalPrice / lastTx.amount : 0),
                                    total: invoiceMoney(lastTx.totalPrice || 0),
                                }]}
                                totals={[{ label: 'Total Amount', value: invoiceMoney(lastTx.totalPrice || 0), strong: true }]}
                                amountInWords={amountToWords(lastTx.totalPrice || 0)}
                            />

                            <Box sx={{ mt: 6, textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary">
                                    Thank you for your purchase. Electronic invoice generated by ItemHive.
                                </Typography>
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, '@media print': { display: 'none' } }}>
                    <Button onClick={() => setShowInvoice(false)}>Close</Button>
                    <Button
                        variant="outlined"
                        startIcon={<Share2 size={20} />}
                        onClick={handleShareInvoice}
                        disabled={sharingInvoice}
                    >
                        {sharingInvoice ? 'Preparing...' : 'Share PDF'}
                    </Button>
                    <Button variant="contained" startIcon={<Printer size={20} />} onClick={handlePrint}>
                        Print Invoice
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={Boolean(shareMessage)}
                autoHideDuration={2600}
                onClose={() => setShareMessage(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert
                    severity={shareMessage?.startsWith('Could not') ? 'error' : 'success'}
                    variant="filled"
                    onClose={() => setShareMessage(null)}
                >
                    {shareMessage}
                </Alert>
            </Snackbar>

            {/* Global Print Style */}
            <style>
                {`
                @media print {

                    /* Remove everything outside the invoice from the layout, not just
                       from view - hidden-but-present content prints as blank pages. */
                    body *:not(:has(#printable-invoice)):not(#printable-invoice):not(#printable-invoice *) {
                        display: none !important;
                    }

                    body, #root, .MuiDialog-root, .MuiDialog-container, .MuiDialog-paper {
                        display: block !important;
                        position: static !important;
                        overflow: visible !important;
                        height: auto !important;
                        max-height: none !important;
                        width: auto !important;
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        background: #fff !important;
                    }

                    ${thermalInvoicePrintCss('#printable-invoice')}
                }
                `}
            </style>
        </Box>
    );
};

export default ReduceStock;
