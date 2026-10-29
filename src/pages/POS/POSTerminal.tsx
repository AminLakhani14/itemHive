import { cartLineId, cartDescription, productForCart, isFixedProduct } from '../../lib/productSelling';
import useProductCategories from '../../hooks/useProductCategories';
import React, { useState, useMemo } from 'react';
import {
    Box,
    Grid,
    Typography,
    Card,
    CardActionArea,
    TextField,
    InputAdornment,
    Tabs,
    Tab,
    IconButton,
    Button,
    Divider,
    Paper,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    MenuItem,
    Stack,
    Snackbar,
    Alert,
    CircularProgress,
    useTheme,
    alpha
} from '@mui/material';
import {
    Search,
    ShoppingCart,
    Plus,
    Minus,
    CreditCard,
    Banknote,
    Receipt,
    CheckCircle,
    Printer,
    Share2,
    Download,
    Save,
    X
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { addToCart, updateCartItemPrice, updateQuantity, clearCart, replaceCart, setCartDiscountPercent } from '../../features/pos/posSlice';
import SalespersonSelect from '../../components/Payroll/SalespersonSelect';
import { resolveProductImage, fetchProducts, placeholderFallback } from '../../features/inventory/inventorySlice';
import { fetchTransactions } from '../../features/transactions/transactionSlice';
import type { Product } from '../../features/inventory/inventorySlice';
import type { AppDispatch } from '../../store';
import { motion, AnimatePresence } from 'framer-motion';
import useAppCurrency from '../../hooks/useAppCurrency';
import api from '../../api/axios';
import { getRegionalIdLabel } from '../../lib/regional';
import { DEFAULT_APP_SETTINGS } from '../../features/settings/settingsSlice';
import { hasInstallmentAccess } from '../../lib/screenPermissions';
import DocumentBanner from '../../components/Common/DocumentBanner';
import InvoiceLetterhead from '../../components/Common/InvoiceLetterhead';
import InvoiceItemsTable from '../../components/Common/InvoiceItemsTable';
import { amountToWords } from '../../lib/numberToWords';
import { buildInvoicePdfBlob, shareOrDownloadPdf } from '../../lib/invoicePdf';
import { thermalInvoicePrintCss } from '../../lib/thermalPrintCss';
import { printCheckoutCopies, printReceipt } from '../../lib/printReceipt';
import type { OrderDraft } from '../../types/orderDraft';
import TableOrdersPanel from '../../components/Orders/TableOrdersPanel';

const productCardFallback = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M80 35 119 57v46l-39 22-39-22V57z"/><path d="m41 57 39 23 39-23M80 80v45M60 46l39 23v17"/></g></svg>')}`;
import type { POSShift } from '../../types/posShift';
import { selectPrintSettings } from '../../features/branch/branchSlice';


type CheckoutMethod = 'cash' | 'card' | 'credit' | 'installment';
type OrderType = string;
type KitchenTicket = {
    draftCode: string;
    items: Array<{ id: string; name: string; quantity: number }>;
    orderTypeLabel: string;
    deliveryNumber: string;
    createdAt: string;
};
const showCreditKot = false;

const getRequestErrorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message
    || (error as { message?: string }).message
    || fallback;

const getOrderTypeLabel = (type: OrderType | '', customType: string) => {
    if (type === 'dine_in') return 'Dine In';
    if (type === 'takeaway') return 'Takeaway';
    if (type === 'foodpanda') return 'Foodpanda';
    if (type === 'other') return customType.trim() || 'Other';
    return type || 'Not specified';
};

const POSTerminal: React.FC = () => {
    const { categories: productCategories } = useProductCategories();
    const categories = useMemo(() => ['All', ...productCategories], [productCategories]);
    const dispatch = useDispatch<AppDispatch>();
    const theme = useTheme();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedDraftId = searchParams.get('draft');

    React.useEffect(() => {
        dispatch(fetchProducts({ force: true }));
    }, [dispatch]);

    const { user } = useSelector((state: RootState) => state.auth);
    const { products, loaded: productsLoaded, error: productsError } = useSelector((state: RootState) => state.inventory);
    const { cart, discountPercent } = useSelector((state: RootState) => state.pos);
    const { country } = useSelector((state: RootState) => state.settings);
    const app = useSelector(selectPrintSettings);
    const appSettings = app || DEFAULT_APP_SETTINGS;
    const { formatCurrency, currencySymbol } = useAppCurrency();
    const canOverridePrice = user?.role === 'super_admin' || user?.role === 'admin';
    const canAccessInstallments = hasInstallmentAccess(user, appSettings.installmentsEnabled);
    const regionalIdLabel = getRegionalIdLabel(country);
    const taxRate = Number(appSettings.salesTaxRate || 0) / 100;
    const taxLabel = `Tax (${Number(appSettings.salesTaxRate || 0).toLocaleString()}%)`;
    const discountsEnabled = Boolean(appSettings.discountsEnabled);
    const isRestaurant = Boolean(appSettings.restaurantEnabled);
    const discountOptions = Array.from(new Set((appSettings.discountOptions || [])
        .map(Number)
        .filter((option) => Number.isFinite(option) && option > 0 && option <= 100)))
        .sort((first, second) => first - second);
    const orderTypeOptions = Array.from(new Set((appSettings.orderTypeOptions || [])
        .map((option) => String(option || '').trim())
        .filter(Boolean)));

    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<CheckoutMethod | null>(null);
    const [orderType, setOrderType] = useState<OrderType | ''>('');
    const isFoodpandaOrder = orderType.trim().toLowerCase() === 'foodpanda';
    const [otherOrderType, setOtherOrderType] = useState('');
    const [deliveryNumber, setDeliveryNumber] = useState('');
    const [orderDone, setOrderDone] = useState(false);
    const [receiptId, setReceiptId] = useState('');
    const [receiptTime, setReceiptTime] = useState('');
    const [stockToast, setStockToast] = useState({ open: false, message: '' });
    const [sharingReceipt, setSharingReceipt] = useState(false);
    const [printingReceipt, setPrintingReceipt] = useState(false);
    const [printingKot, setPrintingKot] = useState(false);
    const [checkoutNeedsKot, setCheckoutNeedsKot] = useState(false);
    const autoPrintedOrderRef = React.useRef<string | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingMethod, setPendingMethod] = useState<CheckoutMethod | null>(null);
    const [confirmingPayment, setConfirmingPayment] = useState(false);
    // The receipt can be shown immediately, but it remains non-final until the
    // server has atomically recorded the sale and stock movement.
    const [paymentCommitPending, setPaymentCommitPending] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
    const [activeDraftCode, setActiveDraftCode] = useState('');
    const [activeDraftTable, setActiveDraftTable] = useState('');
    const [activeDraftUpdatedAt, setActiveDraftUpdatedAt] = useState('');
    const [draftReloadVersion, setDraftReloadVersion] = useState(0);
    const loadedDraftRef = React.useRef<string | null>(null);
    // This is the last saved version of an open draft. It lets an update KOT
    // contain only the items (or additional quantities) newly sent to kitchen.
    const savedDraftItemsRef = React.useRef<OrderDraft['items']>([]);
    const [draftKot, setDraftKot] = useState<KitchenTicket | null>(null);
    // State updates apply on the next render; this ref blocks a rapid double
    // click immediately, before the button visually becomes disabled.
    const checkoutInFlightRef = React.useRef(false);
    const [salespersonEmployeeId, setSalespersonEmployeeId] = useState('');
    const [creditOpen, setCreditOpen] = useState(false);
    const [creditPaidInput, setCreditPaidInput] = useState('');
    const [creditPaidVia, setCreditPaidVia] = useState<'cash' | 'card'>('cash');
    const [creditPaidNow, setCreditPaidNow] = useState(0);
    const [creditDue, setCreditDue] = useState(0);
    const [creditCustomerName, setCreditCustomerName] = useState('');
    const [creditCustomerCnic, setCreditCustomerCnic] = useState('');
    const [foodpandaOpen, setFoodpandaOpen] = useState(false);
    const [foodpandaOrderNumber, setFoodpandaOrderNumber] = useState('');
    const [foodpandaRiderName, setFoodpandaRiderName] = useState('');
    const [installmentOpen, setInstallmentOpen] = useState(false);
    const [installmentCustomerName, setInstallmentCustomerName] = useState('');
    const [installmentCustomerCnic, setInstallmentCustomerCnic] = useState('');
    const [installmentCustomerPhone, setInstallmentCustomerPhone] = useState('');
    const [installmentCustomerAddress, setInstallmentCustomerAddress] = useState('');
    const [witnessOneName, setWitnessOneName] = useState('');
    const [witnessOneCnic, setWitnessOneCnic] = useState('');
    const [witnessOneAddress, setWitnessOneAddress] = useState('');
    const [witnessTwoName, setWitnessTwoName] = useState('');
    const [witnessTwoCnic, setWitnessTwoCnic] = useState('');
    const [witnessTwoAddress, setWitnessTwoAddress] = useState('');
    const [installmentMonths, setInstallmentMonths] = useState<3 | 6 | 9 | 12>(3);
    const [installmentSaleDate, setInstallmentSaleDate] = useState(new Date().toISOString().split('T')[0]);
    const [installmentUnitPriceInput, setInstallmentUnitPriceInput] = useState('');
    const [installmentAdvanceInput, setInstallmentAdvanceInput] = useState('0');
    const [installmentAdvancePaidVia, setInstallmentAdvancePaidVia] = useState<'cash' | 'card'>('cash');
    const [openShift, setOpenShift] = useState<POSShift | null>(null);
    const [shiftLoading, setShiftLoading] = useState(true);

    React.useEffect(() => {
        let cancelled = false;
        const loadOpenShift = async () => {
            setShiftLoading(true);
            try {
                const response = await api.get<{ shift: POSShift | null }>('/pos-shifts/current');
                if (!cancelled) setOpenShift(response.data.shift);
            } catch {
                if (!cancelled) setOpenShift(null);
            } finally {
                if (!cancelled) setShiftLoading(false);
            }
        };
        void loadOpenShift();
        window.addEventListener('itemhive-pos-shift-changed', loadOpenShift);
        window.addEventListener('itemhive-workspace-changed', loadOpenShift);
        return () => {
            cancelled = true;
            window.removeEventListener('itemhive-pos-shift-changed', loadOpenShift);
            window.removeEventListener('itemhive-workspace-changed', loadOpenShift);
        };
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.sku.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = activeTab === 0 || p.category === categories[activeTab];
            return matchesSearch && matchesCategory;
        });
    }, [products, searchTerm, activeTab, categories]);

    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const projectedProfit = cart.reduce((acc, item) => acc + ((item.price - item.purchasePrice) * item.quantity), 0);
    const tax = subtotal * taxRate;
    const appliedDiscountPercent = discountsEnabled && discountOptions.includes(Number(discountPercent)) ? Number(discountPercent) : 0;
    const activeDiscount = subtotal * (appliedDiscountPercent / 100);
    const total = subtotal + tax - activeDiscount;

    React.useEffect(() => {
        if (discountPercent !== appliedDiscountPercent) dispatch(setCartDiscountPercent(appliedDiscountPercent));
    }, [discountPercent, appliedDiscountPercent, dispatch]);
    const draftCreditPaid = Math.min(Math.max(Number(creditPaidInput || 0), 0), total);
    const draftCreditDue = Math.max(total - draftCreditPaid, 0);
    const installmentItem = cart[0];
    const installmentQuantity = installmentItem?.quantity || 0;
    const defaultInstallmentUnitPrice = installmentItem?.price || 0;
    const draftInstallmentUnitPrice = Math.max(Number(installmentUnitPriceInput || defaultInstallmentUnitPrice || 0), 0);
    const draftInstallmentTotal = draftInstallmentUnitPrice * installmentQuantity;
    const draftInstallmentAdvance = Math.min(Math.max(Number(installmentAdvanceInput || 0), 0), Math.max(draftInstallmentTotal - 0.01, 0));
    const draftInstallmentRemaining = Math.max(draftInstallmentTotal - draftInstallmentAdvance, 0);
    const draftMonthlyInstallment = installmentMonths > 0 ? draftInstallmentRemaining / installmentMonths : 0;
    const draftInstallmentProfit = installmentItem
        ? (draftInstallmentUnitPrice - installmentItem.purchasePrice) * installmentQuantity
        : 0;
    const isOrderTypeComplete = !isRestaurant || Boolean(orderType && (orderType !== 'other' || otherOrderType.trim()));
    const canChoosePayment = cart.length > 0 && isOrderTypeComplete && Boolean(openShift) && !shiftLoading && !savingDraft;
    const orderTypeLabel = isRestaurant ? getOrderTypeLabel(orderType, otherOrderType) : '';

    React.useEffect(() => {
        if (!isRestaurant) {
            setOrderType('');
            setOtherOrderType('');
            setDeliveryNumber('');
        }
    }, [isRestaurant]);

    React.useEffect(() => {
        if (!requestedDraftId) {
            loadedDraftRef.current = null;
            setActiveDraftId(null);
            setActiveDraftCode('');
            setActiveDraftTable('');
            return;
        }
        if (!productsLoaded || loadedDraftRef.current === requestedDraftId) return;

        let cancelled = false;
        const loadDraft = async () => {
            try {
                const response = await api.get<OrderDraft>(`/order-drafts/${requestedDraftId}`);
                if (response.data.salespersonEmployeeId) setSalespersonEmployeeId(response.data.salespersonEmployeeId);
                if (cancelled) return;
                const unavailableNames: string[] = [];
                const restoredCart = response.data.items.flatMap((draftItem) => {
                    const product = products.find((candidate) => candidate.id === draftItem.productId);
                    if (!product) {
                        unavailableNames.push(draftItem.productName);
                        return [];
                    }
                    try { return [{ ...productForCart(product, draftItem.sizeId || undefined), price: draftItem.unitPrice, quantity: draftItem.quantity }]; }
                    catch { unavailableNames.push(draftItem.productName); return []; }
                });

                if (restoredCart.length === 0) {
                    throw new Error('None of the products in this draft are available anymore.');
                }

                dispatch(replaceCart({ cart: restoredCart, discountPercent: response.data.discountPercent }));
                setOrderType(response.data.orderType || '');
                setOtherOrderType(response.data.otherOrderType || '');
                setDeliveryNumber(response.data.deliveryNumber || '');
                setPendingMethod('cash');
                setActiveDraftId(response.data._id);
                setActiveDraftCode(response.data.draftCode);
                setActiveDraftTable(response.data.digitalMenuTable?.trim() || '');
                setActiveDraftUpdatedAt(response.data.updatedAt);
                savedDraftItemsRef.current = response.data.items;
                loadedDraftRef.current = requestedDraftId;
                if (unavailableNames.length > 0) {
                    setStockToast({ open: true, message: `${unavailableNames.join(', ')} could not be restored because they no longer exist.` });
                }
            } catch (requestError: unknown) {
                if (cancelled) return;
                setStockToast({ open: true, message: getRequestErrorMessage(requestError, 'Order draft could not be opened.') });
                navigate('/order-drafts', { replace: true });
            }
        };

        void loadDraft();
        return () => {
            cancelled = true;
        };
    }, [dispatch, navigate, products, productsLoaded, requestedDraftId, draftReloadVersion]);

    React.useEffect(() => {
        if (!draftKot) return;

        let cancelled = false;
        const printDraftKot = async () => {
            // Wait for React to place the snapshot into the hidden print node.
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
            if (cancelled) return;

            const kitchenTicket = document.getElementById('pos-draft-kot');
            if (!kitchenTicket) return;

            try {
                // A 58mm roll uses a 52mm receipt box, including its padding.
                // Keep the ticket at thermal width on the selected printer paper.
                await printReceipt(kitchenTicket, '#pos-draft-kot', 58);
                if (!cancelled) setDraftKot(null);
            } catch {
                if (!cancelled) {
                    setStockToast({ open: true, message: 'Draft was updated, but the KOT could not be prepared for printing.' });
                }
            }
        };

        void printDraftKot();
        return () => { cancelled = true; };
    }, [draftKot]);

    /** POS invoice PDF: uses the same document structure as Order Desk. */
    const buildReceiptPdf = (id: string, method: CheckoutMethod, receiptTimeIso: string) => {
        // Foodpanda uses the card checkout path internally, but it is not a
        // customer card payment. Keep the customer-facing receipt unambiguous.
        const paymentLabel = isFoodpandaOrder
            ? 'FOODPANDA'
            : method === 'credit'
            ? `CREDIT (${creditPaidVia.toUpperCase()} + DUE)`
            : method === 'installment'
                ? `INSTALLMENT (${installmentMonths} MONTHS)`
                : method.toUpperCase();
        const pdfTotal = method === 'installment' ? draftInstallmentTotal : total;
        const customerName = method === 'credit' ? creditCustomerName : method === 'installment' ? installmentCustomerName : '';
        const customerCnic = method === 'credit' ? creditCustomerCnic : method === 'installment' ? installmentCustomerCnic : '';

        return buildInvoicePdfBlob({
            title: 'Invoice',
            bannerDataUrl: appSettings.invoiceLogoUrl || appSettings.receiptBannerUrl || undefined,
            shop: {
                name: appSettings.shopName || DEFAULT_APP_SETTINGS.shopName,
                address: appSettings.shopAddress,
                phone: appSettings.shopPhone,
            },
            billToLabel: customerName ? 'Invoice to' : 'Served by',
            billTo: customerName || user?.name || 'Staff',
            billToSubtitle: customerName ? `${regionalIdLabel}: ${customerCnic || '-'}` : undefined,
            meta: [
                { label: 'Invoice date', value: new Date(receiptTimeIso).toLocaleDateString() },
                { label: 'Invoice time', value: new Date(receiptTimeIso).toLocaleTimeString() },
                { label: 'Invoice number', value: `#${id}` },
                ...(isFoodpandaOrder ? [
                    { label: 'Foodpanda order no.', value: foodpandaOrderNumber.trim() },
                    { label: 'Rider name', value: foodpandaRiderName.trim() },
                ] : []),
            ],
            columns: [
                { label: '#', width: 0.6 },
                { label: 'Description', width: 5 },
                { label: 'Qty', width: 1, align: 'right' },
                { label: 'Unit price', width: 1.7, align: 'right' },
                { label: 'Total', width: 1.9, align: 'right' },
            ],
            rows: cart.map((item, index) => {
                const lineUnitPrice = method === 'installment' ? draftInstallmentUnitPrice : item.price;
                return [
                    String(index + 1),
                    cartDescription(item),
                    String(item.quantity),
                    formatCurrency(lineUnitPrice),
                    formatCurrency(lineUnitPrice * item.quantity),
                ];
            }),
            totals: [
                ...(method !== 'installment'
                    ? activeDiscount > 0
                        ? [{ label: 'Original Total (Before Discount)', value: formatCurrency(subtotal + tax) }]
                        : [
                            { label: 'Subtotal', value: formatCurrency(subtotal) },
                            ...(tax > 0 ? [{ label: taxLabel, value: formatCurrency(tax) }] : []),
                        ]
                    : []),
                ...(method !== 'installment' && activeDiscount > 0 ? [
                    { label: `Discount (${appliedDiscountPercent}%)`, value: `-${formatCurrency(activeDiscount)}` },
                    { label: 'You Saved', value: formatCurrency(activeDiscount) },
                ] : []),
                ...(method === 'credit' ? [
                    { label: 'Paid Now', value: formatCurrency(creditPaidNow) },
                    { label: 'Remaining Due', value: formatCurrency(creditDue) },
                ] : []),
                ...(method === 'installment' ? [
                    { label: 'Advance Paid', value: formatCurrency(draftInstallmentAdvance) },
                    { label: 'EMI Balance', value: formatCurrency(draftInstallmentRemaining) },
                    { label: 'Monthly EMI', value: formatCurrency(draftMonthlyInstallment) },
                ] : []),
                {
                    label: method === 'installment' ? 'Installment Total' : method === 'credit' ? 'Order Total' : 'Total Paid',
                    value: formatCurrency(pdfTotal),
                    strong: true,
                },
            ],
            amountInWords: amountToWords(pdfTotal),
            footer: `Payment method: ${paymentLabel}${isRestaurant ? `  |  Order type: ${orderTypeLabel}` : ''}  |  Cashier: ${user?.name || 'Staff'}`,
        });
    };

    const handleSaveReceiptPdf = async (id: string, method: CheckoutMethod, receiptTimeIso: string) => {
        try {
            const blob = await buildReceiptPdf(id, method, receiptTimeIso);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `invoice-${id}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch {
            setStockToast({ open: true, message: 'Could not build the invoice PDF.' });
        }
    };

    const handleShareReceiptPdf = async (id: string, method: CheckoutMethod, receiptTimeIso: string) => {
        setSharingReceipt(true);
        try {
            const blob = await buildReceiptPdf(id, method, receiptTimeIso);
            const result = await shareOrDownloadPdf(blob, `invoice-${id}.pdf`, 'Invoice');
            setStockToast({
                open: true,
                message: result === 'shared' ? 'Invoice shared.' : 'Invoice PDF downloaded.',
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setStockToast({ open: true, message: 'Could not build the invoice PDF.' });
        } finally {
            setSharingReceipt(false);
        }
    };

    const [sellingProduct, setSellingProduct] = useState<Product | null>(null);
    const [sellingSizeId, setSellingSizeId] = useState('');
    const [sellingQuantity, setSellingQuantity] = useState('');
    const [sellingError, setSellingError] = useState('');
    const addSellingProduct = () => {
        if (!sellingProduct) return;
        try {
            const line = productForCart(sellingProduct, sellingSizeId || undefined);
            const quantity = Number(sellingQuantity);
            const existing = cart.find(item => item.id === line.id)?.quantity || 0;
            const fractional = sellingProduct.sellingType === 'quantity';
            if (!Number.isFinite(quantity) || quantity <= 0 || (!fractional && !Number.isInteger(quantity))) throw new Error(fractional ? 'Enter a positive quantity.' : 'Enter a whole number of bottles/packs.');
            if (Number((existing + quantity).toPrecision(15)) > line.stock) throw new Error('Quantity exceeds available stock.');
            dispatch(addToCart({ ...line, quantity }));
            setSellingProduct(null);
        } catch (error) { setSellingError(error instanceof Error ? error.message : 'Invalid quantity.'); }
    };
    const handleAddToCart = (product: Product) => {
        if (product.unitSizeEnabled) {
            setSellingProduct(product); setSellingSizeId(''); setSellingQuantity(''); setSellingError(''); return;
        }
        if (savingDraft) return;
        const itemInCart = cart.find(item => item.id === product.id);
        const currentQty = itemInCart ? itemInCart.quantity : 0;

        if (product.stock <= 0) {
            setStockToast({ open: true, message: `${product.name} is out of stock.` });
            return;
        }

        if (product.stock <= currentQty) {
            setStockToast({ open: true, message: `${product.name} is out of stock.` });
            return;
        }

        dispatch(addToCart(product));
    };

    const handleSaveDraft = async () => {
        if (cart.length === 0 || savingDraft || confirmingPayment) return;
        setSavingDraft(true);
        try {
            const payload = {
                salespersonEmployeeId: salespersonEmployeeId || undefined,
                items: cart.map((item) => ({
                    productId: item.productId || item.id, sizeId: item.sizeId,
                    quantity: item.quantity,
                    unitPrice: item.price,
                })),
                discountPercent: appliedDiscountPercent,
                orderType: isRestaurant && orderType ? orderType : undefined,
                otherOrderType: isRestaurant && orderType === 'other' ? otherOrderType.trim() : undefined,
                deliveryNumber: isRestaurant ? deliveryNumber.trim() : undefined,
            };

            const wasUpdatingDraft = Boolean(activeDraftId);
            if (wasUpdatingDraft) {
                const draftId = activeDraftId!;
                const originalDraftItems = savedDraftItemsRef.current;
                // Keep the cart intact until saving succeeds so failures can
                // be retried without losing edits or replacing another order.
                const response = await api.put<OrderDraft>(`/order-drafts/${draftId}`, payload);
                window.dispatchEvent(new Event('itemhive-order-drafts-changed'));
                const savedQuantities = new Map(originalDraftItems.map((item) => [cartLineId(item.productId, item.sizeId), item.quantity]));
                const addedItems = response.data.items.flatMap((item) => {
                    const addedQuantity = item.quantity - (savedQuantities.get(cartLineId(item.productId, item.sizeId)) || 0);
                    return addedQuantity > 0
                        ? [{ id: cartLineId(item.productId, item.sizeId), name: item.productName, quantity: addedQuantity }]
                        : [];
                });
                if (addedItems.length > 0 && isRestaurant) {
                    setDraftKot({
                        draftCode: response.data.draftCode,
                        items: addedItems,
                        orderTypeLabel: getOrderTypeLabel(orderType, otherOrderType),
                        deliveryNumber: deliveryNumber.trim(),
                        createdAt: new Date().toISOString(),
                    });
                }
                handleCloseOrder();
                setActiveDraftId(null);
                setActiveDraftCode('');
                savedDraftItemsRef.current = [];
                loadedDraftRef.current = null;
                navigate('/pos', { replace: true });
                setStockToast({
                    open: true,
                    message: addedItems.length > 0 && isRestaurant
                        ? `${response.data.draftCode} updated. KOT is ready for the new items.`
                        : `${response.data.draftCode} updated successfully.`,
                });
                return;
            }

            const response = await api.post<OrderDraft>('/order-drafts', payload);
            window.dispatchEvent(new Event('itemhive-order-drafts-changed'));

            if (isRestaurant) {
                setDraftKot({
                    draftCode: response.data.draftCode,
                    items: response.data.items.map((item) => ({ id: item.productId, name: item.productName, quantity: item.quantity })),
                    orderTypeLabel: getOrderTypeLabel(orderType, otherOrderType),
                    deliveryNumber: deliveryNumber.trim(),
                    createdAt: new Date().toISOString(),
                });
            }
            // The KOT owns a snapshot, so clearing the terminal cannot empty
            // the printout. Keep the saved draft in Order Drafts for payment.
            handleCloseOrder();
            setActiveDraftId(null);
            setActiveDraftCode('');
            savedDraftItemsRef.current = [];
            loadedDraftRef.current = null;
            navigate('/pos', { replace: true });
            setStockToast({
                open: true,
                message: isRestaurant
                    ? `${response.data.draftCode} saved. KOT is ready for the kitchen.`
                    : `${response.data.draftCode} saved. POS is ready for a new order.`,
            });
        } catch (requestError: unknown) {
            setStockToast({ open: true, message: getRequestErrorMessage(requestError, 'Order draft could not be saved.') });
        } finally {
            setSavingDraft(false);
        }
    };

    const removePaidDraft = async () => {
        if (!activeDraftId) return;
        try {
            await api.delete(`/order-drafts/${activeDraftId}`);
            window.dispatchEvent(new Event('itemhive-order-drafts-changed'));
            setActiveDraftId(null);
            setActiveDraftCode('');
            setActiveDraftTable('');
            loadedDraftRef.current = null;
            navigate('/pos', { replace: true });
        } catch {
            setStockToast({ open: true, message: 'Payment succeeded, but the paid draft could not be removed. Please delete it from Order Drafts.' });
        }
    };

    // Product and history reloads can be large for an established business.
    // They keep the shared caches current, but a completed checkout must not
    // wait for them before showing the receipt to the cashier.
    const refreshPosDataInBackground = () => {
        void Promise.allSettled([
            dispatch(fetchProducts({ force: true })).unwrap(),
            dispatch(fetchTransactions()).unwrap(),
        ]);
    };

    const handleCheckout = (method: 'cash' | 'card') => {
        if (method === 'card' && isFoodpandaOrder) {
            setFoodpandaOpen(true);
            return;
        }
        setPendingMethod(method);
    };

    const handleContinueFoodpanda = () => {
        if (!foodpandaOrderNumber.trim() || !foodpandaRiderName.trim()) {
            setStockToast({ open: true, message: 'Foodpanda order number and rider name are required.' });
            return;
        }
        setPendingMethod('card');
        setFoodpandaOpen(false);
    };

    const handleOpenCredit = () => {
        const suggestedPaidNow = Math.max(total * 0.8, 0);
        setCreditPaidInput(suggestedPaidNow.toFixed(2));
        setCreditPaidVia('cash');
        setCreditCustomerName('');
        setCreditCustomerCnic('');
        setCreditOpen(true);
    };

    const handleOpenInstallment = () => {
        if (!canAccessInstallments) {
            setStockToast({ open: true, message: 'Installment access has not been enabled for this account.' });
            return;
        }
        if (cart.length !== 1) {
            setStockToast({ open: true, message: 'Installment sale currently supports one product at a time.' });
            return;
        }

        setInstallmentCustomerName('');
        setInstallmentCustomerCnic('');
        setInstallmentCustomerPhone('');
        setInstallmentCustomerAddress('');
        setWitnessOneName('');
        setWitnessOneCnic('');
        setWitnessOneAddress('');
        setWitnessTwoName('');
        setWitnessTwoCnic('');
        setWitnessTwoAddress('');
        setInstallmentMonths(3);
        setInstallmentSaleDate(new Date().toISOString().split('T')[0]);
        setInstallmentUnitPriceInput(String(cart[0]?.price || 0));
        setInstallmentAdvanceInput('0');
        setInstallmentAdvancePaidVia('cash');
        setInstallmentOpen(true);
    };

    const handleContinueCredit = () => {
        if (!creditCustomerName.trim() || !creditCustomerCnic.trim()) {
            setStockToast({ open: true, message: `Customer name and ${regionalIdLabel} are required for credit sales.` });
            return;
        }
        if (draftCreditDue <= 0) {
            setStockToast({ open: true, message: 'Use Cash/Card for full payment. Credit requires a due amount.' });
            return;
        }
        setCreditPaidNow(draftCreditPaid);
        setCreditDue(draftCreditDue);
        setPendingMethod('credit');
        setCreditOpen(false);
    };

    const handleContinueInstallment = () => {
        if (!installmentCustomerName.trim() || !installmentCustomerCnic.trim() || !installmentCustomerPhone.trim() || !installmentCustomerAddress.trim()) {
            setStockToast({ open: true, message: `Customer name, ${regionalIdLabel}, phone, and address are required for installment sales.` });
            return;
        }
        if (!witnessOneName.trim() || !witnessOneCnic.trim() || !witnessOneAddress.trim() || !witnessTwoName.trim() || !witnessTwoCnic.trim() || !witnessTwoAddress.trim()) {
            setStockToast({ open: true, message: `Both witness names, ${regionalIdLabel} values, and addresses are required.` });
            return;
        }
        if (draftInstallmentTotal <= 0) {
            setStockToast({ open: true, message: 'Installment sale price must be greater than zero.' });
            return;
        }
        if (draftInstallmentRemaining <= 0) {
            setStockToast({ open: true, message: 'Advance payment must be less than the installment sale total.' });
            return;
        }

        setPendingMethod('installment');
        setInstallmentOpen(false);
    };

    const handleConfirmCheckout = async () => {
        if (!pendingMethod || confirmingPayment || checkoutInFlightRef.current) return;
        if (!openShift) {
            setStockToast({ open: true, message: 'Open a POS shift before taking payment.' });
            return;
        }
        if (isRestaurant && !isOrderTypeComplete) {
            setStockToast({ open: true, message: 'Select an order type before taking payment.' });
            return;
        }

        checkoutInFlightRef.current = true;
        // The previous timestamp suffix repeated every ~17 minutes. A UUID is
        // generated once per checkout for its receipt and transaction IDs.
        const id = `R-${crypto.randomUUID()}`;
        const receiptTimeIso = new Date().toISOString();
        const currentMethod = pendingMethod;
        // A saved draft has already sent its KOT to the kitchen. Capture this
        // before the paid draft is deleted in the background.
        setCheckoutNeedsKot(isRestaurant && !activeDraftId);
        setConfirmingPayment(true);
        setPaymentCommitPending(true);
        setReceiptId(id);
        setReceiptTime(receiptTimeIso);
        setPaymentMethod(currentMethod);
        setOrderDone(true);
        setConfirmOpen(false);
        setPendingMethod(null);

        try {
        if (pendingMethod === 'installment') {
            const item = cart[0];

            try {
                await api.post('/installments', {
                    salespersonEmployeeId: salespersonEmployeeId || undefined,
                    planCode: `INS-${crypto.randomUUID()}`,
                    productId: item.productId || item.id, sizeId: item.sizeId,
                    productName: item.name,
                    amount: item.quantity,
                    totalAmount: draftInstallmentTotal,
                    unitPrice: draftInstallmentUnitPrice,
                    advancePayment: draftInstallmentAdvance,
                    advancePaidVia: installmentAdvancePaidVia,
                    customerName: installmentCustomerName.trim(),
                    customerCnic: installmentCustomerCnic.trim(),
                    customerPhone: installmentCustomerPhone.trim(),
                    customerAddress: installmentCustomerAddress.trim(),
                    saleDate: installmentSaleDate,
                    installmentMonths,
                    userName: user?.name || 'Staff',
                    orderType: isRestaurant ? orderType : undefined,
                    otherOrderType: isRestaurant && orderType === 'other' ? otherOrderType.trim() : undefined,
                    shiftId: openShift._id,
                    orderId: id,
                    witnesses: [
                        { name: witnessOneName.trim(), cnic: witnessOneCnic.trim(), address: witnessOneAddress.trim() },
                        { name: witnessTwoName.trim(), cnic: witnessTwoCnic.trim(), address: witnessTwoAddress.trim() },
                    ],
                });

                window.dispatchEvent(new Event('itemhive-installments-updated'));
                setPaymentCommitPending(false);
                refreshPosDataInBackground();
                void removePaidDraft();
                return;
            } catch (error: unknown) {
                setPaymentCommitPending(false);
                setOrderDone(false);
                setPaymentMethod(null);
                setConfirmOpen(true);
                setPendingMethod(currentMethod);
                setStockToast({
                    open: true,
                    message: getRequestErrorMessage(error, 'Installment plan could not be created.'),
                });
                return;
            }
        }

        try {
            await api.post('/transactions/checkout', {
                salespersonEmployeeId: salespersonEmployeeId || undefined,
                orderId: id,
                draftId: activeDraftId || undefined,
                shiftId: openShift._id,
                items: cart.map((item) => ({ productId: item.productId || item.id, sizeId: item.sizeId, quantity: item.quantity, unitPrice: item.price })),
                discountPercent: appliedDiscountPercent,
                paymentMethod: pendingMethod,
                paidVia: pendingMethod === 'credit' ? creditPaidVia : pendingMethod,
                paidNow: pendingMethod === 'credit' ? creditPaidNow : total,
                customerName: pendingMethod === 'credit' ? creditCustomerName.trim() : undefined,
                customerCnic: pendingMethod === 'credit' ? creditCustomerCnic.trim() : undefined,
                orderType: isRestaurant ? orderType : undefined,
                otherOrderType: isRestaurant && orderType === 'other' ? otherOrderType.trim() : undefined,
                foodpandaOrderNumber: isFoodpandaOrder ? foodpandaOrderNumber.trim() : undefined,
                foodpandaRiderName: isFoodpandaOrder ? foodpandaRiderName.trim() : undefined,
            });
        } catch (error: unknown) {
            setPaymentCommitPending(false);
            setOrderDone(false);
            setPaymentMethod(null);
            setConfirmOpen(true);
            setPendingMethod(currentMethod);
            setStockToast({ open: true, message: getRequestErrorMessage(error, 'Sale could not be completed.') });
            return;
        }

        setPaymentCommitPending(false);
        refreshPosDataInBackground();
        void removePaidDraft();
        } finally {
            setConfirmingPayment(false);
            checkoutInFlightRef.current = false;
        }
    };

    const handleCancelCheckout = () => {
        if (confirmingPayment) return;
        setConfirmOpen(false);
        setPendingMethod(null);
    };

    const handleOrderTypeChange = (value: OrderType | '') => {
        setOrderType(value);
        setOtherOrderType('');
        setPendingMethod(null);
        if (value.trim().toLowerCase() !== 'foodpanda') {
            setFoodpandaOrderNumber('');
            setFoodpandaRiderName('');
        }
    };

    const handlePayNow = () => {
        if (!isOrderTypeComplete || !pendingMethod) return;
        setConfirmOpen(true);
    };

    const handleCloseOrder = () => {
        if (paymentCommitPending) return;
        setActiveDraftTable('');
        dispatch(clearCart());
        setOrderDone(false);
        setPrintingReceipt(false);
        setPrintingKot(false);
        setCheckoutNeedsKot(false);
        setPaymentMethod(null);
        setOrderType('');
        setOtherOrderType('');
        setDeliveryNumber('');
        setPendingMethod(null);
        setCreditPaidNow(0);
        setCreditDue(0);
        setCreditCustomerName('');
        setCreditCustomerCnic('');
        setFoodpandaOrderNumber('');
        setFoodpandaRiderName('');
        setInstallmentCustomerName('');
        setInstallmentCustomerCnic('');
        setInstallmentCustomerPhone('');
        setInstallmentCustomerAddress('');
        setWitnessOneName('');
        setWitnessOneCnic('');
        setWitnessOneAddress('');
        setWitnessTwoName('');
        setWitnessTwoCnic('');
        setWitnessTwoAddress('');
        setInstallmentMonths(3);
        setInstallmentUnitPriceInput('');
        setInstallmentAdvanceInput('0');
        setInstallmentAdvancePaidVia('cash');
    };

    const handlePrint = async () => {
        const receipt = document.getElementById('pos-receipt');
        if (!receipt || printingReceipt || printingKot || paymentCommitPending) return;

        setPrintingReceipt(true);
        try {
            if (checkoutNeedsKot) {
                const kitchenTicket = receipt.closest('[role="dialog"]')?.querySelector<HTMLElement>('#pos-kot');
                if (!kitchenTicket) throw new Error('Kitchen ticket is unavailable.');
                await printCheckoutCopies(receipt, kitchenTicket);
            } else {
                await printReceipt(receipt);
            }
            handleCloseOrder();
        } catch {
            setStockToast({ open: true, message: 'Could not prepare the receipt for printing.' });
        } finally {
            setPrintingReceipt(false);
        }
    };

    const handlePrintKot = async () => {
        const kitchenTicket = document.getElementById('pos-kot');
        if (!kitchenTicket || printingKot || printingReceipt || paymentCommitPending) return;

        setPrintingKot(true);
        try {
            await printReceipt(kitchenTicket, '#pos-kot');
        } catch {
            setStockToast({ open: true, message: 'Could not prepare the kitchen ticket for printing.' });
        } finally {
            setPrintingKot(false);
        }
    };

    React.useEffect(() => {
        if (!orderDone || paymentCommitPending || !checkoutNeedsKot || !receiptId
            || autoPrintedOrderRef.current === receiptId) return;
        const receipt = document.getElementById('pos-receipt');
        const kitchenTicket = receipt?.closest('[role="dialog"]')?.querySelector<HTMLElement>('#pos-kot');
        if (!receipt || !kitchenTicket) return;

        // Mark before awaiting printing so rerenders cannot duplicate the job.
        autoPrintedOrderRef.current = receiptId;
        setPrintingReceipt(true);
        void printCheckoutCopies(receipt, kitchenTicket)
            .catch(() => {
                setStockToast({ open: true, message: 'Payment succeeded, but printing could not be prepared. Use Receipt to retry.' });
            })
            .finally(() => setPrintingReceipt(false));
    }, [orderDone, paymentCommitPending, checkoutNeedsKot, receiptId]);

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: { xs: 'column', lg: 'row' },
                gap: { xs: 1.5, sm: 2 },
                height: { xs: 'auto', lg: 'calc(100vh - 96px)' },
                minHeight: { lg: 'calc(100vh - 96px)' },
                overflow: { xs: 'visible', lg: 'hidden' }
            }}
        >
            {/* Left Side: Product Selection */}
            <Box inert={savingDraft} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                <TableOrdersPanel compact activeDraftId={activeDraftId} activeDraftUpdatedAt={activeDraftUpdatedAt} confirmSwitch={cart.length > 0 && !orderDone} busy={savingDraft || confirmingPayment || paymentCommitPending} onOpenOrder={(draft) => {
                    setOrderDone(false);
                    loadedDraftRef.current = null;
                    setDraftReloadVersion(version => version + 1);
                    navigate(`/pos?draft=${draft._id}`);
                }} />
                <Paper sx={{ p: { xs: 1.25, sm: 1.5 }, mb: 1, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
                    <TextField
                        fullWidth
                        placeholder="Scan Barcode or Search (Name/SKU)..."
                        variant="outlined"
                        size="small"
                        autoFocus
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search size={20} color={theme.palette.primary.main} />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Paper>

                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ mb: 0.75, minHeight: 42, borderBottom: 1, borderColor: 'divider' }}
                >
                    {categories.map((cat) => (
                        <Tab key={cat} label={cat} sx={{ fontWeight: 750, fontSize: '0.82rem', px: { xs: 1.25, sm: 1.75 }, minHeight: 42, textTransform: 'none' }} />
                    ))}
                </Tabs>

                <Box sx={{ flexGrow: 1, overflowY: 'auto', pr: { xs: 0.5, sm: 1 }, pt: 0.75, pb: 1, px: { xs: 0.5, sm: 1 } }}>
                    {productsError ? (
                        <Alert
                            severity="error"
                            action={<Button color="inherit" size="small" onClick={() => dispatch(fetchProducts({ force: true }))}>Retry</Button>}
                            sx={{ m: 1 }}
                        >
                            {productsError}
                        </Alert>
                    ) : filteredProducts.length === 0 ? (
                        <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ minHeight: 300 }}>
                            <Typography fontWeight={700}>No products found</Typography>
                            <Typography variant="body2" color="text.secondary">Try another category or search term.</Typography>
                        </Stack>
                    ) : (
                    <Grid container spacing={{ xs: 1.25, sm: 1.5 }}>
                        {filteredProducts.map((product) => (
                            <Grid
                                key={product.id}
                                size={{ xs: 6, sm: 6, md: 4, xl: 3 }}
                            >
                                <Card
                                    sx={{
                                        height: '100%', display: 'flex', flexDirection: 'column',
                                        borderRadius: 2.5, border: '1px solid', borderColor: 'divider',
                                        bgcolor: 'background.paper', overflow: 'hidden',
                                        boxShadow: `0 2px 6px ${alpha(theme.palette.common.black, 0.025)}`,
                                        transition: 'border-color 160ms ease, box-shadow 160ms ease',
                                        '&:hover': product.stock > 0 ? {
                                            borderColor: alpha(theme.palette.primary.main, 0.5),
                                            boxShadow: `0 6px 18px ${alpha(theme.palette.common.black, 0.06)}`,
                                        } : {},
                                    }}
                                >
                                    <CardActionArea
                                        aria-label={`Add ${product.name} to order`}
                                        disabled={product.stock <= 0}
                                        onClick={() => handleAddToCart(product)}
                                        sx={{ p: { xs: 1.25, sm: 1.75 }, pb: 0, flexGrow: 1, display: 'block', '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
                                    >
                                        <Box sx={{ height: { xs: 140, sm: 160 }, p: 1.5, mb: 1.5, borderRadius: 1.5, bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.035) : '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                            <Box component="img"
                                                src={resolveProductImage(product) === placeholderFallback ? productCardFallback : resolveProductImage(product)}
                                                alt={product.name} loading="lazy" decoding="async"
                                                onError={(event) => { if (event.currentTarget.src !== productCardFallback) event.currentTarget.src = productCardFallback; }}
                                                sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', opacity: product.stock <= 0 ? 0.55 : 1 }}
                                            />
                                        </Box>
                                        <Typography title={product.name} fontWeight={700} sx={{ color: 'text.primary', fontSize: { xs: '0.85rem', sm: '0.9rem' }, lineHeight: 1.4, minHeight: '2.8em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {product.name}
                                        </Typography>
                                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontSize: '0.7rem', color: product.stock <= 0 ? 'error.main' : product.stock <= 5 ? 'warning.main' : 'text.secondary' }}>
                                            {product.stock <= 0 ? 'Out of stock' : product.stock <= 5 ? `Only ${product.stock} left` : `${product.stock} in stock`}
                                        </Typography>
                                    </CardActionArea>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75, m: { xs: 1.25, sm: 1.75 }, mt: 1.25, pt: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
                                        <Typography fontWeight={800} sx={{ color: 'text.primary', fontSize: { xs: '0.92rem', sm: '1rem' }, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere', lineHeight: 1.25 }}>
                                            {formatCurrency(product.price)}
                                        </Typography>
                                        <IconButton aria-label={`Add ${product.name}`} disabled={product.stock <= 0} onClick={() => handleAddToCart(product)}
                                            sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' } }}>
                                            <Plus size={21} strokeWidth={2.25} />
                                        </IconButton>
                                    </Box>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                    )}
                </Box>
            </Box>

            {/* Right Side: Cart / Order Summary */}
            <Paper
                inert={savingDraft}
                elevation={0}
                sx={{
                    width: { xs: '100%', lg: 440 },
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 3,
                    overflow: 'hidden',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    boxShadow: (theme) => theme.palette.mode === 'dark' ? 'none' : `0 18px 44px -34px ${alpha(theme.palette.primary.dark, 0.55)}`,
                    minHeight: { xs: 360, sm: 420, lg: 0 },
                    height: { lg: '100%' },
                    maxHeight: { xs: 'calc(100dvh - 12px)', lg: '100%' }
                }}
            >
                <Box sx={{ p: { xs: 1.5, sm: 2 }, color: 'text.primary', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider', position: 'relative', overflow: 'hidden', '&::after': { content: '""', position: 'absolute', width: 150, height: 150, borderRadius: '50%', right: -78, top: -105, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1), pointerEvents: 'none' } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.15 }}>
                        <Box sx={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 2, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}><ShoppingCart size={19} /></Box>
                        <Box>
                            <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '0.08em', fontSize: '0.62rem' }}>CHECKOUT</Typography>
                            <Typography variant="subtitle1" fontWeight={850} lineHeight={1.15}>{activeDraftTable ? `Order from ${activeDraftTable}` : 'Current Order'}</Typography>
                            {activeDraftCode && <Typography variant="caption" color="text.secondary">Editing {activeDraftCode}</Typography>}
                        </Box>
                    </Box>
                    <Chip size="small" label={`${cart.length} item${cart.length === 1 ? '' : 's'}`} sx={{ height: 26, fontWeight: 800, position: 'relative', zIndex: 1, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1), color: 'primary.dark', '& .MuiChip-label': { px: 1 } }} />
                </Box>

                <Box
                    sx={{
                        p: 0,
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        scrollbarWidth: 'thin',
                        scrollbarColor: (theme) => `${theme.palette.primary.main} transparent`,
                        '&::-webkit-scrollbar': { width: 8 },
                        '&::-webkit-scrollbar-thumb': {
                            bgcolor: 'primary.main',
                            borderRadius: 99,
                            border: '2px solid',
                            borderColor: 'background.paper'
                        },
                        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                        overscrollBehavior: 'contain'
                    }}
                >
                    <Box sx={{ p: 1.25 }}><SalespersonSelect value={salespersonEmployeeId} onChange={setSalespersonEmployeeId} /></Box>
                    <Box sx={{ minHeight: cart.length === 0 ? 210 : 'auto', display: 'flex', flexDirection: 'column', justifyContent: cart.length === 0 ? 'center' : 'flex-start' }}>
                        {cart.length === 0 ? (
                            <Box sx={{
                                textAlign: 'center',
                                width: '100%',
                                px: 3,
                                py: 2,
                                color: 'text.secondary'
                            }}>
                                <Box sx={{ width: 58, height: 58, borderRadius: '50%', display: 'grid', placeItems: 'center', mx: 'auto', mb: 1.25, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08), color: 'primary.main' }}>
                                    <ShoppingCart size={27} strokeWidth={1.5} />
                                </Box>
                                <Typography variant="subtitle2" fontWeight={850} color="text.primary">Your cart is empty</Typography>
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.4 }}>Choose a product to start this order</Typography>
                            </Box>
                        ) : (
                            <Box sx={{ p: 1.25, pb: 0.5 }}>
                                <AnimatePresence>
                                    {cart.map((item) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                        >
                                            <Box sx={{ mb: 0.9, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, gap: { xs: 0.75, sm: 1 }, flexWrap: 'wrap' }}>
                                                <Box sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 160 } }}>
                                                    <Typography variant="body2" fontWeight={700} noWrap={false} sx={{ wordBreak: 'break-word' }}>{cartDescription(item)}</Typography>
                                                    {canOverridePrice ? <>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        Cost {formatCurrency(item.purchasePrice)} · Default {formatCurrency(item.salePrice)}
                                                    </Typography>
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        label="Sell Price"
                                                        value={item.price}
                                                        onChange={(e) => dispatch(updateCartItemPrice({ id: item.id, price: Number(e.target.value || 0) }))}
                                                        disabled={!canOverridePrice}
                                                        sx={{ mt: 0.6, maxWidth: 135 }}
                                                        InputProps={{
                                                            startAdornment: (
                                                                <InputAdornment position="start">{currencySymbol}</InputAdornment>
                                                            ),
                                                        }}
                                                    />
                                                    </> : <Typography variant="caption" color="text.secondary" display="block">
                                                        {formatCurrency(item.price)} each
                                                    </Typography>}
                                                </Box>
                                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ bgcolor: 'action.hover', borderRadius: 1.5, p: 0.35 }}>
                                                    <IconButton size="small" onClick={() => dispatch(updateQuantity({ id: item.id, quantity: item.quantity - 1 }))}>
                                                        <Minus size={14} />
                                                    </IconButton>
                                                    <TextField size="small" type="number" aria-label={`Quantity for ${item.name}`} key={`${item.id}:${item.quantity}`} defaultValue={item.quantity} sx={{ width: 85 }} slotProps={{ htmlInput: { min: 0, step: item.unitSizeEnabled && item.sellingType === 'quantity' ? 'any' : 1 } }} onBlur={e => {
                                                        const quantity = Number(e.target.value);
                                                        const product = products.find(p => p.id === (item.productId || item.id));
                                                        const stock = item.sizeId ? product?.sizes?.find(row => row.id === item.sizeId)?.stock : product?.stock;
                                                        if (Number.isFinite(quantity) && quantity >= 0 && quantity <= (stock ?? 0) && (item.unitSizeEnabled && item.sellingType === 'quantity' || Number.isInteger(quantity))) dispatch(updateQuantity({ id: item.id, quantity }));
                                                        else { e.target.value = String(item.quantity); setStockToast({ open: true, message: 'Enter a valid quantity within available stock.' }); }
                                                    }} />
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => {
                                                            const product = products.find(p => p.id === (item.productId || item.id));
                                                            const stock = item.sizeId ? product?.sizes?.find(row => row.id === item.sizeId)?.stock : product?.stock;
                                                            if (item.quantity + 1 <= (stock ?? 0)) {
                                                                dispatch(updateQuantity({ id: item.id, quantity: item.quantity + 1 }));
                                                            }
                                                        }}
                                                    >
                                                        <Plus size={14} />
                                                    </IconButton>
                                                </Stack>
                                                <Typography variant="body2" fontWeight={800} sx={{ minWidth: { xs: '100%', sm: 70 }, textAlign: { xs: 'left', sm: 'right' } }}>
                                                    {formatCurrency(item.price * item.quantity)}
                                                </Typography>
                                            </Box>
                                            <Divider sx={{ mb: 0.9, borderStyle: 'dashed' }} />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </Box>
                        )}
                    </Box>

                <Box
                    sx={{
                        p: { xs: 1.25, sm: 1.5 },
                        bgcolor: 'background.paper',
                        position: 'relative',
                        zIndex: 2,
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        flexGrow: 1,
                        // Keep totals, order details, and shift status beside
                        // the bottom payment dock when the cart is short.
                        justifyContent: 'flex-end'
                    }}
                >
                    <Stack spacing={0.35} sx={{ mb: 0.75, px: 0.3, py: 0.2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">Subtotal</Typography>
                            <Typography variant="body2" fontWeight={700}>{formatCurrency(subtotal)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">{taxLabel}</Typography>
                            <Typography variant="body2" fontWeight={700}>{formatCurrency(tax)}</Typography>
                        </Box>
                        {discountsEnabled && discountOptions.length > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                <Typography variant="body2" color="text.secondary">Discount</Typography>
                                <TextField
                                    select
                                    size="small"
                                    value={appliedDiscountPercent}
                                    onChange={(event) => dispatch(setCartDiscountPercent(Number(event.target.value)))}
                                    sx={{ width: 130, '& .MuiOutlinedInput-root': { height: 34, fontSize: '0.82rem' } }}
                                >
                                    <MenuItem value={0}>No discount</MenuItem>
                                    {discountOptions.map((option) => <MenuItem key={option} value={option}>{option}%</MenuItem>)}
                                </TextField>
                            </Box>
                        )}
                        {activeDiscount > 0 && (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="error.main">Discount ({appliedDiscountPercent}%)</Typography>
                                <Typography variant="body2" fontWeight={700} color="error.main">-{formatCurrency(activeDiscount)}</Typography>
                            </Box>
                        )}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.25, px: 1, py: 0.55, borderRadius: 1.25, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.09), borderLeft: '3px solid', borderColor: 'primary.main' }}>
                            <Typography variant="body2" fontWeight={850}>Total payable</Typography>
                            <Typography variant="subtitle1" fontWeight={900} color="primary.dark">{formatCurrency(total)}</Typography>
                        </Box>
                    </Stack>

                    <Box sx={{ display: 'grid', gridTemplateColumns: isRestaurant ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', gap: 0.75, mb: isRestaurant ? 0.8 : 0 }}>
                        {isRestaurant && <TextField
                            select
                            fullWidth
                            size="small"
                            label="Order type"
                            value={orderType}
                            onChange={(event) => handleOrderTypeChange(event.target.value as OrderType)}
                        >
                            {orderTypeOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                        </TextField>}
                        {isRestaurant && orderType === 'other' && (
                            <TextField
                                fullWidth
                                size="small"
                                autoFocus
                                label="Other order type"
                                placeholder="Write order type"
                                value={otherOrderType}
                                onChange={(event) => {
                                    setOtherOrderType(event.target.value);
                                    setPendingMethod(null);
                                }}
                                required
                                sx={{ gridColumn: '1 / -1' }}
                            />
                        )}
                        {isRestaurant && <TextField
                            fullWidth
                            size="small"
                            label="Delivery no."
                            placeholder="e.g. 0312 1234567"
                            value={deliveryNumber}
                            onChange={(event) => setDeliveryNumber(event.target.value)}
                            inputProps={{ maxLength: 40 }}
                        />}
                    </Box>

                    {!shiftLoading && !openShift && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.8, px: 1, py: 0.65, borderRadius: 1.25, bgcolor: (theme) => alpha(theme.palette.warning.main, 0.09) }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="caption" fontWeight={850} color="warning.dark" sx={{ display: 'block', lineHeight: 1.2 }}>Shift closed</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>Open a shift to take payment</Typography>
                            </Box>
                            <Button size="small" onClick={() => navigate('/pos-reports')} sx={{ flexShrink: 0, minWidth: 0, px: 1, py: 0.35, borderRadius: 1, bgcolor: 'background.paper', fontSize: '0.7rem', fontWeight: 850 }}>Open shift</Button>
                        </Box>
                    )}
                    {openShift && (
                        <Chip
                            size="small"
                            color="success"
                            variant="outlined"
                            label={`${openShift.shiftCode} · ${openShift.registerName}`}
                            sx={{ alignSelf: 'flex-start', mb: 0.8, fontWeight: 800, height: 22 }}
                        />
                    )}

                    <Box sx={{
                        position: 'sticky',
                        bottom: -1,
                        zIndex: 5,
                        mx: { xs: -1, sm: -1.1 },
                        mb: { xs: -1, sm: -1.1 },
                        mt: 0,
                        px: { xs: 1, sm: 1.1 },
                        pt: 0.85,
                        pb: { xs: 1, sm: 1.1 },
                        borderTop: '1px solid',
                        borderColor: (theme) => alpha(theme.palette.primary.main, 0.18),
                        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.96),
                        backdropFilter: 'blur(16px)',
                        boxShadow: (theme) => `0 -12px 30px -24px ${alpha(theme.palette.primary.dark, 0.5)}`
                    }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.55 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={850} sx={{ letterSpacing: '0.06em', fontSize: '0.6rem' }}>PAYMENT METHOD</Typography>
                        <Button size="small" disabled={cart.length === 0} onClick={() => dispatch(clearCart())} sx={{ minWidth: 0, py: 0.1, px: 0.5, fontSize: '0.7rem', fontWeight: 800, color: 'text.secondary' }}>Clear order</Button>
                    </Box>
                    <Grid container spacing={0.65}>
                        <Grid size={{ xs: canAccessInstallments ? 6 : 4 }}>
                            <Button
                                fullWidth
                                variant={pendingMethod === 'cash' ? 'contained' : 'outlined'}
                                startIcon={<Banknote size={20} />}
                                disabled={!canChoosePayment}
                                onClick={() => handleCheckout('cash')}
                                sx={{ minHeight: 42, borderRadius: 1.5, fontWeight: 800, fontSize: '0.78rem', whiteSpace: 'nowrap', transition: 'all .18s ease', ...(pendingMethod === 'cash' && { boxShadow: (theme) => `0 10px 16px -10px ${alpha(theme.palette.primary.dark, 0.9)}` }) }}
                            >
                                Cash
                            </Button>
                        </Grid>
                        <Grid size={{ xs: canAccessInstallments ? 6 : 4 }}>
                            <Button
                                fullWidth
                                variant={pendingMethod === 'card' ? 'contained' : 'outlined'}
                                startIcon={<CreditCard size={20} />}
                                disabled={!canChoosePayment}
                                onClick={() => handleCheckout('card')}
                                sx={{ minHeight: 42, borderRadius: 1.5, fontWeight: 800, fontSize: '0.78rem', whiteSpace: 'nowrap', transition: 'all .18s ease', ...(pendingMethod === 'card' && { boxShadow: (theme) => `0 10px 16px -10px ${alpha(theme.palette.primary.dark, 0.9)}` }) }}
                            >
                                {isFoodpandaOrder ? 'Foodpanda' : 'Card'}
                            </Button>
                        </Grid>
                        <Grid size={{ xs: canAccessInstallments ? 6 : 4 }}>
                            <Button
                                fullWidth
                                variant={pendingMethod === 'credit' ? 'contained' : 'outlined'}
                                startIcon={<Receipt size={20} />}
                                disabled={!canChoosePayment}
                                onClick={handleOpenCredit}
                                sx={{ minHeight: 42, borderRadius: 1.5, fontWeight: 800, fontSize: '0.78rem', whiteSpace: 'nowrap', transition: 'all .18s ease', ...(pendingMethod === 'credit' && { boxShadow: (theme) => `0 10px 16px -10px ${alpha(theme.palette.primary.dark, 0.9)}` }) }}
                            >
                                Credit
                            </Button>
                        </Grid>
                        {canAccessInstallments && <Grid size={{ xs: 6 }}>
                            <Button
                                fullWidth
                                variant={pendingMethod === 'installment' ? 'contained' : 'outlined'}
                                startIcon={<Receipt size={20} />}
                                disabled={!canChoosePayment}
                                onClick={handleOpenInstallment}
                                sx={{ minHeight: 42, borderRadius: 1.5, fontWeight: 800, fontSize: '0.78rem', whiteSpace: 'nowrap', transition: 'all .18s ease', ...(pendingMethod === 'installment' && { boxShadow: (theme) => `0 10px 16px -10px ${alpha(theme.palette.primary.dark, 0.9)}` }) }}
                            >
                                EMI
                            </Button>
                        </Grid>}
                        <Grid size={{ xs: 6 }}>
                            <Button
                                fullWidth
                                variant="outlined"
                                size="large"
                                startIcon={savingDraft ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
                                disabled={cart.length === 0 || savingDraft || confirmingPayment}
                                onClick={handleSaveDraft}
                                sx={{
                                    minHeight: 48,
                                    mt: 0.15,
                                    borderRadius: 1.75,
                                    fontWeight: 900,
                                    fontSize: '0.78rem',
                                    whiteSpace: 'nowrap',
                                    '& .MuiButton-startIcon': { mr: 0.65, ml: 0 },
                                    borderColor: 'divider',
                                    color: 'text.primary',
                                    '&:hover': { borderColor: 'text.primary', bgcolor: 'action.hover' }
                                }}
                            >
                                {savingDraft ? 'Saving...' : activeDraftId ? 'Update Draft' : 'Save Draft'}
                            </Button>
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <Button
                                fullWidth
                                variant="contained"
                                size="large"
                                startIcon={<Receipt size={18} />}
                                disabled={!canChoosePayment || !pendingMethod}
                                onClick={handlePayNow}
                                sx={{
                                    minHeight: 48,
                                    mt: 0.15,
                                    borderRadius: 1.75,
                                    fontWeight: 850,
                                    fontSize: '0.82rem',
                                    whiteSpace: 'nowrap',
                                    bgcolor: 'primary.main',
                                    color: 'primary.contrastText',
                                    boxShadow: (theme) => `0 5px 12px -8px ${alpha(theme.palette.primary.dark, 0.72)}`,
                                    transition: 'background-color .18s ease, box-shadow .18s ease',
                                    '&:hover': { bgcolor: 'primary.dark', boxShadow: (theme) => `0 7px 16px -8px ${alpha(theme.palette.primary.dark, 0.78)}` },
                                    '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'text.disabled', boxShadow: 'none' }
                                }}
                            >
                                {pendingMethod ? (isFoodpandaOrder && pendingMethod === 'card' ? 'Continue Foodpanda' : `Pay with ${pendingMethod === 'installment' ? 'EMI' : pendingMethod}`) : 'Pay Now'}
                            </Button>
                        </Grid>
                    </Grid>
                    </Box>
                </Box>
                </Box>
            </Paper>

            <Dialog
                open={foodpandaOpen}
                onClose={() => setFoodpandaOpen(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>Foodpanda Order Details</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Record the Foodpanda order number and rider details before continuing.
                    </Typography>
                    <TextField
                        fullWidth
                        autoFocus
                        required
                        label="Foodpanda Order No."
                        placeholder="e.g. FP-123456"
                        value={foodpandaOrderNumber}
                        onChange={(event) => setFoodpandaOrderNumber(event.target.value)}
                        inputProps={{ maxLength: 80 }}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        required
                        label="Rider Name"
                        placeholder="Enter rider name"
                        value={foodpandaRiderName}
                        onChange={(event) => setFoodpandaRiderName(event.target.value)}
                        inputProps={{ maxLength: 120 }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setFoodpandaOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleContinueFoodpanda}>Continue</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={creditOpen}
                onClose={() => setCreditOpen(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>Credit Payment</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Record partial payment now and keep the remaining amount due.
                    </Typography>
                    <TextField
                        fullWidth
                        type="number"
                        label="Paid Now"
                        value={creditPaidInput}
                        onChange={(e) => setCreditPaidInput(e.target.value)}
                        InputProps={{ startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment> }}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        label="Customer Name"
                        value={creditCustomerName}
                        onChange={(e) => setCreditCustomerName(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        label={`Customer ${regionalIdLabel}`}
                        value={creditCustomerCnic}
                        onChange={(e) => setCreditCustomerCnic(e.target.value)}
                        placeholder={country === 'PK' ? '35202-1234567-1' : `Enter ${regionalIdLabel}`}
                        sx={{ mb: 2 }}
                    />
                    <Grid container spacing={1} sx={{ mb: 2 }}>
                        <Grid size={{ xs: 6 }}>
                            <Button
                                fullWidth
                                variant={creditPaidVia === 'cash' ? 'contained' : 'outlined'}
                                onClick={() => setCreditPaidVia('cash')}
                            >
                                Paid via Cash
                            </Button>
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <Button
                                fullWidth
                                variant={creditPaidVia === 'card' ? 'contained' : 'outlined'}
                                onClick={() => setCreditPaidVia('card')}
                            >
                                Paid via Card
                            </Button>
                        </Grid>
                    </Grid>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" fontWeight={700}>Order Total: {formatCurrency(total)}</Typography>
                        <Typography variant="body2" fontWeight={700}>Paid Now: {formatCurrency(draftCreditPaid)}</Typography>
                        <Typography variant="body2" fontWeight={900} color="warning.main">Remaining Due: {formatCurrency(draftCreditDue)}</Typography>
                        <Typography variant="body2" fontWeight={700} color={projectedProfit >= 0 ? 'success.main' : 'error.main'}>
                            Profit / Loss: {formatCurrency(projectedProfit)}
                        </Typography>
                    </Box>

                    {showCreditKot && isRestaurant && (
                        <Box
                            id="pos-kot"
                            sx={{
                                display: 'none',
                                '@media print': { display: 'block', p: 2, color: '#000', bgcolor: '#fff' },
                            }}
                        >
                            <Typography align="center" fontWeight={900} sx={{ fontSize: '1.1rem', letterSpacing: 1 }}>KITCHEN TICKET</Typography>
                            <Typography align="center" variant="caption" display="block" sx={{ mb: 1.5 }}>{appSettings.shopName || 'ItemHive POS'}</Typography>
                            <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', mb: 1.25 }} />
                            <Box sx={{ display: 'grid', gap: 0.45, fontSize: '0.75rem', mb: 1.25 }}>
                                <Typography variant="caption">Order: #{receiptId.replace(/^R-/, '').slice(-8).toUpperCase()}</Typography>
                                <Typography variant="caption">Time: {receiptTime ? new Date(receiptTime).toLocaleString() : '-'}</Typography>
                                <Typography variant="caption">Type: {orderTypeLabel}</Typography>
                                {deliveryNumber.trim() && <Typography variant="caption">Delivery: {deliveryNumber.trim()}</Typography>}
                            </Box>
                            <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', mb: 1 }} />
                            <Box sx={{ display: 'grid', gap: 1 }}>
                                {cart.map((item, index) => (
                                    <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                        <Typography variant="body2" fontWeight={700}>{index + 1}. {cartDescription(item)}</Typography>
                                        <Typography variant="body2" fontWeight={900} sx={{ whiteSpace: 'nowrap' }}>x{item.quantity}</Typography>
                                    </Box>
                                ))}
                            </Box>
                            <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', my: 1.5 }} />
                            <Typography align="center" variant="caption" fontWeight={700}>Kitchen copy — no prices</Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setCreditOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleContinueCredit}>Continue</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={installmentOpen}
                onClose={() => setInstallmentOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>Installment Sale</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Capture customer details, witness IDs, set the installment sale price, and create EMI after any advance payment.
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label="Customer Name" value={installmentCustomerName} onChange={(e) => setInstallmentCustomerName(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label={`Customer ${regionalIdLabel}`} value={installmentCustomerCnic} onChange={(e) => setInstallmentCustomerCnic(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label="Customer Phone" value={installmentCustomerPhone} onChange={(e) => setInstallmentCustomerPhone(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField select fullWidth label="Installment Months" value={String(installmentMonths)} onChange={(e) => setInstallmentMonths(Number(e.target.value) as 3 | 6 | 9 | 12)}>
                                <MenuItem value="3">3 Months</MenuItem>
                                <MenuItem value="6">6 Months</MenuItem>
                                <MenuItem value="9">9 Months</MenuItem>
                                <MenuItem value="12">12 Months</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid size={12}>
                            <TextField fullWidth label="Customer Address" value={installmentCustomerAddress} onChange={(e) => setInstallmentCustomerAddress(e.target.value)} multiline rows={2} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label="Witness 1 Name" value={witnessOneName} onChange={(e) => setWitnessOneName(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label={`Witness 1 ${regionalIdLabel}`} value={witnessOneCnic} onChange={(e) => setWitnessOneCnic(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label="Witness 1 Address" value={witnessOneAddress} onChange={(e) => setWitnessOneAddress(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label="Witness 2 Name" value={witnessTwoName} onChange={(e) => setWitnessTwoName(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label={`Witness 2 ${regionalIdLabel}`} value={witnessTwoCnic} onChange={(e) => setWitnessTwoCnic(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField fullWidth label="Witness 2 Address" value={witnessTwoAddress} onChange={(e) => setWitnessTwoAddress(e.target.value)} />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                type="number"
                                label={`Installment Price (${currencySymbol})`}
                                value={installmentUnitPriceInput}
                                onChange={(e) => setInstallmentUnitPriceInput(e.target.value)}
                                disabled={!canOverridePrice}
                                inputProps={{ min: 0, step: '0.01' }}
                                helperText={canOverridePrice ? `Price per unit x ${installmentQuantity}` : 'Only admin and super admin can change installment price'}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                type="number"
                                label={`Advance Payment (${currencySymbol})`}
                                value={installmentAdvanceInput}
                                onChange={(e) => setInstallmentAdvanceInput(e.target.value)}
                                inputProps={{ min: 0, step: '0.01' }}
                                helperText="Advance is deducted before EMI is created."
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField select fullWidth label="Advance Paid Via" value={installmentAdvancePaidVia} onChange={(e) => setInstallmentAdvancePaidVia(e.target.value as 'cash' | 'card')}>
                                <MenuItem value="cash">Cash</MenuItem>
                                <MenuItem value="card">Card</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Sale Date"
                                InputLabelProps={{ shrink: true }}
                                value={installmentSaleDate}
                                onChange={(e) => setInstallmentSaleDate(e.target.value)}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="body2" fontWeight={700}>Installment Sale Total: {formatCurrency(draftInstallmentTotal)}</Typography>
                                <Typography variant="body2" fontWeight={700}>Advance Payment: {formatCurrency(draftInstallmentAdvance)}</Typography>
                                <Typography variant="body2" fontWeight={700}>EMI Balance: {formatCurrency(draftInstallmentRemaining)}</Typography>
                                <Typography variant="body2" fontWeight={700}>Monthly Installment: {formatCurrency(draftMonthlyInstallment)}</Typography>
                                <Typography variant="body2" color="text.secondary">First due date will be one month after sale date.</Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setInstallmentOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleContinueInstallment}>Continue</Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={confirmOpen}
                onClose={confirmingPayment ? undefined : handleCancelCheckout}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>{isFoodpandaOrder ? 'Confirm Foodpanda Order' : 'Confirm Payment'}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {isFoodpandaOrder ? 'Confirm this Foodpanda order to finalize sale and update stock.' : 'Confirm this payment to finalize sale and update stock.'}
                    </Typography>
                    <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="body2" sx={{ opacity: 0.9 }}>
                            Cashier: <strong>{user?.name || 'Staff'}</strong>
                        </Typography>
                        <Typography variant="body2" fontWeight={700}>
                            Method: {isFoodpandaOrder && pendingMethod === 'card' ? 'FOODPANDA' : (pendingMethod || '').toUpperCase()}
                        </Typography>
                        {pendingMethod === 'credit' && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="body2">Customer: <strong>{creditCustomerName}</strong></Typography>
                                <Typography variant="body2">{regionalIdLabel}: <strong>{creditCustomerCnic}</strong></Typography>
                                <Typography variant="body2" fontWeight={700}>Paid via {creditPaidVia.toUpperCase()}: {formatCurrency(creditPaidNow)}</Typography>
                                <Typography variant="body2" fontWeight={900} color="warning.main">Due Later: {formatCurrency(creditDue)}</Typography>
                            </Box>
                        )}
                        {pendingMethod === 'installment' && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="body2">Customer: <strong>{installmentCustomerName}</strong></Typography>
                                <Typography variant="body2">{regionalIdLabel}: <strong>{installmentCustomerCnic}</strong></Typography>
                                <Typography variant="body2">Phone: <strong>{installmentCustomerPhone}</strong></Typography>
                                <Typography variant="body2" fontWeight={700}>Plan: <strong>{installmentMonths} months</strong></Typography>
                                <Typography variant="body2" fontWeight={700}>Sale Total: <strong>{formatCurrency(draftInstallmentTotal)}</strong></Typography>
                                <Typography variant="body2" fontWeight={700}>Advance Paid: <strong>{formatCurrency(draftInstallmentAdvance)}</strong></Typography>
                                <Typography variant="body2" fontWeight={900} color="warning.main">
                                    Monthly Installment: {formatCurrency(draftMonthlyInstallment)}
                                </Typography>
                            </Box>
                        )}
                        <Typography variant="h6" fontWeight={900} color="primary.main" sx={{ mt: 0.5 }}>
                            Total: {formatCurrency(pendingMethod === 'installment' ? draftInstallmentTotal : total)}
                        </Typography>
                        <Typography variant="body2" fontWeight={800} color={(pendingMethod === 'installment' ? draftInstallmentProfit : projectedProfit) >= 0 ? 'success.main' : 'error.main'}>
                            Profit / Loss: {formatCurrency(pendingMethod === 'installment' ? draftInstallmentProfit : projectedProfit)}
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={handleCancelCheckout} disabled={confirmingPayment}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirmCheckout}
                        disabled={confirmingPayment}
                        startIcon={confirmingPayment ? <CircularProgress size={18} color="inherit" /> : undefined}
                    >
                        {confirmingPayment ? 'Processing...' : isFoodpandaOrder ? 'Confirm Foodpanda Order' : 'Confirm Payment'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!sellingProduct} onClose={() => setSellingProduct(null)} maxWidth="sm" fullWidth>
                <DialogTitle>{sellingProduct && isFixedProduct(sellingProduct) ? `Select size — ${sellingProduct.name}` : `Enter quantity — ${sellingProduct?.name || ''}`}</DialogTitle>
                <Box component="form" onSubmit={e => { e.preventDefault(); addSellingProduct(); }}>
                <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
                    {sellingError && <Alert severity="error">{sellingError}</Alert>}
                    {sellingProduct && isFixedProduct(sellingProduct) && <>
                        <Typography variant="body2">Choose a bottle/pack size:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {(sellingProduct.sizes || []).map(size => <Button key={size.id} type="button" variant={sellingSizeId === size.id ? 'contained' : 'outlined'} disabled={size.stock <= 0} aria-pressed={sellingSizeId === size.id} onClick={() => { setSellingSizeId(size.id); setSellingError(''); }} sx={{ flex: '1 1 140px', py: 1.5 }}>
                                <Stack spacing={0.5}>
                                    <Typography fontWeight={800}>{size.size} {typeof size.size === 'number' ? sellingProduct.productUnit : ''}</Typography>
                                    <Typography variant="body2">{formatCurrency(size.salePrice)}</Typography>
                                    <Typography variant="caption">{size.stock} bottles/packs available</Typography>
                                </Stack>
                            </Button>)}
                        </Box>
                    </>}
                    <TextField autoFocus required label={sellingProduct?.sellingType === 'quantity' ? `Quantity (${sellingProduct.productUnit})` : 'Bottles/packs quantity'} value={sellingQuantity} onChange={e => setSellingQuantity(e.target.value)} slotProps={{ htmlInput: { inputMode: sellingProduct?.sellingType === 'quantity' ? 'decimal' : 'numeric' } }} />
                    {sellingProduct?.sellingType === 'quantity' && <Typography variant="body2">{formatCurrency(sellingProduct.salePrice)} per {sellingProduct.productUnit} - Stock: {sellingProduct.stock} {sellingProduct.productUnit}</Typography>}
                </Stack></DialogContent>
                <DialogActions><Button onClick={() => setSellingProduct(null)}>Cancel</Button><Button type="submit" variant="contained">Add to cart</Button></DialogActions>
                </Box>
            </Dialog>
            {/* Checkout Success & Receipt Dialog */}
            <Dialog
                open={orderDone}
                onClose={paymentCommitPending || printingReceipt || printingKot ? undefined : handleCloseOrder}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: { borderRadius: 2, p: 1 }
                }}
            >
                <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
                    <Box sx={{ color: 'success.main', mb: 2 }}>
                        <CheckCircle size={64} strokeWidth={2.5} />
                    </Box>
                    <Typography variant="h5" fontWeight={900}>{paymentCommitPending ? 'Saving payment...' : 'Payment Successful!'}</Typography>
                    <Typography variant="body2" color="text.secondary">Order #{receiptId}</Typography>
                    {paymentCommitPending && (
                        <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                            <CircularProgress size={16} />
                            <Typography variant="body2" color="text.secondary">Receipt is ready. Saving securely in the background.</Typography>
                        </Stack>
                    )}
                </DialogTitle>
                <DialogContent>
                    <Box
                        id="pos-receipt"
                        sx={{
                            mt: 3,
                            p: { xs: 2, sm: 3 },
                            borderRadius: 2,
                            overflowX: 'auto',
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: alpha(theme.palette.primary.main, 0.18),
                            boxShadow: theme.palette.mode === 'dark'
                                ? `0 24px 44px -28px ${alpha('#000', 0.95)}`
                                : `0 24px 46px -30px ${alpha(theme.palette.primary.dark, 0.32)}`,
                        }}
                    >
                        <Stack
                            spacing={2.5}
                            sx={{
                                // Horizontal-scroll affordance on phones; a 72mm slip must not inherit it.
                                minWidth: { xs: 620, sm: 0 },
                                '@media print': { minWidth: 0 },
                            }}
                        >
                            <InvoiceLetterhead
                                title="Invoice"
                                showShopDetails={false}
                            />

                            <Divider />

                            <Box className="receipt-meta">
                                <Box className="receipt-meta-row"><Typography component="span">Order ID:</Typography><Typography component="span" fontWeight={900}>#{receiptId.replace(/^R-/, '').slice(-8).toUpperCase()}</Typography></Box>
                                <Box className="receipt-meta-row"><Typography component="span">Date/Time:</Typography><Typography component="span" fontWeight={900}>{receiptTime ? new Date(receiptTime).toLocaleString() : '-'}</Typography></Box>
                                <Box className="receipt-meta-row"><Typography component="span">Cashier:</Typography><Typography component="span" fontWeight={900}>{user?.name || 'Staff'}</Typography></Box>
                                <Box className="receipt-meta-row"><Typography component="span">Method:</Typography><Typography component="span" fontWeight={900} sx={{ textTransform: 'capitalize' }}>{isFoodpandaOrder ? 'Foodpanda' : (paymentMethod || '-')}</Typography></Box>
                                {isRestaurant && <Box className="receipt-meta-row"><Typography component="span">Order Type:</Typography><Typography component="span" fontWeight={900}>{orderTypeLabel}</Typography></Box>}
                                {isFoodpandaOrder && <Box className="receipt-meta-row"><Typography component="span">Foodpanda Order No:</Typography><Typography component="span" fontWeight={900}>{foodpandaOrderNumber.trim()}</Typography></Box>}
                                {isFoodpandaOrder && <Box className="receipt-meta-row"><Typography component="span">Rider Name:</Typography><Typography component="span" fontWeight={900}>{foodpandaRiderName.trim()}</Typography></Box>}
                                {isRestaurant && deliveryNumber.trim() && <Box className="receipt-meta-row"><Typography component="span">Delivery No:</Typography><Typography component="span" fontWeight={900}>{deliveryNumber.trim()}</Typography></Box>}
                            </Box>

                            <InvoiceItemsTable
                                items={cart.map((item) => {
                                    const unitPrice = paymentMethod === 'installment' ? draftInstallmentUnitPrice : item.price;
                                    return {
                                        description: cartDescription(item),
                                        quantity: item.quantity,
                                        unitPrice: formatCurrency(unitPrice),
                                        total: formatCurrency(unitPrice * item.quantity),
                                    };
                                })}
                                totals={[
                                    ...(paymentMethod !== 'installment'
                                        ? activeDiscount > 0
                                            ? [
                                                { label: 'Subtotal', value: formatCurrency(subtotal) },
                                                ...(tax > 0 ? [{ label: taxLabel, value: formatCurrency(tax) }] : []),
                                                { label: `Discount (${appliedDiscountPercent}%)`, value: `-${formatCurrency(activeDiscount)}` },
                                            ]
                                            : [
                                                { label: 'Subtotal', value: formatCurrency(subtotal) },
                                                ...(tax > 0 ? [{ label: taxLabel, value: formatCurrency(tax) }] : []),
                                            ]
                                        : []),
                                    ...(paymentMethod === 'credit'
                                        ? [
                                            { label: `Paid Now (${creditPaidVia.toUpperCase()})`, value: formatCurrency(creditPaidNow) },
                                            { label: 'Amount To Receive', value: formatCurrency(creditDue), strong: true },
                                        ]
                                        : []),
                                    ...(paymentMethod === 'installment'
                                        ? [
                                            { label: 'Advance Payment', value: formatCurrency(draftInstallmentAdvance) },
                                            { label: 'EMI Balance', value: formatCurrency(draftInstallmentRemaining) },
                                            { label: 'Monthly EMI', value: formatCurrency(draftMonthlyInstallment) },
                                        ]
                                        : []),
                                    {
                                        label: paymentMethod === 'installment' ? 'Installment Total' : paymentMethod === 'credit' ? 'Order Total' : 'Total Paid',
                                        value: formatCurrency(paymentMethod === 'installment' ? draftInstallmentTotal : total),
                                        strong: true,
                                    },
                                ]}
                                amountInWords={undefined}
                            />
                            <Box className="receipt-powered-by" sx={{ pt: 1, textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    Thank you for your purchase
                                </Typography>
                                <Typography variant="caption" fontWeight={800}>
                                    Powered by ItemHive
                                </Typography>
                            </Box>
                        </Stack>

                        <Box className="legacy-payment-slip" sx={{ display: 'none' }}>
                        {appSettings.receiptBannerUrl && (
                            <Box
                                sx={{
                                    px: 3,
                                    py: 2,
                                    bgcolor: 'common.white',
                                    borderBottom: '1px solid',
                                    borderColor: alpha(theme.palette.primary.main, 0.12),
                                    WebkitPrintColorAdjust: 'exact',
                                    printColorAdjust: 'exact',
                                }}
                            >
                                <DocumentBanner showShopDetails={false} maxHeight={72} />
                            </Box>
                        )}

                        <Box
                            sx={{
                                px: 3,
                                py: 2.5,
                                color: 'common.white',
                                background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 55%, ${theme.palette.secondary.main} 100%)`,
                            }}
                        >
                            <Typography variant="overline" sx={{ opacity: 0.82, letterSpacing: 1.8 }}>
                                Payment Slip
                            </Typography>
                            <Typography variant="h5" fontWeight={900} sx={{ lineHeight: 1.1 }}>
                                {appSettings.shopName || 'ItemHive POS'}
                            </Typography>
                            {appSettings.shopPhone && <Typography variant="body2" sx={{ mt: 0.75, opacity: 0.9, whiteSpace: 'pre-line' }}>{appSettings.shopPhone}</Typography>}
                            {appSettings.shopAddress && <Typography variant="caption" sx={{ display: 'block', opacity: 0.82, whiteSpace: 'pre-line' }}>{appSettings.shopAddress}</Typography>}
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                                <Chip size="small" label={`Order #${receiptId}`} sx={{ bgcolor: alpha('#fff', 0.16), color: 'common.white' }} />
                                <Chip size="small" label={`Method: ${paymentMethod?.toUpperCase()}`} sx={{ bgcolor: alpha('#fff', 0.16), color: 'common.white' }} />
                            </Stack>
                        </Box>

                        <Box sx={{ p: 3 }}>
                            <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                                        <Typography variant="caption" color="text.secondary">Cashier</Typography>
                                        <Typography variant="body2" fontWeight={800}>{user?.name || 'Staff'}</Typography>
                                    </Box>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6 }}>
                                    <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                                        <Typography variant="caption" color="text.secondary">Issued At</Typography>
                                        <Typography variant="body2" fontWeight={800}>{receiptTime ? new Date(receiptTime).toLocaleString() : '-'}</Typography>
                                    </Box>
                                </Grid>
                                {(paymentMethod === 'credit' || paymentMethod === 'installment') && (
                                    <>
                                        <Grid size={{ xs: 12, sm: 6 }}>
                                            <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha(theme.palette.info.main, 0.06) }}>
                                                <Typography variant="caption" color="text.secondary">Customer</Typography>
                                                <Typography variant="body2" fontWeight={800}>
                                                    {paymentMethod === 'credit' ? creditCustomerName : installmentCustomerName}
                                                </Typography>
                                            </Box>
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 6 }}>
                                            <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: alpha(theme.palette.info.main, 0.06) }}>
                                                <Typography variant="caption" color="text.secondary">Customer {regionalIdLabel}</Typography>
                                                <Typography variant="body2" fontWeight={800}>
                                                    {paymentMethod === 'credit' ? creditCustomerCnic : installmentCustomerCnic}
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    </>
                                )}
                            </Grid>

                            <Box sx={{ borderRadius: 3, border: '1px dashed', borderColor: 'divider', overflow: 'hidden' }}>
                                <Box sx={{ px: 2, py: 1.25, bgcolor: alpha(theme.palette.text.primary, 0.04), display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" fontWeight={800}>Item</Typography>
                                    <Typography variant="caption" fontWeight={800}>Amount</Typography>
                                </Box>
                                <Stack spacing={0} divider={<Divider flexItem sx={{ borderStyle: 'dashed' }} />}>
                                    {cart.map((item, index) => (
                                        <Box key={item.id} sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                            <Box>
                                                <Typography variant="body2" fontWeight={800}>{index + 1}. {cartDescription(item)}</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {item.quantity} x {formatCurrency(paymentMethod === 'installment' ? draftInstallmentUnitPrice : item.price)}
                                                </Typography>
                                            </Box>
                                            <Typography variant="body2" fontWeight={800}>
                                                {formatCurrency((paymentMethod === 'installment' ? draftInstallmentUnitPrice : item.price) * item.quantity)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>

                            <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                <Grid size={{ xs: 12, md: 7 }}>
                                    <Box
                                        sx={{
                                            mt: 2,
                                            p: 2,
                                            borderRadius: 3,
                                            bgcolor: alpha(theme.palette.warning.main, 0.08),
                                            border: '1px solid',
                                            borderColor: alpha(theme.palette.warning.main, 0.16),
                                        }}
                                    >
                                        <Typography variant="overline" color="warning.main" sx={{ letterSpacing: 1.2 }}>
                                            Payment Notes
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {paymentMethod === 'installment'
                                                ? `Advance received and EMI scheduled over ${installmentMonths} months.`
                                                : paymentMethod === 'credit'
                                                    ? 'Partial payment received. Remaining balance is due later.'
                                                    : 'Full payment received successfully.'}
                                        </Typography>
                                    </Box>
                                </Grid>
                                <Grid size={{ xs: 12, md: 5 }}>
                                    <Box
                                        sx={{
                                            mt: 2,
                                            p: 2,
                                            borderRadius: 3,
                                            bgcolor: alpha(theme.palette.primary.main, 0.05),
                                            border: '1px solid',
                                            borderColor: alpha(theme.palette.primary.main, 0.14),
                                        }}
                                    >
                                        <Stack spacing={1}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="caption">Subtotal</Typography>
                                                <Typography variant="caption" fontWeight={700}>{formatCurrency(subtotal)}</Typography>
                                            </Box>
                                            {paymentMethod !== 'installment' && (
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <Typography variant="caption">{taxLabel}</Typography>
                                                    <Typography variant="caption" fontWeight={700}>{formatCurrency(tax)}</Typography>
                                                </Box>
                                            )}
                                            {activeDiscount > 0 && (
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <Typography variant="caption" color="error.main">Discount ({appliedDiscountPercent}%)</Typography>
                                                    <Typography variant="caption" fontWeight={700} color="error.main">-{formatCurrency(activeDiscount)}</Typography>
                                                </Box>
                                            )}
                                            {paymentMethod === 'credit' && (
                                                <>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="caption">Paid Now ({creditPaidVia.toUpperCase()})</Typography>
                                                        <Typography variant="caption" fontWeight={700}>{formatCurrency(creditPaidNow)}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="caption" color="warning.main">Remaining Due</Typography>
                                                        <Typography variant="caption" fontWeight={800} color="warning.main">{formatCurrency(creditDue)}</Typography>
                                                    </Box>
                                                </>
                                            )}
                                            {paymentMethod === 'installment' && (
                                                <>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="caption">Advance Payment</Typography>
                                                        <Typography variant="caption" fontWeight={700}>{formatCurrency(draftInstallmentAdvance)}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="caption">EMI Balance</Typography>
                                                        <Typography variant="caption" fontWeight={700}>{formatCurrency(draftInstallmentRemaining)}</Typography>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <Typography variant="caption">Monthly Installment</Typography>
                                                        <Typography variant="caption" fontWeight={800} color="warning.main">{formatCurrency(draftMonthlyInstallment)}</Typography>
                                                    </Box>
                                                </>
                                            )}
                                            <Divider sx={{ borderStyle: 'dashed' }} />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography variant="body1" fontWeight={900}>
                                                    {paymentMethod === 'installment' ? 'Installment Total' : paymentMethod === 'credit' ? 'Order Total' : 'Total Paid'}
                                                </Typography>
                                                <Typography variant="h6" fontWeight={900} color="primary.main">
                                                    {formatCurrency(paymentMethod === 'installment' ? draftInstallmentTotal : total)}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    </Box>
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px dashed', borderColor: 'divider', textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 1.1, color: 'text.secondary' }}>
                                    Please keep this payment slip for your record
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.8, fontWeight: 700 }}>
                                    Thank you for shopping with {appSettings.shopName || 'ItemHive'}
                                </Typography>
                            </Box>
                        </Box>
                        </Box>
                    </Box>
                    {isRestaurant && (
                        <Box
                            id="pos-kot"
                            sx={{ display: 'none', '@media print': { display: 'block', p: 2, color: '#000', bgcolor: '#fff' } }}
                        >
                            <Typography align="center" fontWeight={900} sx={{ fontSize: '1.1rem', letterSpacing: 1 }}>KITCHEN TICKET</Typography>
                            <Typography align="center" variant="caption" display="block" sx={{ mb: 1.5 }}>{appSettings.shopName || 'ItemHive POS'}</Typography>
                            <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', mb: 1.25 }} />
                            <Stack spacing={0.45} sx={{ mb: 1.25 }}>
                                <Typography variant="caption">Order: #{receiptId.replace(/^R-/, '').slice(-8).toUpperCase()}</Typography>
                                <Typography variant="caption">Time: {receiptTime ? new Date(receiptTime).toLocaleString() : '-'}</Typography>
                                <Typography variant="caption">Type: {orderTypeLabel}</Typography>
                                {deliveryNumber.trim() && <Typography variant="caption">Delivery: {deliveryNumber.trim()}</Typography>}
                            </Stack>
                            <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', mb: 1 }} />
                            <Stack spacing={1}>
                                {cart.map((item, index) => (
                                    <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                        <Typography variant="body2" fontWeight={700}>{index + 1}. {cartDescription(item)}</Typography>
                                        <Typography variant="body2" fontWeight={900} sx={{ whiteSpace: 'nowrap' }}>x{item.quantity}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                            <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', my: 1.5 }} />
                            <Typography align="center" variant="caption" fontWeight={700}>Kitchen copy - no prices</Typography>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, gap: 1 }}>
                    <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<Download size={18} />}
                        onClick={() => {
                            if (!paymentMethod || !receiptId) return;
                            handleSaveReceiptPdf(receiptId, paymentMethod, receiptTime || new Date().toISOString());
                        }}
                        disabled={paymentCommitPending}
                        sx={{ borderRadius: 2 }}
                    >
                        Save
                    </Button>
                    <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<Share2 size={18} />}
                        disabled={sharingReceipt || paymentCommitPending}
                        onClick={() => {
                            if (!paymentMethod || !receiptId) return;
                            handleShareReceiptPdf(receiptId, paymentMethod, receiptTime || new Date().toISOString());
                        }}
                        sx={{ borderRadius: 2 }}
                    >
                        {sharingReceipt ? '...' : 'Share'}
                    </Button>
                    <Button
                        fullWidth
                        variant="contained"
                        startIcon={printingReceipt ? <CircularProgress size={18} color="inherit" /> : <Printer size={18} />}
                        onClick={handlePrint}
                        disabled={printingReceipt || printingKot || paymentCommitPending}
                        sx={{ borderRadius: 2 }}
                    >
                        {printingReceipt ? 'Preparing...' : 'Receipt'}
                    </Button>
                    {isRestaurant && (
                        <Button
                            fullWidth
                            color="secondary"
                            variant="contained"
                            startIcon={printingKot ? <CircularProgress size={18} color="inherit" /> : <Receipt size={18} />}
                            onClick={handlePrintKot}
                            disabled={printingKot || printingReceipt || paymentCommitPending}
                            sx={{ borderRadius: 2 }}
                        >
                            {printingKot ? 'Preparing...' : 'Print KOT'}
                        </Button>
                    )}
                </DialogActions>
                <IconButton
                    onClick={handleCloseOrder}
                    disabled={paymentCommitPending || printingReceipt || printingKot}
                    sx={{ position: 'absolute', right: 16, top: 16, color: 'text.secondary' }}
                >
                    <X size={20} />
                </IconButton>
            </Dialog>

            {draftKot && (
                <Box
                    id="pos-draft-kot"
                    sx={{ display: 'none', '@media print': { display: 'block', p: 2, color: '#000', bgcolor: '#fff' } }}
                >
                    <Typography align="center" fontWeight={900} sx={{ fontSize: '1.1rem', letterSpacing: 1 }}>KITCHEN TICKET</Typography>
                    <Typography align="center" variant="caption" display="block" sx={{ mb: 1.5 }}>{appSettings.shopName || 'ItemHive POS'}</Typography>
                    <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', mb: 1.25 }} />
                    <Stack spacing={0.45} sx={{ mb: 1.25 }}>
                        <Typography variant="caption">Draft: {draftKot.draftCode}</Typography>
                        <Typography variant="caption">Time: {new Date(draftKot.createdAt).toLocaleString()}</Typography>
                        <Typography variant="caption">Type: {draftKot.orderTypeLabel}</Typography>
                        {draftKot.deliveryNumber && <Typography variant="caption">Delivery: {draftKot.deliveryNumber}</Typography>}
                    </Stack>
                    <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', mb: 1 }} />
                    <Stack spacing={1}>
                        {draftKot.items.map((item, index) => (
                            <Box className="kitchen-ticket-item" key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                <Typography variant="body2" fontWeight={700}>{index + 1}. {item.name}</Typography>
                                <Typography variant="body2" fontWeight={900} sx={{ whiteSpace: 'nowrap' }}>x{item.quantity}</Typography>
                            </Box>
                        ))}
                    </Stack>
                    <Divider sx={{ borderStyle: 'dashed', borderColor: 'currentColor', my: 1.5 }} />
                    <Typography align="center" variant="caption" fontWeight={700}>New items only - no prices</Typography>
                </Box>
            )}

            <Snackbar
                open={stockToast.open}
                autoHideDuration={2200}
                onClose={() => setStockToast({ open: false, message: '' })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setStockToast({ open: false, message: '' })}
                    severity="warning"
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {stockToast.message}
                </Alert>
            </Snackbar>

            {/* Invoices print on an 80mm thermal roll, not A4. */}
            <style>
                {`
                @media print {
                    /* Everything outside the slip leaves the layout entirely, otherwise
                       the terminal behind it prints as extra blank pages. */
                    body *:not(:has(#pos-receipt)):not(:has(#pos-kot)):not(:has(#pos-draft-kot)):not(#pos-receipt):not(#pos-receipt *):not(#pos-kot):not(#pos-kot *):not(#pos-draft-kot):not(#pos-draft-kot *) {
                        display: none !important;
                    }

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

                    ${thermalInvoicePrintCss('#pos-receipt', 58)}
                }
                `}
            </style>
        </Box>
    );
};

export default POSTerminal;
