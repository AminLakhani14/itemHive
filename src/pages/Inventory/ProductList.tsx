import ProductSellingFields from '../../components/Common/ProductSellingFields';
import { emptySellingDetails, sellingPayload, sellingError, isFixedProduct } from '../../lib/productSelling';
import ProductImageUpload from '../../components/Common/ProductImageUpload';
import useProductCategories from '../../hooks/useProductCategories';
import React, { useState } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    TextField,
    InputAdornment,
    Chip,
    Button,
    Avatar,
    Menu,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Grid,
    Snackbar,
    Alert,
    Stack
} from '@mui/material';
import {
    Search,
    MoreVertical,
    Edit,
    Trash2,
    Plus,
    Filter,
    Download,
    Eye,
    Save,
    Package,
    Layers,
    DollarSign,
    X,
    TrendingUp,
    ShieldCheck,
    History
} from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { deleteProductApi, updateProductApi, addProductApi, fetchProducts, type Product, resolveProductImage, placeholderFallback } from '../../features/inventory/inventorySlice';
import { useNavigate, useLocation } from 'react-router-dom';
import { alpha, useTheme, styled } from '@mui/material/styles';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import useAppCurrency from '../../hooks/useAppCurrency';
import { DEFAULT_PRODUCT_UNIT, getProductUnit, getProductUnitLabel, PRODUCT_UNITS } from '../../lib/productUnits';
import { hasScreenAccess } from '../../lib/screenPermissions';

const IconContainer = styled(Box)<{ color?: string }>(({ theme, color }) => ({
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(color || theme.palette.primary.main, 0.1),
    color: color || theme.palette.primary.main,
    marginBottom: theme.spacing(1)
}));

const PremiumDialog = styled(Dialog)(({ theme }) => ({
    '& .MuiDialog-paper': {
        borderRadius: 24,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        backgroundImage: 'none',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 64px)',
        margin: theme.spacing(2)
    },
    '& .MuiDialogTitle-root': {
        padding: theme.spacing(3, 4),
        fontWeight: 800,
        fontSize: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
    },
    '& .MuiDialogContent-root': {
        padding: theme.spacing(3, 4),
        flexGrow: 1,
        overflowY: 'auto'
    },
    '& .MuiDialogActions-root': {
        padding: theme.spacing(2, 4, 3),
        gap: theme.spacing(1),
        flexShrink: 0
    }
}));


type InlineField = 'stock' | 'salePrice';

const ProductList: React.FC = () => {
    const { categories: categories_list } = useProductCategories();
    const theme = useTheme();
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const { currency, currencySymbol, formatCurrency } = useAppCurrency();
    const { products } = useSelector((state: RootState) => state.inventory);
    const { user } = useSelector((state: RootState) => state.auth);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [viewProduct, setViewProduct] = useState<Product | null>(null);
    const [editSaving, setEditSaving] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [inlineEdit, setInlineEdit] = useState<{ id: string; field: InlineField; value: string } | null>(null);
    const [inlineSaving, setInlineSaving] = useState<string | null>(null);
    const [snack, setSnack] = useState<{ open: boolean, message: string, severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success'
    });
    const [showFilters, setShowFilters] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [addFormData, setAddFormData] = useState({
        sku: '',
        name: '',
        category: '',
        purchasePrice: '',
        salePrice: '',
        stock: '',
        minStock: '',
        ...emptySellingDetails,
        productUnitCode: DEFAULT_PRODUCT_UNIT.code as string,
        description: '',
        batchNumber: '',
        expiryDate: '',
        supplier: '',
        imageUrl: ''
    });

    const location = useLocation();

    React.useEffect(() => {
        const loadProducts = () => dispatch(fetchProducts({ force: true }));

        dispatch(fetchProducts());
        window.addEventListener('itemhive-workspace-changed', loadProducts);
        return () => window.removeEventListener('itemhive-workspace-changed', loadProducts);
    }, [dispatch]);

    React.useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        if (queryParams.get('add') === 'true') {
            if (user?.role === 'super_admin' || user?.role === 'admin') {
                setShowAddModal(true);
            } else {
                navigate('/inventory/add', { replace: true });
                return;
            }
            navigate('/inventory', { replace: true });
        }
    }, [location.search, navigate, user?.role]);

    const handleSnackClose = () => setSnack({ ...snack, open: false });

    const showSnack = (message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'success') => {
        setSnack({ open: true, message, severity });
    };

    React.useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    const isManager = user?.role === 'super_admin' || user?.role === 'admin';
    const canOpenAddProduct = hasScreenAccess(user, 'inventory_add');
    const canOpenImportProducts = hasScreenAccess(user, 'inventory_import');

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, id: string) => {
        setAnchorEl(event.currentTarget);
        setSelectedProductId(id);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
        setSelectedProductId(null);
    };

    const handleDeleteClick = () => {
        setDeleteId(selectedProductId);
        handleMenuClose();
    };

    const handleViewClick = () => {
        const product = products.find(p => p.id === selectedProductId);
        if (product) setViewProduct(product);
        handleMenuClose();
    };

    const handleEditClick = () => {
        const product = products.find(p => p.id === selectedProductId);
        if (product) setEditProduct({ ...product });
        handleMenuClose();
    };

    const confirmDelete = () => {
        if (deleteId) {
            dispatch(deleteProductApi(deleteId));
            setDeleteId(null);
            showSnack('Product deleted successfully', 'success');
        }
    };

    const handleUpdateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editProduct || editSaving) return;
        setEditSaving(true);
        try {
            const validationError = sellingError(editProduct);
            if (validationError) { showSnack(validationError, 'error'); return; }
            await dispatch(updateProductApi(sellingPayload(editProduct))).unwrap();
            setEditProduct(null);
            showSnack('Product updated successfully', 'success');
        } catch (error) {
            showSnack(typeof error === 'string' ? error : 'Unable to save product', 'error');
        } finally { setEditSaving(false); }
    };

    const saveProductInline = (product: Product, message = 'Product updated successfully') => {
        dispatch(updateProductApi(product))
            .unwrap()
            .then(() => showSnack(message, 'success'))
            .catch((error) => showSnack(typeof error === 'string' ? error : 'Failed to update product', 'error'))
            .finally(() => setInlineSaving(null));
    };

    const startInlineEdit = (product: Product, field: InlineField) => {
        if (!isManager || inlineSaving) return;
        if (isFixedProduct(product)) { setEditProduct({ ...product }); return; }
        setInlineEdit({
            id: product.id,
            field,
            value: String(field === 'stock' ? product.stock : product.salePrice),
        });
    };

    const cancelInlineEdit = () => {
        setInlineEdit(null);
    };

    const commitInlineEdit = (product: Product) => {
        if (!inlineEdit || inlineEdit.id !== product.id) return;

        const numericValue = Number(inlineEdit.value);
        if (!Number.isFinite(numericValue) || numericValue < 0) {
            showSnack('Please enter a valid positive number', 'error');
            return;
        }

        const updatedProduct: Product = inlineEdit.field === 'stock'
            ? { ...product, stock: numericValue }
            : { ...product, salePrice: numericValue, price: numericValue };

        setInlineEdit(null);
        setInlineSaving(`${product.id}-${inlineEdit.field}`);
        saveProductInline(updatedProduct, inlineEdit.field === 'stock' ? 'Quantity updated successfully' : 'Price updated successfully');
    };

    const handleUnitUpdate = (product: Product, unitCode: string) => {
        const unit = getProductUnit(unitCode);
        if (!isManager || inlineSaving || product.productUnitCode === unit.code) return;

        setInlineSaving(`${product.id}-unit`);
        saveProductInline({
            ...product,
            productUnitCode: unit.code,
            productUnit: unit.english,
            productUnitUrdu: unit.urdu,
        }, 'Product unit updated successfully');
    };

    const handleAddChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAddFormData({ ...addFormData, [e.target.name]: e.target.value });
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Check for duplicate SKU
        if (products.some((p: Product) => p.sku === addFormData.sku)) {
            showSnack('A product with this SKU already exists!', 'error');
            return;
        }

        if (editSaving) return;
        setEditSaving(true);
        try {
        const validationError = sellingError(addFormData);
        if (validationError) { showSnack(validationError, 'error'); return; }
        await dispatch(addProductApi(sellingPayload({
            id: Math.random().toString(36).substr(2, 9),
            sku: addFormData.sku.toUpperCase(),
            name: addFormData.name,
            category: addFormData.category || 'Uncategorized',
            purchasePrice: parseFloat(addFormData.purchasePrice),
            salePrice: parseFloat(addFormData.salePrice),
            price: parseFloat(addFormData.salePrice),
            stock: Number(addFormData.stock),
            minStock: Number(addFormData.minStock),
            unitSizeEnabled: addFormData.unitSizeEnabled,
            sellingType: addFormData.sellingType,
            sizes: addFormData.sizes,
            productUnitCode: addFormData.productUnitCode,
            productUnit: addFormData.productUnit || getProductUnit(addFormData.productUnitCode).english,
            productUnitUrdu: getProductUnit(addFormData.productUnitCode).urdu,
            description: addFormData.description,
            batchNumber: addFormData.batchNumber || `B-${Math.floor(Math.random() * 9000) + 1000}`,
            expiryDate: addFormData.expiryDate || new Date(Date.now() + 31536000000).toISOString().split('T')[0],
            supplier: addFormData.supplier || 'General Supplier',
            imageUrl: addFormData.imageUrl
        }))).unwrap();

        setShowAddModal(false);
        setAddFormData({
            sku: '',
            name: '',
            category: '',
            purchasePrice: '',
            salePrice: '',
            stock: '',
            minStock: '',
            ...emptySellingDetails,
        productUnitCode: DEFAULT_PRODUCT_UNIT.code as string,
            description: '',
            batchNumber: '',
            expiryDate: '',
            supplier: '',
        imageUrl: ''
        });
        showSnack('Product added successfully', 'success');
        } catch (error) {
            showSnack(typeof error === 'string' ? error : 'Unable to save product', 'error');
        } finally { setEditSaving(false); }
    };

    const exportToExcel = () => {
        const rows = products.map((product) => ({
            SKU: product.sku,
            Name: product.name,
            Category: product.category,
            'Purchase Price': product.purchasePrice,
            'Sale Price': product.salePrice,
            Stock: product.stock,
            'Min Stock': product.minStock,
            'Unit Code': product.productUnitCode || getProductUnit(product.productUnitCode).code,
            Description: product.description || '',
            'Batch Number': product.batchNumber || '',
            'Expiry Date': product.expiryDate || '',
            Supplier: product.supplier || '',
            'Image URL': product.imageUrl || '',
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        worksheet['!cols'] = Object.keys(rows[0] || {}).map((header) => ({ wch: Math.max(header.length + 2, 15) }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
        XLSX.writeFile(workbook, `itemhive_inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const categories = Array.from(new Set(products.map(p => p.category))).sort();

    const filteredProducts = products.filter(p => {
        const matchesSearch =
            p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            p.category.toLowerCase().includes(debouncedSearch.toLowerCase());
        const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
        const matchesStock = stockFilter === 'all'
            ? true
            : stockFilter === 'out'
                ? p.stock <= 0
                : stockFilter === 'low'
                    ? p.stock > 0 && p.stock <= p.minStock
                    : p.stock > p.minStock;
        return matchesSearch && matchesCategory && matchesStock;
    });

    return (
        <Box>
            <Box
                className="section-rise"
                sx={{
                    mb: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: 1.5
                }}
            >
                <Box>
                    <Typography variant="h4" fontWeight={800}>Inventory Management</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Track stock levels, pricing, and low-stock alerts in one view.
                    </Typography>
                </Box>
                {(!isManager || canOpenAddProduct) && (
                    <Button
                        variant="contained"
                        startIcon={<Plus size={20} />}
                        onClick={() => navigate('/inventory/add')}
                        sx={{ borderRadius: 2, px: 3, py: 1.2, fontWeight: 800 }}
                    >
                        {isManager ? 'Add Product' : 'Request Inventory'}
                    </Button>
                )}
            </Box>

            <Card className="section-rise-delay" sx={{ borderRadius: 4, overflow: 'hidden' }}>
                <CardContent sx={{ p: 0 }}>
                    <Box sx={{ p: 2.5, display: 'flex', gap: 1.2, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
                        <TextField
                            placeholder="Search products..."
                            size="small"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search size={18} color="#64748b" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ flexGrow: 1, width: { xs: '100%', sm: 'auto' }, maxWidth: { sm: 420 } }}
                        />
                        <Button
                            variant="outlined"
                            startIcon={<Filter size={18} />}
                            sx={{ width: { xs: '100%', sm: 'auto' } }}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            Filters
                        </Button>
                        {isManager && <Button variant="outlined" startIcon={<Download size={18} />} sx={{ width: { xs: '100%', sm: 'auto' } }} onClick={exportToExcel}>
                            Export Excel
                        </Button>}
                        {isManager && canOpenImportProducts && <Button variant="outlined" startIcon={<Download size={18} />} sx={{ width: { xs: '100%', sm: 'auto' } }} onClick={() => navigate('/inventory/import')}>
                            Import Excel
                        </Button>}
                    </Box>

                    {showFilters && (
                        <Box sx={{ px: 2.5, py: 2, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
                            <TextField
                                select
                                label="Category"
                                size="small"
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                sx={{ minWidth: 180 }}
                            >
                                <MenuItem value="all">All</MenuItem>
                                {categories.map((cat) => (
                                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                select
                                label="Stock"
                                size="small"
                                value={stockFilter}
                                onChange={(e) => setStockFilter(e.target.value as 'all' | 'in' | 'low' | 'out')}
                                sx={{ minWidth: 160 }}
                            >
                                <MenuItem value="all">All</MenuItem>
                                <MenuItem value="in">In Stock</MenuItem>
                                <MenuItem value="low">Low Stock</MenuItem>
                                <MenuItem value="out">Out of Stock</MenuItem>
                            </TextField>
                            <Button
                                variant="text"
                                color="inherit"
                                onClick={() => {
                                    setCategoryFilter('all');
                                    setStockFilter('all');
                                }}
                            >
                                Clear Filters
                            </Button>
                        </Box>
                    )}

                    <TableContainer component={Box} sx={{ overflowX: 'auto' }}>
                        <Table sx={{ minWidth: 980 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>PRODUCT NAME</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>CATEGORY</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>QUANTITY</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>PRODUCT UNIT</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>PRICE</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>STATUS</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>ACTIONS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredProducts.map((product) => (
                                    <TableRow key={product.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                <Avatar
                                                    variant="rounded"
                                                    src={resolveProductImage(product)}
                                                    alt={product.name}
                                                    imgProps={{
                                                        onError: (e) => {
                                                            const target = e.currentTarget as HTMLImageElement;
                                                            if (target.src !== placeholderFallback) {
                                                                target.src = placeholderFallback;
                                                            }
                                                        }
                                                    }}
                                                    sx={{
                                                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                                                        color: 'primary.main',
                                                        fontWeight: 700,
                                                        width: 48,
                                                        height: 48
                                                    }}
                                                >
                                                    {product.name.charAt(0)}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="subtitle2" fontWeight={700}>{product.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary">ID: {product.id}</Typography>
                                                    {product.businessName && (
                                                        <Typography variant="caption" color="primary.main" display="block" fontWeight={800}>
                                                            {product.businessName}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={product.category}
                                                size="small"
                                                variant="outlined"
                                                sx={{ fontWeight: 700 }}
                                            />
                                        </TableCell>
                                        <TableCell
                                            onClick={() => startInlineEdit(product, 'stock')}
                                            sx={{ cursor: isManager ? 'pointer' : 'default', minWidth: 150 }}
                                        >
                                            {inlineEdit?.id === product.id && inlineEdit.field === 'stock' ? (
                                                <TextField
                                                    autoFocus
                                                    size="small"
                                                    type="number"
                                                    value={inlineEdit.value}
                                                    onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                                                    onBlur={() => commitInlineEdit(product)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            e.currentTarget.blur();
                                                        }
                                                        if (e.key === 'Escape') cancelInlineEdit();
                                                    }}
                                                    inputProps={{ min: 0, step: '0.01' }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    sx={{ width: 110 }}
                                                />
                                            ) : (
                                                <Stack spacing={0.25}>
                                                    <Typography variant="body2" fontWeight={800}>
                                                        {product.stock}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {inlineSaving === `${product.id}-stock` ? 'Saving...' : isManager ? '' : 'Quantity'}
                                                    </Typography>
                                                </Stack>
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ minWidth: 190 }}>
                                            {isManager && !product.unitSizeEnabled && PRODUCT_UNITS.some(unit => unit.code === (product.productUnitCode || DEFAULT_PRODUCT_UNIT.code)) ? (
                                                <TextField
                                                    select
                                                    size="small"
                                                    value={product.productUnitCode || DEFAULT_PRODUCT_UNIT.code}
                                                    onChange={(e) => handleUnitUpdate(product, e.target.value)}
                                                    disabled={inlineSaving === `${product.id}-unit`}
                                                    sx={{
                                                        minWidth: 165,
                                                        '& .MuiInputBase-root': {
                                                            borderRadius: 2,
                                                            fontWeight: 800,
                                                        },
                                                    }}
                                                >
                                                    {PRODUCT_UNITS.map((unit) => (
                                                        <MenuItem key={unit.code} value={unit.code}>
                                                            {unit.english} / {unit.urdu}
                                                        </MenuItem>
                                                    ))}
                                                </TextField>
                                            ) : (
                                                <Typography variant="body2" fontWeight={700}>
                                                    {product.unitSizeEnabled ? (isFixedProduct(product) ? 'Bottles/packs' : product.productUnit) : getProductUnitLabel(product.productUnitCode, product.productUnit, product.productUnitUrdu)}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell
                                            onClick={() => startInlineEdit(product, 'salePrice')}
                                            sx={{ cursor: isManager ? 'pointer' : 'default', minWidth: 160 }}
                                        >
                                            {inlineEdit?.id === product.id && inlineEdit.field === 'salePrice' ? (
                                                <TextField
                                                    autoFocus
                                                    size="small"
                                                    type="number"
                                                    value={inlineEdit.value}
                                                    onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                                                    onBlur={() => commitInlineEdit(product)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            e.currentTarget.blur();
                                                        }
                                                        if (e.key === 'Escape') cancelInlineEdit();
                                                    }}
                                                    inputProps={{ min: 0, step: '0.01' }}
                                                    InputProps={{
                                                        startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment>,
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    sx={{ width: 135 }}
                                                />
                                            ) : (
                                                <Stack spacing={0.25}>
                                                    <Typography variant="body2" fontWeight={800}>{formatCurrency(product.price)}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {inlineSaving === `${product.id}-salePrice` ? 'Saving...' : isManager ? '' : 'Sale price'}
                                                    </Typography>
                                                </Stack>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {product.stock <= 0 ? (
                                                <Chip label="Out of Stock" size="small" color="error" sx={{ fontWeight: 600 }} />
                                            ) : product.stock <= product.minStock ? (
                                                <Chip label="Low Stock" size="small" color="warning" sx={{ fontWeight: 600 }} />
                                            ) : (
                                                <Chip label="In Stock" size="small" color="success" sx={{ fontWeight: 600 }} />
                                            )}
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton onClick={(e) => handleMenuOpen(e, product.id)}>
                                                <MoreVertical size={20} />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                <MenuItem onClick={handleViewClick}><Eye size={16} style={{ marginRight: 8 }} /> View Details</MenuItem>
                {isManager && (
                    <>
                        <MenuItem onClick={handleEditClick}><Edit size={16} style={{ marginRight: 8 }} /> Edit Product</MenuItem>
                        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}><Trash2 size={16} style={{ marginRight: 8 }} /> Delete</MenuItem>
                    </>
                )}
            </Menu>

            {/* View Product Dialog */}
            <PremiumDialog
                open={Boolean(viewProduct)}
                onClose={() => setViewProduct(null)}
                maxWidth="sm"
                fullWidth
                scroll="paper"
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <IconContainer color={theme.palette.secondary.main} sx={{ mb: 0 }}>
                            <Eye size={22} />
                        </IconContainer>
                        <span className="gradient-text">Product Details</span>
                    </Box>
                    <IconButton onClick={() => setViewProduct(null)} size="small" sx={{ color: 'text.secondary' }}>
                        <X size={20} />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {viewProduct && (
                        <Box sx={{ py: 1 }}>
                            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, mb: 4 }}>
                                <motion.div
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 }}
                                >
                                    <Box
                                        component="img"
                                        src={resolveProductImage(viewProduct)}
                                        alt={viewProduct.name}
                                        onError={(e) => {
                                            const target = e.currentTarget as HTMLImageElement;
                                            if (target.src !== placeholderFallback) {
                                                target.src = placeholderFallback;
                                            }
                                        }}
                                        sx={{
                                            width: { xs: '100%', md: 180 },
                                            height: 180,
                                            borderRadius: 6,
                                            objectFit: 'cover',
                                            border: '4px solid white',
                                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                                        }}
                                    />
                                </motion.div>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="h4" fontWeight={900} sx={{ letterSpacing: -1, color: 'text.primary', mb: 1 }}>
                                        {viewProduct.name}
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                                        <Chip
                                            icon={<Package size={14} />}
                                            label={viewProduct.category}
                                            variant="filled"
                                            color="primary"
                                            sx={{ fontWeight: 700, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' }}
                                        />
                                        <Chip
                                            label={`SKU: ${viewProduct.sku}`}
                                            variant="outlined"
                                            sx={{ fontWeight: 600, borderRadius: 2 }}
                                        />
                                    </Box>
                                    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6, mb: 2 }}>
                                        {viewProduct.description || 'No detailed description available for this item.'}
                                    </Typography>
                                </Box>
                            </Box>

                            {isFixedProduct(viewProduct) && <Stack spacing={1} sx={{ mb: 3 }}>
                                {(viewProduct.sizes || []).map(size => <Box key={size.id} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                                    <Typography fontWeight={700}>{size.size} {typeof size.size === 'number' ? viewProduct.productUnit : ''}</Typography>
                                    <Typography variant="body2">Purchase: {formatCurrency(size.purchasePrice)} - Sale: {formatCurrency(size.salePrice)} - Stock: {size.stock} bottles/packs</Typography>
                                </Box>)}
                            </Stack>}
                            <Grid container spacing={2}>
                                {[
                                    { label: isFixedProduct(viewProduct) ? 'FIRST SIZE BUY' : 'BUY', value: formatCurrency(viewProduct.purchasePrice), icon: <DollarSign size={18} />, color: '#f59e0b' },
                                    { label: isFixedProduct(viewProduct) ? 'FIRST SIZE SELL' : 'SELL', value: formatCurrency(viewProduct.salePrice), icon: <DollarSign size={18} />, color: '#10b981' },
                                    { label: 'STOCK', value: `${viewProduct.stock} ${isFixedProduct(viewProduct) ? 'bottles/packs' : viewProduct.unitSizeEnabled ? viewProduct.productUnit : getProductUnitLabel(viewProduct.productUnitCode, viewProduct.productUnit, viewProduct.productUnitUrdu)}`, icon: <TrendingUp size={18} />, color: '#6366f1' },
                                    { label: 'MIN STOCK', value: `${viewProduct.minStock} ${isFixedProduct(viewProduct) ? 'bottles/packs' : viewProduct.unitSizeEnabled ? viewProduct.productUnit : getProductUnitLabel(viewProduct.productUnitCode, viewProduct.productUnit, viewProduct.productUnitUrdu)}`, icon: <ShieldCheck size={18} />, color: '#0ea5e9' },
                                    { label: 'BATCH', value: viewProduct.batchNumber || 'N/A', icon: <Layers size={18} />, color: '#a855f7' },
                                    { label: 'EXPIRY', value: viewProduct.expiryDate || 'N/A', icon: <History size={18} />, color: '#ef4444' },
                                    { label: 'SUPPLIER', value: viewProduct.supplier || 'N/A', icon: <ShieldCheck size={18} />, color: '#0ea5e9' },
                                    { label: 'UPDATED', value: viewProduct.lastUpdated ? new Date(viewProduct.lastUpdated).toLocaleDateString() : 'N/A', icon: <History size={18} />, color: '#64748b' },
                                ].map((item, idx) => (
                                    <Grid size={{ xs: 6, sm: 3 }} key={item.label}>
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2 + (idx * 0.05) }}
                                        >
                                            <Box sx={{
                                                p: 2,
                                                borderRadius: 4,
                                                bgcolor: alpha(item.color, 0.05),
                                                border: `1px solid ${alpha(item.color, 0.1)}`,
                                                height: '100%'
                                            }}>
                                                <Box sx={{ color: item.color, mb: 1 }}>{item.icon}</Box>
                                                <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                                                    {item.label}
                                                </Typography>
                                                <Typography variant="subtitle1" fontWeight={800} color="text.primary">
                                                    {item.value}
                                                </Typography>
                                            </Box>
                                        </motion.div>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 4 }}>
                    <Button
                        onClick={() => setViewProduct(null)}
                        variant="outlined"
                        color="inherit"
                        sx={{ borderRadius: 3, px: 3 }}
                    >
                        Close
                    </Button>
                    {isManager && (
                        <Button
                            onClick={() => { setEditProduct(viewProduct); setViewProduct(null); }}
                            variant="contained"
                            startIcon={<Edit size={18} />}
                            sx={{ borderRadius: 3, px: 3, fontWeight: 800, boxShadow: theme.shadows[4] }}
                        >
                            Edit Product
                        </Button>
                    )}
                </DialogActions>
            </PremiumDialog>

            {/* Edit Product Dialog */}
            <Dialog open={Boolean(editProduct)} onClose={() => { if (!editSaving) setEditProduct(null); }} maxWidth="md" fullWidth>
                <form onSubmit={handleUpdateSubmit}>
                    <DialogTitle sx={{ fontWeight: 800 }}>Edit Product</DialogTitle>
                    <DialogContent dividers>
                        {editProduct && (
                            <Grid container spacing={3} sx={{ mt: 1 }}>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        fullWidth
                                        label="Product Name"
                                        required
                                        value={editProduct.name}
                                        onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="Category"
                                        required
                                        value={editProduct.category}
                                        onChange={(e) => setEditProduct({ ...editProduct, category: e.target.value })}
                                    >
                                        {categories_list.map((cat) => (
                                            <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label={`Purchase Price (${currency})${editProduct.unitSizeEnabled && editProduct.sellingType === 'quantity' ? ` per ${editProduct.productUnit}` : ''}`}
                                        type="number"
                                        required
                                        disabled={!!isFixedProduct(editProduct)} slotProps={{ htmlInput: { min: 0, step: 'any' } }} value={editProduct.purchasePrice}
                                        onChange={(e) => setEditProduct({ ...editProduct, purchasePrice: parseFloat(e.target.value) })}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label={`Sell Price (${currency})${editProduct.unitSizeEnabled && editProduct.sellingType === 'quantity' ? ` per ${editProduct.productUnit}` : ''}`}
                                        type="number"
                                        required
                                        disabled={!!isFixedProduct(editProduct)} slotProps={{ htmlInput: { min: 0, step: 'any' } }} value={editProduct.salePrice}
                                        onChange={(e) => setEditProduct({ ...editProduct, salePrice: parseFloat(e.target.value), price: parseFloat(e.target.value) })}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Current Stock"
                                        type="number"
                                        required
                                        disabled={!!isFixedProduct(editProduct)} slotProps={{ htmlInput: { min: 0, step: 'any' } }} value={editProduct.stock}
                                        onChange={(e) => setEditProduct({ ...editProduct, stock: parseFloat(e.target.value) })}
                                    />
                                </Grid>
                                <Grid size={12}><ProductSellingFields value={editProduct} onChange={details => setEditProduct(current => current ? ({ ...current, ...details }) : current)} /></Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Min Stock Threshold"
                                        type="number"
                                        required
                                        value={editProduct.minStock}
                                        onChange={(e) => setEditProduct({ ...editProduct, minStock: Number(e.target.value) })}
                                    />
                                </Grid>
                                <Grid size={12}>
                                    <ProductImageUpload key={editProduct.id} value={editProduct.imageUrl} disabled={editSaving} onChange={imageUrl => setEditProduct(current => current ? { ...current, imageUrl } : current)} />
                                </Grid>
                                <Grid size={12}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={2}
                                        label="Description"
                                        value={editProduct.description}
                                        onChange={(e) => setEditProduct({ ...editProduct, description: e.target.value })}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Batch Number"
                                        value={editProduct.batchNumber || ''}
                                        onChange={(e) => setEditProduct({ ...editProduct, batchNumber: e.target.value })}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Expiry Date"
                                        type="date"
                                        InputLabelProps={{ shrink: true }}
                                        value={editProduct.expiryDate || ''}
                                        onChange={(e) => setEditProduct({ ...editProduct, expiryDate: e.target.value })}
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, md: 4 }}>
                                    <TextField
                                        fullWidth
                                        label="Supplier"
                                        value={editProduct.supplier || ''}
                                        onChange={(e) => setEditProduct({ ...editProduct, supplier: e.target.value })}
                                    />
                                </Grid>
                            </Grid>
                        )}
                    </DialogContent>
                    <DialogActions sx={{ p: 2 }}>
                        <Button disabled={editSaving} onClick={() => setEditProduct(null)}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={editSaving} startIcon={<Save size={20} />}>{editSaving ? 'Saving...' : 'Save Changes'}</Button>
                    </DialogActions>
                </form>
            </Dialog>

            <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>Are you sure you want to delete this product? This action cannot be undone.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)}>Cancel</Button>
                    <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>

            {/* Add Product Modal */}
            <PremiumDialog
                open={showAddModal}
                onClose={() => { if (!editSaving) setShowAddModal(false); }}
                maxWidth="md"
                fullWidth
                scroll="paper"
                PaperProps={{
                    component: 'form',
                    onSubmit: handleAddSubmit
                }}
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <IconContainer sx={{ mb: 0 }}>
                            <Plus size={24} />
                        </IconContainer>
                        <span className="gradient-text">Add New Product</span>
                    </Box>
                    <IconButton disabled={editSaving} onClick={() => setShowAddModal(false)} size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: alpha('#ef4444', 0.1) } }}>
                        <X size={20} />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={4} sx={{ mt: 0.5 }}>
                        <Grid size={{ xs: 12, md: 7 }}>
                            <Box sx={{ mb: 4 }}>
                                <Typography variant="subtitle1" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                    <Layers size={20} color={theme.palette.primary.main} /> Core Details
                                </Typography>
                                <Grid container spacing={3}>
                                    <Grid size={12}>
                                        <TextField
                                            fullWidth
                                            label="SKU / Barcode"
                                            name="sku"
                                            required
                                            value={addFormData.sku}
                                            onChange={handleAddChange}
                                            placeholder="e.g. ELE-MAC-001"
                                            variant="outlined"
                                            InputProps={{ sx: { borderRadius: 3 } }}
                                        />
                                    </Grid>
                                    <Grid size={12}>
                                        <TextField
                                            fullWidth
                                            label="Full Product Name"
                                            name="name"
                                            required
                                            value={addFormData.name}
                                            onChange={handleAddChange}
                                            InputProps={{ sx: { borderRadius: 3 } }}
                                        />
                                    </Grid>
                                    <Grid size={12}>
                                        <TextField
                                            select
                                            fullWidth
                                            label="Category"
                                            name="category"
                                            required
                                            value={addFormData.category}
                                            onChange={handleAddChange}
                                            InputProps={{ sx: { borderRadius: 3 } }}
                                        >
                                            {categories_list.map((option) => (
                                                <MenuItem key={option} value={option} sx={{ fontWeight: 600 }}>
                                                    {option}
                                                </MenuItem>
                                            ))}
                                    </TextField>
                                </Grid>
                                    <Grid size={12}><ProductSellingFields value={addFormData} onChange={details => setAddFormData(current => ({ ...current, ...details }))} /></Grid>
                                    <Grid size={12}>
                                        <TextField
                                            fullWidth
                                            multiline
                                            rows={2}
                                            label="Product Description"
                                            name="description"
                                            value={addFormData.description}
                                            onChange={handleAddChange}
                                            placeholder="Write something..."
                                            InputProps={{ sx: { borderRadius: 3 } }}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <TextField
                                            fullWidth
                                            label="Batch Number"
                                            name="batchNumber"
                                            value={addFormData.batchNumber}
                                            onChange={handleAddChange}
                                            placeholder="e.g. B-90210"
                                            InputProps={{ sx: { borderRadius: 3 } }}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <TextField
                                            fullWidth
                                            label="Supplier Name"
                                            name="supplier"
                                            value={addFormData.supplier}
                                            onChange={handleAddChange}
                                            placeholder="e.g. Acme Corp"
                                            InputProps={{ sx: { borderRadius: 3 } }}
                                        />
                                    </Grid>
                                    <Grid size={12}>
                                        <TextField
                                            fullWidth
                                            label="Expiry Date"
                                            name="expiryDate"
                                            type="date"
                                            InputLabelProps={{ shrink: true }}
                                            value={addFormData.expiryDate}
                                            onChange={handleAddChange}
                                            InputProps={{ sx: { borderRadius: 3 } }}
                                        />
                                    </Grid>
                                </Grid>
                            </Box>
                        </Grid>

                        <Grid size={{ xs: 12, md: 5 }}>
                            <Box sx={{ p: 3, bgcolor: alpha(theme.palette.primary.main, 0.03), borderRadius: 6, border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.08), mb: 3 }}>
                                <Typography variant="subtitle1" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                    <DollarSign size={20} color={theme.palette.primary.main} /> Financial & Stock
                                </Typography>
                                <Stack spacing={3}>
                                    <TextField
                                        fullWidth
                                        label={`Upload Price (${currency})`}
                                        name="purchasePrice"
                                        type="number"
                                        disabled={!!isFixedProduct(addFormData)} slotProps={{ htmlInput: { min: 0, step: 'any' } }} required={!isFixedProduct(addFormData)}
                                        value={addFormData.purchasePrice}
                                        onChange={handleAddChange}
                                        InputProps={{
                                            sx: { borderRadius: 3, bgcolor: 'background.paper' },
                                            startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment>,
                                        }}
                                    />
                                    <TextField
                                        fullWidth
                                        label={`Sell Price (${currency})`}
                                        name="salePrice"
                                        type="number"
                                        disabled={!!isFixedProduct(addFormData)} slotProps={{ htmlInput: { min: 0, step: 'any' } }} required={!isFixedProduct(addFormData)}
                                        value={addFormData.salePrice}
                                        onChange={handleAddChange}
                                        InputProps={{
                                            sx: { borderRadius: 3, bgcolor: 'background.paper' },
                                            startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment>,
                                        }}
                                    />
                                    <TextField
                                        fullWidth
                                        label={addFormData.unitSizeEnabled && addFormData.sellingType === 'quantity' ? `Initial Stock (${addFormData.productUnit})` : 'Initial Stock'}
                                        name="stock"
                                        type="number"
                                        disabled={!!isFixedProduct(addFormData)} slotProps={{ htmlInput: { min: 0, step: 'any' } }} required={!isFixedProduct(addFormData)}
                                        value={addFormData.stock}
                                        onChange={handleAddChange}
                                        InputProps={{ sx: { borderRadius: 3, bgcolor: 'background.paper' } }}
                                        helperText={isFixedProduct(addFormData) ? 'Stock is entered for each size above.' : addFormData.unitSizeEnabled ? `Stock in ${addFormData.productUnit}` : 'Available item quantity'}
                                    />
                                    <TextField
                                        fullWidth
                                        label="Minimum Alert Level"
                                        slotProps={{ htmlInput: { min: 0, step: 'any' } }} name="minStock"
                                        type="number"
                                        required
                                        value={addFormData.minStock}
                                        onChange={handleAddChange}
                                        InputProps={{ sx: { borderRadius: 3, bgcolor: 'background.paper' } }}
                                        helperText="Alert dashboard when stock drops below this"
                                    />
                                </Stack>
                            </Box>

                            <ProductImageUpload value={addFormData.imageUrl} disabled={editSaving} onChange={imageUrl => setAddFormData(current => ({ ...current, imageUrl }))} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ px: 4, pb: 4, pt: 2 }}>
                    <Button
                        onClick={() => setShowAddModal(false)}
                        variant="outlined"
                        color="inherit"
                        size="large"
                        sx={{ borderRadius: 3, px: 4, fontWeight: 700 }}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        startIcon={<Plus size={20} />}
                        disabled={editSaving}
                        sx={{
                            borderRadius: 3,
                            px: 6,
                            fontWeight: 800,
                            py: 1.5,
                            fontSize: '1rem',
                            boxShadow: `0 8px 20px -6px ${alpha(theme.palette.primary.main, 0.5)}`
                        }}
                    >
                        Create Product
                    </Button>
                </DialogActions>
            </PremiumDialog>

            <Snackbar
                open={snack.open}
                autoHideDuration={4000}
                onClose={handleSnackClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert onClose={handleSnackClose} severity={snack.severity} variant="filled" sx={{ width: '100%' }}>
                    {snack.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ProductList;
