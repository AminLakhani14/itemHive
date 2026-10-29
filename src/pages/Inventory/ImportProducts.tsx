import React, { useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Divider,
    List,
    ListItem,
    ListItemText,
    Stack,
    Typography,
} from '@mui/material';
import { ChevronLeft, Download, FileSpreadsheet, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { AppDispatch, RootState } from '../../store';
import { importProductsApi, type Product } from '../../features/inventory/inventorySlice';
import { getProductUnit } from '../../lib/productUnits';

type Row = Record<string, unknown>;

const TEMPLATE_COLUMNS = [
    'SKU', 'Name', 'Category', 'Purchase Price', 'Sale Price', 'Stock', 'Min Stock',
    'Unit Code', 'Description', 'Batch Number', 'Expiry Date', 'Supplier', 'Image URL',
];

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const cell = (row: Row, names: string[]) => {
    const normalized = Object.entries(row).reduce<Record<string, unknown>>((result, [key, value]) => {
        result[normalizeHeader(key)] = value;
        return result;
    }, {});
    return names.map(normalizeHeader).map((name) => normalized[name]).find((value) => value !== undefined && value !== null && String(value).trim() !== '') ?? '';
};

const createId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const ImportProducts: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const { products } = useSelector((state: RootState) => state.inventory);
    const [parsedProducts, setParsedProducts] = useState<Product[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [fileName, setFileName] = useState('');
    const [importing, setImporting] = useState(false);
    const [success, setSuccess] = useState('');

    const downloadTemplate = () => {
        const sheet = XLSX.utils.aoa_to_sheet([
            TEMPLATE_COLUMNS,
            ['DEMO-001', 'Sample Product', 'General', 100, 150, 20, 5, 'piece', 'Optional description', 'BATCH-001', '2027-12-31', 'General Supplier', ''],
        ]);
        sheet['!cols'] = TEMPLATE_COLUMNS.map((column) => ({ wch: Math.max(column.length + 3, 15) }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Products');
        XLSX.writeFile(workbook, 'ozor_product_import_template.xlsx');
    };

    const handleFile = async (file?: File) => {
        if (!file) return;
        setSuccess('');
        setErrors([]);
        setParsedProducts([]);
        setFileName(file.name);

        try {
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<Row>(firstSheet, { defval: '', raw: false });
            if (rows.length === 0) throw new Error('The selected sheet has no product rows.');

            const existingSkus = new Set(products.map((product) => product.sku.trim().toUpperCase()));
            const uploadedSkus = new Set<string>();
            const rowErrors: string[] = [];
            const nextProducts: Product[] = [];

            rows.forEach((row, index) => {
                const rowNumber = index + 2;
                const sku = String(cell(row, ['sku', 'product sku', 'product code'])).trim().toUpperCase();
                const name = String(cell(row, ['name', 'product name'])).trim();
                const category = String(cell(row, ['category'])).trim() || 'General';
                const purchasePrice = Number(cell(row, ['purchase price', 'purchaseprice', 'cost price', 'cost']));
                const salePrice = Number(cell(row, ['sale price', 'saleprice', 'selling price', 'price']));
                const stock = Number(cell(row, ['stock', 'quantity', 'qty']));
                const minStockValue = cell(row, ['min stock', 'minstock', 'minimum stock']);
                const minStock = minStockValue === '' ? 5 : Number(minStockValue);
                const unit = getProductUnit(String(cell(row, ['unit code', 'unitcode', 'unit'])).trim().toLowerCase());

                if (!sku || !name || !Number.isFinite(purchasePrice) || purchasePrice < 0 || !Number.isFinite(salePrice) || salePrice < 0 || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(minStock) || minStock < 0) {
                    rowErrors.push(`Row ${rowNumber}: SKU, Name, Purchase Price, Sale Price, and Stock must be valid values.`);
                    return;
                }
                if (existingSkus.has(sku) || uploadedSkus.has(sku)) {
                    rowErrors.push(`Row ${rowNumber}: SKU “${sku}” already exists or is repeated in this file.`);
                    return;
                }
                uploadedSkus.add(sku);
                nextProducts.push({
                    id: createId(), sku, name, category, purchasePrice, salePrice, price: salePrice, stock, minStock,
                    productUnitCode: unit.code, productUnit: unit.english, productUnitUrdu: unit.urdu,
                    description: String(cell(row, ['description'])).trim(),
                    batchNumber: String(cell(row, ['batch number', 'batchnumber', 'batch'])).trim(),
                    expiryDate: String(cell(row, ['expiry date', 'expirydate', 'expiry'])).trim(),
                    supplier: String(cell(row, ['supplier'])).trim(),
                    imageUrl: String(cell(row, ['image url', 'imageurl', 'image'])).trim(),
                });
            });

            setParsedProducts(nextProducts);
            setErrors(rowErrors);
            if (nextProducts.length === 0 && rowErrors.length === 0) setErrors(['No valid product rows were found.']);
        } catch (error) {
            setErrors([error instanceof Error ? error.message : 'Unable to read this spreadsheet.']);
        }
    };

    const importProducts = async () => {
        if (parsedProducts.length === 0) return;
        setImporting(true);
        setSuccess('');
        try {
            const imported = await dispatch(importProductsApi(parsedProducts)).unwrap();
            setSuccess(`${imported.length} products have been added to inventory.`);
            setParsedProducts([]);
            setFileName('');
            if (inputRef.current) inputRef.current.value = '';
        } catch (error) {
            setErrors([typeof error === 'string' ? error : 'Unable to import products. Please check the file and try again.']);
        } finally {
            setImporting(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 950, mx: 'auto' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                <Button color="inherit" startIcon={<ChevronLeft size={19} />} onClick={() => navigate('/inventory')}>Inventory</Button>
                <Typography variant="h4" fontWeight={800}>Import Products</Typography>
            </Stack>
            <Card sx={{ borderRadius: 4 }}>
                <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ sm: 'center' }}>
                        <Box>
                            <Typography variant="h6" fontWeight={800}>Upload an Excel file</Typography>
                            <Typography color="text.secondary">Use the template for .xlsx, .xls, or .csv files. Maximum 500 products per import.</Typography>
                        </Box>
                        <Button variant="outlined" startIcon={<Download size={18} />} onClick={downloadTemplate}>Download template</Button>
                    </Stack>
                    <Divider sx={{ my: 3 }} />
                    <input ref={inputRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0])} />
                    <Button fullWidth variant="contained" size="large" startIcon={<Upload size={20} />} onClick={() => inputRef.current?.click()} sx={{ py: 2 }}>
                        Choose Excel or CSV file
                    </Button>
                    {fileName && <Chip icon={<FileSpreadsheet size={16} />} label={fileName} sx={{ mt: 2 }} />}
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
                        Required columns: SKU, Name, Purchase Price, Sale Price, Stock. Category defaults to General, Min Stock defaults to 5, and Unit Code defaults to piece.
                    </Typography>
                </CardContent>
            </Card>

            {errors.length > 0 && <Alert severity="error" sx={{ mt: 2, borderRadius: 3 }}><Typography fontWeight={700}>Please fix these rows:</Typography><List dense>{errors.slice(0, 10).map((error) => <ListItem key={error} disableGutters><ListItemText primary={error} /></ListItem>)}</List>{errors.length > 10 && `And ${errors.length - 10} more errors.`}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 2, borderRadius: 3 }}>{success}</Alert>}
            {parsedProducts.length > 0 && (
                <Card sx={{ mt: 2, borderRadius: 4 }}>
                    <CardContent>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
                            <Box><Typography variant="h6" fontWeight={800}>{parsedProducts.length} products ready to import</Typography><Typography color="text.secondary">All displayed rows have passed local validation.</Typography></Box>
                            <Button variant="contained" disabled={importing || errors.length > 0} onClick={importProducts} startIcon={importing ? <CircularProgress size={18} color="inherit" /> : <Upload size={18} />}>{importing ? 'Importing…' : `Import ${parsedProducts.length} products`}</Button>
                        </Stack>
                    </CardContent>
                </Card>
            )}
        </Box>
    );
};

export default ImportProducts;
