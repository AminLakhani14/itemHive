import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Grid,
    TextField,
    Button,
    InputAdornment,
    Autocomplete,
    Avatar,
    Chip,
    Divider,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TableContainer,
    Alert,
    MenuItem,
    Stack,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    BadgeDollarSign,
    Banknote,
    CheckCircle2,
    ClipboardList,
    CreditCard,
    Download,
    FileDown,
    Package,
    ReceiptText,
    Search,
    Share2,
    ShoppingBag,
    UserRound,
    UserRoundPlus,
    XCircle,
    Trash2
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { addOrder, type OrderStatus, type Order, type OrderPaymentMethod } from '../../features/orders/ordersSlice';
import { fetchProducts, resolveProductImage, placeholderFallback, type Product } from '../../features/inventory/inventorySlice';
import { addTransactionApi, deleteTransactionApi, fetchTransactions } from '../../features/transactions/transactionSlice';
import { alpha, useTheme } from '@mui/material/styles';
import type { AppDispatch } from '../../store';
import useAppCurrency from '../../hooks/useAppCurrency';
import DocumentBanner from '../../components/Common/DocumentBanner';
import InvoiceLetterhead from '../../components/Common/InvoiceLetterhead';
import InvoiceItemsTable from '../../components/Common/InvoiceItemsTable';
import { amountToWords } from '../../lib/numberToWords';
import { buildInvoicePdfBlob, shareOrDownloadPdf } from '../../lib/invoicePdf';
import { thermalInvoicePrintCss } from '../../lib/thermalPrintCss';
import { DEFAULT_APP_SETTINGS } from '../../features/settings/settingsSlice';
import api from '../../api/axios';
import SalespersonSelect from '../../components/Payroll/SalespersonSelect';

type CustomerType = 'regular' | 'credit' | 'installment' | 'wholesale';
type CustomerStatus = 'active' | 'inactive';

interface Customer {
    _id: string;
    fullName: string;
    cnic: string;
    phoneNumber: string;
    amount: number;
    email?: string;
    address?: string;
    city?: string;
    customerType: CustomerType;
    status: CustomerStatus;
    notes?: string;
}

interface CreateCustomerOption {
    _id: 'new-customer-action';
    fullName: string;
    isCreateAction: true;
}

type CustomerOption = Customer | CreateCustomerOption;

const initialCustomerForm = {
    fullName: '',
    cnic: '',
    phoneNumber: '',
    amount: 0,
    email: '',
    address: '',
    city: '',
    customerType: 'regular' as CustomerType,
    status: 'active' as CustomerStatus,
    notes: '',
};

const createCustomerOption: CreateCustomerOption = {
    _id: 'new-customer-action',
    fullName: 'New Customer',
    isCreateAction: true,
};

const isCreateCustomerOption = (option: CustomerOption): option is CreateCustomerOption =>
    'isCreateAction' in option;

const paymentMethodLabels: Record<OrderPaymentMethod, string> = {
    cash: 'Cash',
    card: 'Card',
    credit: 'Credit',
    installment: 'EMI',
};

const paymentOptions: Array<{ value: OrderPaymentMethod; label: string; icon: React.ReactNode }> = [
    { value: 'cash', label: 'Cash', icon: <Banknote size={18} /> },
    { value: 'card', label: 'Card', icon: <CreditCard size={18} /> },
    { value: 'credit', label: 'Credit', icon: <BadgeDollarSign size={18} /> },
    { value: 'installment', label: 'EMI', icon: <ReceiptText size={18} /> },
];

const ANONYMOUS_CUSTOMER_NAME = 'Anonymous';

const getApiErrorMessage = (error: unknown, fallback: string) => {
    const maybeError = error as { response?: { data?: { message?: string } } };
    return maybeError.response?.data?.message || fallback;
};

const OrderDesk: React.FC = () => {
    const theme = useTheme();
    const { formatCurrency, currencySymbol } = useAppCurrency();
    const dispatch = useDispatch<AppDispatch>();
    const [salespersonEmployeeId, setSalespersonEmployeeId] = useState('');
    const { products } = useSelector((state: RootState) => state.inventory);
    const { user } = useSelector((state: RootState) => state.auth);
    const { orders } = useSelector((state: RootState) => state.orders);
    const { transactions, loading: transactionLoading } = useSelector((state: RootState) => state.transactions);
    const { app } = useSelector((state: RootState) => state.settings);
    const appSettings = app || DEFAULT_APP_SETTINGS;
    const isManager = user?.role === 'super_admin' || user?.role === 'admin';

    const calculateOrderAmount = (product: Product | null, qtyValue: number | string) => {
        const qtyNumber = Math.max(0, parseInt(qtyValue.toString() || '0'));
        if (!product || qtyNumber <= 0) return '';
        return Number((qtyNumber * Number(product.price || 0)).toFixed(2));
    };

    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number | string>(1);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
    const [customerForm, setCustomerForm] = useState(initialCustomerForm);
    const [customerSaving, setCustomerSaving] = useState(false);
    const [orderAmount, setOrderAmount] = useState<number | string>('');
    const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('cash');
    const [note, setNote] = useState('');
    const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
    const [printTarget, setPrintTarget] = useState<'orders' | 'invoice'>('orders');
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [sharingInvoice, setSharingInvoice] = useState(false);
    const [filterText, setFilterText] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
    const [transactionToDelete, setTransactionToDelete] = useState<{ id: string; productName: string } | null>(null);

    useEffect(() => {
        dispatch(fetchProducts());
        dispatch(fetchTransactions());
    }, [dispatch]);

    useEffect(() => {
        const resetPrintTarget = () => setPrintTarget('orders');
        window.addEventListener('afterprint', resetPrintTarget);
        return () => window.removeEventListener('afterprint', resetPrintTarget);
    }, []);

    const loadCustomers = React.useCallback(async () => {
        try {
            const response = await api.get<Customer[]>('/customers');
            setCustomers(response.data || []);
        } catch (error: unknown) {
            setFeedback({ type: 'error', message: getApiErrorMessage(error, 'Unable to load customers.') });
        }
    }, []);

    useEffect(() => {
        loadCustomers();
    }, [loadCustomers]);

    const availableStock = selectedProduct?.stock ?? 0;
    const requestedQty = Math.max(0, parseInt(quantity.toString() || '0'));
    const numericOrderAmount = Math.max(0, Number(orderAmount || 0));
    const enoughStock = requestedQty > 0 && requestedQty <= availableStock;
    const estimatedAmount = selectedProduct ? requestedQty * Number(selectedProduct.price || 0) : 0;
    const currentOrderTotal = numericOrderAmount || estimatedAmount;
    const paidNow = paymentMethod === 'cash' || paymentMethod === 'card' ? currentOrderTotal : 0;
    const dueAmount = paymentMethod === 'credit' || paymentMethod === 'installment' ? currentOrderTotal : 0;

    const availabilityLabel = useMemo(() => {
        if (!selectedProduct || requestedQty <= 0) return 'Select product and quantity';
        if (enoughStock) return `Available: ${availableStock} in stock`;
        const shortBy = requestedQty - availableStock;
        return `Short by ${shortBy} unit${shortBy === 1 ? '' : 's'}`;
    }, [selectedProduct, requestedQty, availableStock, enoughStock]);

    const availabilityColor: OrderStatus | 'neutral' = !selectedProduct || requestedQty <= 0
        ? 'neutral'
        : enoughStock
            ? 'fulfilled'
            : 'rejected';
    const canSubmitOrder = Boolean(selectedProduct && requestedQty > 0 && numericOrderAmount > 0 && !transactionLoading);

    const openNewCustomerDialog = () => {
        if (!isManager) return;
        setCustomerForm({
            ...initialCustomerForm,
            fullName: customerName.trim(),
        });
        setCustomerDialogOpen(true);
    };

    const customerOptions = useMemo<CustomerOption[]>(() => [
        ...(isManager ? [createCustomerOption] : []),
        ...customers.filter((customer) => customer.status === 'active'),
    ], [customers, isManager]);

    const handlePlaceOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProduct) return;
        const cleanCustomerName = customerName.trim() || ANONYMOUS_CUSTOMER_NAME;

        if (!enoughStock) {
            const orderId = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            const requestedBy = user?.name || 'Admin';

            dispatch(addOrder({
                id: orderId,
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: requestedQty,
                customerName: cleanCustomerName,
                orderAmount: numericOrderAmount,
                requestedBy,
                status: 'rejected',
                timestamp,
                notes: note.trim() || 'Insufficient stock',
                paymentMethod,
                paidNow: 0,
                dueAmount: numericOrderAmount,
            }));

            setFeedback({ type: 'error', message: `Order ${orderId} rejected due to insufficient stock.` });
            setSelectedProduct(null);
            setQuantity(1);
            setSelectedCustomer(null);
            setCustomerName('');
            setOrderAmount('');
            setPaymentMethod('cash');
            setNote('');
            return;
        }

        const orderId = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const requestedBy = user?.name || 'Admin';

        const orderTx = {
            source: 'order_desk' as const,
            salespersonEmployeeId: salespersonEmployeeId || undefined,
            id: `ORD-${orderId}`,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            type: 'reduction' as const,
            amount: requestedQty,
            userName: requestedBy,
            timestamp,
            totalPrice: currentOrderTotal,
            customerName: cleanCustomerName,
            customerCnic: selectedCustomer?.cnic || '',
            paymentMethod,
            paidVia: paymentMethod === 'cash' || paymentMethod === 'card' ? paymentMethod : undefined,
            paidNow,
            dueAmount,
        };

        const result = await dispatch(addTransactionApi(orderTx));
        if (addTransactionApi.fulfilled.match(result)) {
            dispatch(addOrder({
                id: orderId,
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                quantity: requestedQty,
                customerName: cleanCustomerName,
                orderAmount: currentOrderTotal,
                requestedBy,
                status: 'fulfilled',
                timestamp,
                notes: note.trim() || undefined,
                paymentMethod,
                paidNow,
                dueAmount,
            }));
            dispatch(fetchProducts({ force: true }));
            dispatch(fetchTransactions());
            setFeedback({ type: 'success', message: `Order ${orderId} placed and stock updated.` });
            setSelectedProduct(null);
            setQuantity(1);
            setSelectedCustomer(null);
            setCustomerName('');
            setOrderAmount('');
            setPaymentMethod('cash');
            setNote('');
            return;
        }

        setFeedback({
            type: 'error',
            message: typeof result.payload === 'string' ? result.payload : `Order ${orderId} could not be placed.`
        });
    };

    const handleCustomerFormChange = (field: keyof typeof initialCustomerForm, value: string | number) => {
        setCustomerForm((current) => ({ ...current, [field]: value }));
    };

    const resetCustomerDialog = () => {
        setCustomerForm(initialCustomerForm);
        setCustomerDialogOpen(false);
    };

    const handleCreateCustomer = async () => {
        if (!customerForm.fullName.trim()) {
            setFeedback({ type: 'error', message: 'Customer full name is required.' });
            return;
        }
        if (!customerForm.cnic.trim()) {
            setFeedback({ type: 'error', message: 'Customer CNIC is required.' });
            return;
        }
        if (!customerForm.phoneNumber.trim()) {
            setFeedback({ type: 'error', message: 'Customer phone number is required.' });
            return;
        }

        setCustomerSaving(true);
        try {
            const payload = {
                ...customerForm,
                fullName: customerForm.fullName.trim(),
                cnic: customerForm.cnic.trim(),
                phoneNumber: customerForm.phoneNumber.trim(),
                amount: Number(customerForm.amount || 0),
                email: customerForm.email.trim(),
                address: customerForm.address.trim(),
                city: customerForm.city.trim(),
                notes: customerForm.notes.trim(),
            };
            const response = await api.post<Customer>('/customers', payload);
            setCustomers((current) => [response.data, ...current]);
            setSelectedCustomer(response.data);
            setCustomerName(response.data.fullName);
            resetCustomerDialog();
            setFeedback({ type: 'success', message: 'Customer created and selected for this order.' });
        } catch (error: unknown) {
            setFeedback({ type: 'error', message: getApiErrorMessage(error, 'Unable to create customer.') });
        } finally {
            setCustomerSaving(false);
        }
    };

    const fulfilledOrdersFromTransactions: Order[] = useMemo(() => (
        transactions
            .filter((tx) => tx.type === 'reduction')
            .map((tx) => ({
                id: tx.id.startsWith('ORD-') ? tx.id.replace(/^ORD-/, '') : tx.id,
                productId: tx.productId,
                productName: tx.productName,
                quantity: tx.amount,
                customerName: tx.customerName || ANONYMOUS_CUSTOMER_NAME,
                orderAmount: tx.totalPrice || 0,
                requestedBy: tx.userName,
                status: 'fulfilled' as const,
                timestamp: tx.timestamp,
                notes: undefined,
                paymentMethod: tx.paymentMethod || 'cash',
                paidNow: tx.paidNow,
                dueAmount: tx.dueAmount,
                sourceTransactionId: tx.id,
            }))
    ), [transactions]);

    const filteredOrders = useMemo(() => {
        const combinedOrders = [
            ...orders.filter((order) => order.status !== 'fulfilled'),
            ...fulfilledOrdersFromTransactions,
        ];
        const text = filterText.trim().toLowerCase();
        return combinedOrders.filter(order => {
            const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
            if (!matchesStatus) return false;
            if (!text) return true;
            return (
                order.id.toLowerCase().includes(text) ||
                order.productName.toLowerCase().includes(text) ||
                (order.customerName || '').toLowerCase().includes(text) ||
                order.requestedBy.toLowerCase().includes(text)
            );
        });
    }, [orders, fulfilledOrdersFromTransactions, filterText, statusFilter]);

    const handleDeleteTransaction = async () => {
        if (!transactionToDelete) return;

        const result = await dispatch(deleteTransactionApi(transactionToDelete.id));
        if (deleteTransactionApi.fulfilled.match(result)) {
            setFeedback({ type: 'success', message: 'Transaction deleted and product stock restored.' });
            dispatch(fetchProducts({ force: true }));
            setTransactionToDelete(null);
            return;
        }

        setFeedback({
            type: 'error',
            message: typeof result.payload === 'string' ? result.payload : 'Unable to delete transaction.',
        });
    };

    const exportOrdersToCSV = () => {
        const headers = ['Order ID', 'Customer', 'Product', 'Quantity', 'Amount', 'Payment', 'Status', 'Reason', 'Requested By', 'Time'];
        const rows = filteredOrders.map((order) => ([
            order.id,
            order.customerName || '',
            order.productName,
            order.quantity.toString(),
            String(order.orderAmount || 0),
            paymentMethodLabels[order.paymentMethod || 'cash'],
            order.status,
            order.notes || '',
            order.requestedBy,
            new Date(order.timestamp).toLocaleString(),
        ]));

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const printTargetId = printTarget === 'invoice' ? '#invoice-print-area' : '#orders-print-area';
    const invoiceMoney = (value: number) => formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

    const handleDownloadPDF = () => {
        setPrintTarget('orders');
        window.setTimeout(() => window.print(), 0);
    };

    const handlePrintInvoice = () => {
        setPrintTarget('invoice');
        window.setTimeout(() => window.print(), 0);
    };

    const handleShareInvoice = async () => {
        if (!invoiceOrder) return;
        setSharingInvoice(true);
        try {
            const amount = invoiceOrder.orderAmount || 0;
            const unitPrice = invoiceOrder.quantity > 0 ? amount / invoiceOrder.quantity : 0;
            const money = (value: number) => formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

            const blob = await buildInvoicePdfBlob({
                title: 'Invoice',
                bannerDataUrl: appSettings.invoiceLogoUrl || appSettings.receiptBannerUrl || undefined,
                shop: {
                    name: appSettings.shopName || DEFAULT_APP_SETTINGS.shopName,
                    address: appSettings.shopAddress,
                    phone: appSettings.shopPhone,
                },
                billToLabel: 'Invoice to',
                billTo: invoiceOrder.customerName || ANONYMOUS_CUSTOMER_NAME,
                billToSubtitle: `Requested by ${invoiceOrder.requestedBy}`,
                meta: [
                    { label: 'Invoice date', value: new Date(invoiceOrder.timestamp).toLocaleDateString() },
                    { label: 'Invoice time', value: new Date(invoiceOrder.timestamp).toLocaleTimeString() },
                    { label: 'Invoice number', value: `#${invoiceOrder.id}` },
                ],
                columns: [
                    { label: '#', width: 0.6 },
                    { label: 'Description', width: 5 },
                    { label: 'Qty', width: 1, align: 'right' },
                    { label: 'Unit price', width: 1.7, align: 'right' },
                    { label: 'Total', width: 1.9, align: 'right' },
                ],
                rows: [['1', invoiceOrder.productName, String(invoiceOrder.quantity), money(unitPrice), money(amount)]],
                totals: [
                    { label: 'Total', value: money(amount), strong: true },
                    ...((invoiceOrder.paidNow || 0) > 0 ? [{ label: 'Paid Now', value: money(invoiceOrder.paidNow || 0) }] : []),
                    ...((invoiceOrder.dueAmount || 0) > 0 ? [{ label: 'Amount To Receive', value: money(invoiceOrder.dueAmount || 0) }] : []),
                ],
                amountInWords: amountToWords(amount),
                footer: `Payment method: ${paymentMethodLabels[invoiceOrder.paymentMethod || 'cash']}  |  Status: ${invoiceOrder.status}`,
            });

            const result = await shareOrDownloadPdf(blob, `invoice-${invoiceOrder.id}.pdf`, 'Invoice');
            setFeedback({
                type: 'success',
                message: result === 'shared' ? 'Invoice shared.' : 'Invoice PDF downloaded.',
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setFeedback({ type: 'error', message: 'Could not build the invoice PDF.' });
        } finally {
            setSharingInvoice(false);
        }
    };

    const summary = useMemo(() => {
        return filteredOrders.reduce(
            (acc, order) => {
                acc.total += 1;
                if (order.status === 'fulfilled') acc.fulfilled += 1;
                if (order.status === 'rejected') acc.rejected += 1;
                if (order.status === 'pending') acc.pending += 1;
                acc.amount += Number(order.orderAmount || 0);
                return acc;
            },
            { total: 0, fulfilled: 0, rejected: 0, pending: 0, amount: 0 }
        );
    }, [filteredOrders]);

    return (
        <Box>
            <Box
                className="section-rise"
                sx={{
                    mb: 3,
                    p: { xs: 2.5, md: 3 },
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: alpha(theme.palette.primary.main, 0.16),
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.success.main, 0.08)} 48%, ${alpha(theme.palette.warning.main, 0.1)})`,
                    boxShadow: `0 18px 45px ${alpha(theme.palette.common.black, 0.08)}`,
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h4" fontWeight={900}>Order Desk</Typography>
                        <Typography variant="body1" color="text.secondary">
                            Check availability, place customer orders, and auto-deduct inventory in one flow.
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
                        <Chip icon={<ShoppingBag size={16} />} label={`${summary.total} Orders`} sx={{ fontWeight: 800, bgcolor: 'background.paper' }} />
                        <Chip icon={<CheckCircle2 size={16} />} label={`${summary.fulfilled} Fulfilled`} color="success" sx={{ fontWeight: 800 }} />
                        <Chip icon={<BadgeDollarSign size={16} />} label={formatCurrency(summary.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} sx={{ fontWeight: 800, bgcolor: 'background.paper' }} />
                    </Stack>
                </Box>
            </Box>


            {feedback && (
                <Alert severity={feedback.type} sx={{ mb: 3, borderRadius: 2 }} onClose={() => setFeedback(null)}>
                    {feedback.message}
                </Alert>
            )}

            <Grid container spacing={3} className="section-rise-delay">
                <Grid size={12}>
                    <Card
                        sx={{
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: alpha(theme.palette.primary.main, 0.14),
                            boxShadow: `0 18px 45px ${alpha(theme.palette.common.black, 0.08)}`,
                            overflow: 'hidden',
                        }}
                    >
                        <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <Avatar sx={{ width: 38, height: 38, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
                                    <ClipboardList size={20} />
                                </Avatar>
                                <Box>
                                    <Typography variant="h6" fontWeight={900}>New Order</Typography>
                                    <Typography variant="caption" color="text.secondary">Customer, product, quantity, and billed amount.</Typography>
                                </Box>
                            </Box>
                            <Divider sx={{ mb: 3 }} />
                            <form onSubmit={handlePlaceOrder}>
                                <Box sx={{ mb: 3 }}>
                                    <Autocomplete
                                        options={products}
                                        getOptionLabel={(option) => option.name}
                                        value={selectedProduct}
                                        onChange={(_, newValue) => {
                                            setSelectedProduct(newValue);
                                            setOrderAmount(calculateOrderAmount(newValue, quantity));
                                        }}
                                        renderOption={(props, option) => (
                                            <Box component="li" {...props} sx={{ display: 'flex', gap: 2 }}>
                                                <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: 'rgba(99, 102, 241, 0.1)', color: 'primary.main' }}>
                                                    {option.name.charAt(0)}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>{option.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {option.sku} - {option.stock} in stock
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        )}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Search Product"
                                                required
                                                placeholder="Type product name or SKU..."
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

                                <Grid container spacing={2} sx={{ mb: 3 }}>
                                    <Grid size={12}><SalespersonSelect value={salespersonEmployeeId} onChange={setSalespersonEmployeeId} /></Grid>
                                    <Grid size={12}>
                                        <Autocomplete
                                            options={customerOptions}
                                            value={selectedCustomer}
                                            inputValue={customerName}
                                            onChange={(_, newValue) => {
                                                if (newValue && isCreateCustomerOption(newValue)) {
                                                    openNewCustomerDialog();
                                                    return;
                                                }
                                                setSelectedCustomer(newValue);
                                                setCustomerName(newValue?.fullName || '');
                                            }}
                                            onInputChange={(_, newInputValue, reason) => {
                                                setCustomerName(newInputValue);
                                                if (reason === 'input') setSelectedCustomer(null);
                                            }}
                                            getOptionLabel={(option) => option.fullName}
                                            isOptionEqualToValue={(option, value) => option._id === value._id}
                                            filterOptions={(options, state) => {
                                                const query = state.inputValue.trim().toLowerCase();
                                                const createOption = options.find(isCreateCustomerOption);
                                                const customerMatches = options.filter((option) => {
                                                    if (isCreateCustomerOption(option)) return false;
                                                    if (!query) return true;
                                                    return (
                                                        option.fullName.toLowerCase().includes(query) ||
                                                        option.phoneNumber.toLowerCase().includes(query) ||
                                                        option.customerType.toLowerCase().includes(query)
                                                    );
                                                });
                                                return createOption ? [createOption, ...customerMatches] : customerMatches;
                                            }}
                                            renderOption={(props, option) => (
                                                <Box
                                                    component="li"
                                                    {...props}
                                                    sx={{
                                                        display: 'flex',
                                                        gap: 1.5,
                                                        alignItems: 'center',
                                                        borderBottom: isCreateCustomerOption(option) ? '1px solid' : 'none',
                                                        borderColor: 'divider',
                                                        py: isCreateCustomerOption(option) ? 1.25 : undefined,
                                                    }}
                                                >
                                                    {isCreateCustomerOption(option) ? (
                                                        <>
                                                            <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(theme.palette.primary.main, 0.16), color: 'primary.main' }}>
                                                                <UserRoundPlus size={17} />
                                                            </Avatar>
                                                            <Box>
                                                                <Typography variant="body2" fontWeight={900} color="primary.main">New Customer</Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    Create customer and select for this order
                                                                </Typography>
                                                            </Box>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
                                                                <UserRound size={17} />
                                                            </Avatar>
                                                            <Box>
                                                                <Typography variant="body2" fontWeight={700}>{option.fullName}</Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {option.phoneNumber} - {option.customerType}
                                                                </Typography>
                                                            </Box>
                                                        </>
                                                    )}
                                                </Box>
                                            )}
                                            renderInput={(params) => (
                                                <TextField
                                                    {...params}
                                                    label="Customer"
                                                    placeholder="Optional: select existing customer"
                                                    InputProps={{
                                                        ...params.InputProps,
                                                        startAdornment: (
                                                            <>
                                                                <InputAdornment position="start">
                                                                    <UserRound size={20} />
                                                                </InputAdornment>
                                                                {params.InputProps.startAdornment}
                                                            </>
                                                        ),
                                                    }}
                                                />
                                            )}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <TextField
                                            fullWidth
                                            label="Order Quantity"
                                            type="number"
                                            required
                                            value={Number(quantity) < 0 ? '0' : quantity}
                                            onChange={(e) => {
                                                setQuantity(e.target.value);
                                                setOrderAmount(calculateOrderAmount(selectedProduct, e.target.value));
                                            }}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <Package size={20} />
                                                    </InputAdornment>
                                                ),
                                            }}
                                            helperText={selectedProduct ? `Available stock: ${selectedProduct.stock}` : ''}
                                        />
                                    </Grid>
                                    <Grid size={12}>
                                        <TextField
                                            fullWidth
                                            required
                                            type="number"
                                            label="Amount"
                                            value={orderAmount}
                                            onChange={(e) => setOrderAmount(e.target.value)}
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        {currencySymbol}
                                                    </InputAdornment>
                                                ),
                                            }}
                                            helperText={selectedProduct ? `Auto-calculated from product price: ${formatCurrency(estimatedAmount, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : 'Select a product to auto-calculate amount'}
                                        />
                                    </Grid>
                                    <Grid size={12}>
                                        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 1 }}>
                                            Payment Method
                                        </Typography>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
                                            {paymentOptions.map((option) => {
                                                const selected = paymentMethod === option.value;
                                                return (
                                                    <Button
                                                        key={option.value}
                                                        type="button"
                                                        variant={selected ? 'contained' : 'outlined'}
                                                        startIcon={option.icon}
                                                        onClick={() => setPaymentMethod(option.value)}
                                                        sx={{
                                                            flex: 1,
                                                            borderRadius: '8px',
                                                            py: 1.15,
                                                            fontWeight: 900,
                                                            borderColor: selected ? 'primary.main' : 'divider',
                                                        }}
                                                    >
                                                        {option.label}
                                                    </Button>
                                                );
                                            })}
                                        </Stack>
                                        {(paymentMethod === 'credit' || paymentMethod === 'installment') && (
                                            <Typography variant="caption" color="warning.main" fontWeight={700} sx={{ display: 'block', mt: 1 }}>
                                                {formatCurrency(currentOrderTotal, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} will be marked as amount to receive.
                                            </Typography>
                                        )}
                                    </Grid>
                                </Grid>

                                <Box sx={{ mb: 3 }}>
                                    <TextField
                                        fullWidth
                                        label="Order Notes (optional)"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    />
                                </Box>

                                <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {availabilityColor === 'fulfilled' ? (
                                        <CheckCircle2 size={18} color="#16a34a" />
                                    ) : availabilityColor === 'rejected' ? (
                                        <XCircle size={18} color="#dc2626" />
                                    ) : (
                                        <ClipboardList size={18} color="#64748b" />
                                    )}
                                    <Typography variant="body2" color="text.secondary">{availabilityLabel}</Typography>
                                    {availabilityColor !== 'neutral' && (
                                        <Chip
                                            label={availabilityColor === 'fulfilled' ? 'In Stock' : 'Insufficient'}
                                            size="small"
                                            color={availabilityColor === 'fulfilled' ? 'success' : 'error'}
                                            sx={{ fontWeight: 600 }}
                                        />
                                    )}
                                </Box>

                                <Button
                                    fullWidth
                                    variant="contained"
                                    size="large"
                                    type="submit"
                                    disabled={!canSubmitOrder}
                                    sx={{ py: 1.6, borderRadius: '8px', fontWeight: 900, boxShadow: `0 14px 28px ${alpha(theme.palette.primary.main, 0.24)}` }}
                                >
                                    {transactionLoading ? 'Placing Order...' : enoughStock ? 'Place Order & Deduct Stock' : 'Log Rejected Order'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={12}>
                    <Card sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider', boxShadow: `0 14px 36px ${alpha(theme.palette.common.black, 0.06)}` }}>
                        <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
                            <Typography variant="h6" fontWeight={700} gutterBottom>Availability Snapshot</Typography>
                            <Divider sx={{ mb: 3 }} />
                            {!selectedProduct ? (
                                <Box sx={{ color: 'text.secondary' }}>
                                    Select a product to see real-time availability and impact.
                                </Box>
                            ) : (
                                <Stack spacing={2}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Avatar
                                            variant="rounded"
                                            src={resolveProductImage(selectedProduct)}
                                            alt={selectedProduct.name}
                                            imgProps={{
                                                onError: (e) => {
                                                    const target = e.currentTarget as HTMLImageElement;
                                                    if (target.src !== placeholderFallback) {
                                                        target.src = placeholderFallback;
                                                    }
                                                }
                                            }}
                                            sx={{
                                                width: 48,
                                                height: 48,
                                                bgcolor: alpha(theme.palette.primary.main, 0.12),
                                                color: 'primary.main'
                                            }}
                                        >
                                            {selectedProduct.name.charAt(0)}
                                        </Avatar>
                                        <Box>
                                            <Typography fontWeight={700}>{selectedProduct.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{selectedProduct.sku}</Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" color="text.secondary">Current Stock</Typography>
                                        <Typography variant="body2" fontWeight={700}>{availableStock}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" color="text.secondary">Requested Qty</Typography>
                                        <Typography variant="body2" fontWeight={700}>{requestedQty || 0}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" color="text.secondary">Order Amount</Typography>
                                        <Typography variant="body2" fontWeight={800}>
                                            {formatCurrency(numericOrderAmount || estimatedAmount, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </Typography>
                                    </Box>
                                    <Divider />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" color="text.secondary">Remaining After Order</Typography>
                                        <Typography variant="body2" fontWeight={800} color={enoughStock ? 'success.main' : 'error.main'}>
                                            {enoughStock ? availableStock - requestedQty : 'N/A'}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label={enoughStock ? 'Can Fulfill' : 'Insufficient Stock'}
                                        color={enoughStock ? 'success' : 'error'}
                                        size="small"
                                        sx={{ fontWeight: 700, alignSelf: 'flex-start' }}
                                    />
                                </Stack>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={12}>
                    <Card sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider', boxShadow: `0 18px 45px ${alpha(theme.palette.common.black, 0.08)}`, overflow: 'hidden' }}>
                        <CardContent sx={{ p: 0 }}>
                            <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="h6" fontWeight={800}>Order List</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Every placed order is logged here for review and pitching.
                                </Typography>
                            </Box>
                            <Box sx={{ px: 3, py: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
                                <Chip label={`Total: ${summary.total}`} size="small" sx={{ fontWeight: 700 }} />
                                <Chip label={`Amount: ${formatCurrency(summary.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} size="small" color="primary" sx={{ fontWeight: 700 }} />
                                <Chip label={`Fulfilled: ${summary.fulfilled}`} size="small" color="success" sx={{ fontWeight: 700 }} />
                                <Chip label={`Rejected: ${summary.rejected}`} size="small" color="error" sx={{ fontWeight: 700 }} />
                                <Chip label={`Pending: ${summary.pending}`} size="small" color="warning" sx={{ fontWeight: 700 }} />
                            </Box>
                            <Box
                                sx={{
                                    p: 2.5,
                                    display: 'flex',
                                    gap: 1.5,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    borderBottom: '1px solid',
                                    borderColor: 'divider'
                                }}
                            >
                                <TextField
                                    placeholder="Search order, customer, product, or requester..."
                                    size="small"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Search size={18} color="#64748b" />
                                            </InputAdornment>
                                        ),
                                    }}
                                    sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 280 } }}
                                />
                                <TextField
                                    select
                                    size="small"
                                    label="Status"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
                                    sx={{ minWidth: { xs: '100%', sm: 150 } }}
                                >
                                    <MenuItem value="all">All</MenuItem>
                                    <MenuItem value="fulfilled">Fulfilled</MenuItem>
                                    <MenuItem value="rejected">Rejected</MenuItem>
                                    <MenuItem value="pending">Pending</MenuItem>
                                </TextField>
                                <Button
                                    variant="contained"
                                    startIcon={<Download size={18} />}
                                    onClick={exportOrdersToCSV}
                                    disabled={filteredOrders.length === 0}
                                    sx={{ borderColor: 'divider', whiteSpace: 'nowrap', ml: { xs: 0, sm: 'auto' } }}
                                >
                                    Export CSV
                                </Button>
                                <Button
                                    variant="contained"
                                    disabled={filteredOrders.length === 0}
                                    startIcon={<FileDown size={18} />}
                                    onClick={handleDownloadPDF}
                                    sx={{ whiteSpace: 'nowrap' }}
                                >
                                    Print PDF
                                </Button>
                            </Box>
                            <TableContainer
                                sx={{
                                    borderRadius: 0,
                                    overflowX: 'auto',
                                    overflowY: 'hidden',
                                    scrollbarWidth: 'thin',
                                    scrollbarColor: (theme) => `${theme.palette.primary.main} ${theme.palette.action.hover}`,
                                    '&::-webkit-scrollbar': { height: 10 },
                                    '&::-webkit-scrollbar-thumb': {
                                        bgcolor: 'primary.main',
                                        borderRadius: 8,
                                    },
                                    '&::-webkit-scrollbar-track': { bgcolor: 'action.hover' },
                                }}
                                id="orders-print-area"
                            >
                                <DocumentBanner
                                    sx={{ display: 'none', mb: 2, '@media print': { display: 'block' } }}
                                />
                                <Table
                                    sx={{
                                        width: '100%',
                                        minWidth: 1440,
                                        '& .MuiTableCell-root': {
                                            px: { xs: 0.75, md: 1 },
                                            py: { xs: 1.25, md: 1.5 },
                                            overflowWrap: 'anywhere',
                                            verticalAlign: 'middle',
                                        },
                                    }}
                                >
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 700 }}>ORDER ID</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>CUSTOMER</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>PRODUCT</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>QTY</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>AMOUNT</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>PAYMENT</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>STATUS</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>REASON</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>REQUESTED BY</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>TIME</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>ACTIONS</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredOrders.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={11}>
                                                    <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                                                        No orders match your filters yet.
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredOrders.map((order: Order) => (
                                                <TableRow key={order.id} hover>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={700}>#{order.id}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={700}>{order.customerName || ANONYMOUS_CUSTOMER_NAME}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={600}>{order.productName}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={700}>{order.quantity}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={800}>
                                                            {formatCurrency(order.orderAmount || 0, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={paymentMethodLabels[order.paymentMethod || 'cash']}
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{ fontWeight: 800 }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={order.status === 'fulfilled' ? 'Fulfilled' : order.status}
                                                            size="small"
                                                            color={order.status === 'fulfilled' ? 'success' : order.status === 'rejected' ? 'error' : 'warning'}
                                                            sx={{ fontWeight: 700 }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {order.notes || '-'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">{order.requestedBy}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {new Date(order.timestamp).toLocaleString()}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="nowrap">
                                                            <Tooltip title="Invoice">
                                                                <IconButton
                                                                    size="small"
                                                                    color="primary"
                                                                    onClick={() => setInvoiceOrder(order)}
                                                                    aria-label="View invoice"
                                                                >
                                                                    <ReceiptText size={19} />
                                                                </IconButton>
                                                            </Tooltip>
                                                            {isManager && order.sourceTransactionId && (
                                                                <Tooltip title="Delete transaction">
                                                                    <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => setTransactionToDelete({ id: order.sourceTransactionId!, productName: order.productName })}
                                                                    aria-label="Delete transaction"
                                                                    >
                                                                        <Trash2 size={19} />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            )}
                                                        </Stack>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Dialog open={Boolean(transactionToDelete)} onClose={() => setTransactionToDelete(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Delete transaction?</DialogTitle>
                <DialogContent>
                    <Typography color="text.secondary">
                        This will permanently remove the transaction for {transactionToDelete?.productName} and restore its stock.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTransactionToDelete(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={handleDeleteTransaction} disabled={transactionLoading}>
                        {transactionLoading ? 'Deleting...' : 'Delete transaction'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(invoiceOrder)} onClose={() => setInvoiceOrder(null)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReceiptText size={22} /> Order Invoice
                </DialogTitle>
                <DialogContent dividers>
                    {invoiceOrder && (
                        <Stack spacing={2.5} id="invoice-print-area">
                            <InvoiceLetterhead
                                title="Invoice"
                                billToLabel="Invoice to"
                                billTo={invoiceOrder.customerName || ANONYMOUS_CUSTOMER_NAME}
                                billToSubtitle={`Requested by ${invoiceOrder.requestedBy}`}
                                meta={[
                                    { label: 'Invoice date', value: new Date(invoiceOrder.timestamp).toLocaleDateString() },
                                    { label: 'Invoice time', value: new Date(invoiceOrder.timestamp).toLocaleTimeString() },
                                    { label: 'Invoice number', value: `#${invoiceOrder.id}` },
                                ]}
                            />

                            <Divider />

                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <Typography variant="caption" color="text.secondary">Payment Method</Typography>
                                    <Typography fontWeight={900}>{paymentMethodLabels[invoiceOrder.paymentMethod || 'cash']}</Typography>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <Typography variant="caption" color="text.secondary">Status</Typography>
                                    <Typography fontWeight={900} sx={{ textTransform: 'capitalize' }}>{invoiceOrder.status}</Typography>
                                </Grid>
                            </Grid>

                            <InvoiceItemsTable
                                items={[{
                                    description: invoiceOrder.productName,
                                    quantity: invoiceOrder.quantity,
                                    unitPrice: invoiceMoney(invoiceOrder.quantity > 0 ? (invoiceOrder.orderAmount || 0) / invoiceOrder.quantity : 0),
                                    total: invoiceMoney(invoiceOrder.orderAmount || 0),
                                }]}
                                totals={[
                                    { label: 'Total', value: invoiceMoney(invoiceOrder.orderAmount || 0), strong: true },
                                    ...((invoiceOrder.paidNow || 0) > 0
                                        ? [{ label: 'Paid Now', value: invoiceMoney(invoiceOrder.paidNow || 0) }]
                                        : []),
                                    ...((invoiceOrder.dueAmount || 0) > 0
                                        ? [{ label: 'Amount To Receive', value: invoiceMoney(invoiceOrder.dueAmount || 0), strong: true }]
                                        : []),
                                ]}
                                amountInWords={amountToWords(invoiceOrder.orderAmount || 0)}
                            />

                            {invoiceOrder.notes && (
                                <Alert severity={invoiceOrder.status === 'rejected' ? 'error' : 'info'}>
                                    {invoiceOrder.notes}
                                </Alert>
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2.5 }}>
                    <Button
                        variant="contained"
                        startIcon={<FileDown size={18} />}
                        onClick={handlePrintInvoice}
                        sx={{ fontWeight: 800 }}
                    >
                        Print Invoice
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<Share2 size={18} />}
                        onClick={handleShareInvoice}
                        disabled={sharingInvoice}
                        sx={{ fontWeight: 800 }}
                    >
                        {sharingInvoice ? 'Preparing...' : 'Share PDF'}
                    </Button>
                    <Button color="inherit" onClick={() => setInvoiceOrder(null)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={customerDialogOpen} onClose={resetCustomerDialog} maxWidth="md" fullWidth>
                <DialogTitle sx={{ fontWeight: 900 }}>Create New Customer</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2.5} sx={{ pt: 1 }}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                required
                                label="Full Name"
                                value={customerForm.fullName}
                                onChange={(e) => handleCustomerFormChange('fullName', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                required
                                label="CNIC"
                                value={customerForm.cnic}
                                onChange={(e) => handleCustomerFormChange('cnic', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                required
                                label="Phone Number"
                                value={customerForm.phoneNumber}
                                onChange={(e) => handleCustomerFormChange('phoneNumber', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                type="number"
                                label="Opening Amount"
                                value={customerForm.amount}
                                onChange={(e) => handleCustomerFormChange('amount', e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment>,
                                }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                select
                                fullWidth
                                label="Customer Type"
                                value={customerForm.customerType}
                                onChange={(e) => handleCustomerFormChange('customerType', e.target.value)}
                            >
                                <MenuItem value="regular">Regular</MenuItem>
                                <MenuItem value="credit">Credit</MenuItem>
                                <MenuItem value="installment">Installment</MenuItem>
                                <MenuItem value="wholesale">Wholesale</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Email"
                                value={customerForm.email}
                                onChange={(e) => handleCustomerFormChange('email', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="City"
                                value={customerForm.city}
                                onChange={(e) => handleCustomerFormChange('city', e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                label="Address"
                                value={customerForm.address}
                                onChange={(e) => handleCustomerFormChange('address', e.target.value)}
                            />
                        </Grid>
                        <Grid size={12}>
                            <TextField
                                fullWidth
                                multiline
                                minRows={2}
                                label="Notes"
                                value={customerForm.notes}
                                onChange={(e) => handleCustomerFormChange('notes', e.target.value)}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2.5 }}>
                    <Button color="inherit" onClick={resetCustomerDialog} disabled={customerSaving}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={handleCreateCustomer} disabled={customerSaving} sx={{ fontWeight: 800 }}>
                        {customerSaving ? 'Creating...' : 'Create & Select'}
                    </Button>
                </DialogActions>
            </Dialog>

            <style>
                {`
                @media print {
                    ${printTarget === 'invoice' ? '' : '@page { margin: 12mm; }'}

                    /* Drop everything outside the printed document from the layout.
                       Hiding by visibility alone keeps the page's full height and
                       spills the invoice across several blank sheets. */
                    body *:not(:has(${printTargetId})):not(${printTargetId}):not(${printTargetId} *) {
                        display: none !important;
                    }

                    /* Ancestors survive the rule above; strip their dialog chrome. */
                    body, #root, .MuiDialog-root, .MuiDialog-container, .MuiDialog-paper, .MuiDialogContent-root {
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

                    ${printTarget === 'invoice' ? thermalInvoicePrintCss(printTargetId) : `
                    ${printTargetId} {
                        display: block !important;
                        width: 100%;
                        background: #fff !important;
                        color: #000 !important;
                    }
                    ${printTargetId} * { color: #000 !important; }
                    `}
                }
                `}
            </style>
        </Box>
    );
};

export default OrderDesk;
