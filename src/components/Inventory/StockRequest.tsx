import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, alpha, Box, Button, Chip, Grid, IconButton, MenuItem, Stack, TextField, Typography, useTheme } from '@mui/material';
import { ChevronDown, PackagePlus, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import api from '../../api/axios';
import InventoryVendorPicker from './InventoryVendorPicker';
import { Link } from 'react-router-dom';
import type { RequestVendor } from '../../lib/inventoryRequestExports';
import { unitForCategory, type RequestCategoryUnits, type RequestCategoryUnitsResponse } from '../../lib/requestCategoryUnits';
import { hasScreenAccess } from '../../lib/screenPermissions';
import RequestCategoryUnitsDialog from '../Settings/RequestCategoryUnitsDialog';
import InventoryProductLink from './InventoryProductLink';
import useInventoryRequestProducts from '../../hooks/useInventoryRequestProducts';
import { linkedProductUnit, productLinkError, stockUnitKey } from '../../lib/inventoryProductLinks';

type DraftItem = { id: string; name: string; category: string; unit: string; quantity: string; vendorId: string; vendor: RequestVendor | null; remarks: string; productId: string; sizeId: string };
const newItem = (): DraftItem => ({ id: crypto.randomUUID(), name: '', category: '', unit: '', quantity: '', vendorId: '', vendor: null, remarks: '', productId: '', sizeId: '' });
const message = (error: unknown) => {
    const data = (error as { response?: { data?: { message?: string; details?: string } } }).response?.data;
    return data?.details || data?.message || 'Unable to save. Please retry.';
};

export function StockRequestForm({ onSaved }: { onSaved: () => void }) {
    const theme = useTheme();
    const productOptions = useInventoryRequestProducts();
    const user = useSelector((state: RootState) => state.auth.user);
    const canManageUnits = (user?.role === 'admin' || user?.role === 'super_admin') && hasScreenAccess(user, 'inventory_categories');
    const [categories, setCategories] = React.useState<RequestCategoryUnits[]>([]);
    const [categoriesLoading, setCategoriesLoading] = React.useState(true);
    const [categoryError, setCategoryError] = React.useState('');
    const [unitsOpen, setUnitsOpen] = React.useState(false);
    const [items, setItems] = React.useState<DraftItem[]>([newItem()]);
    const [error, setError] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [stockOpen, setStockOpen] = React.useState(false);
    const loadCategories = React.useCallback(async () => {
        setCategoriesLoading(true); setCategoryError('');
        try {
            const { data } = await api.get<RequestCategoryUnitsResponse>('/categories/request-units');
            setCategories(data.categories);
            setItems(current => current.map(item => ({ ...item, unit: unitForCategory(data.categories.find(category => category.name === item.category), item.unit) })));
        } catch { setCategoryError('Unable to load category units. Please reload.'); }
        finally { setCategoriesLoading(false); }
    }, []);
    React.useEffect(() => {
        void loadCategories();
        const reload = () => { void loadCategories(); };
        window.addEventListener('itemhive-category-units-changed', reload);
        return () => window.removeEventListener('itemhive-category-units-changed', reload);
    }, [loadCategories]);
    const changeItem = (id: string, update: Partial<DraftItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...update } : item));
    const saveStock = async (event: React.FormEvent) => {
        event.preventDefault(); setError('');
        if (items.some(item => !item.name.trim() || !categories.find(category => category.name === item.category)?.units.includes(item.unit) || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || Number(item.quantity) > 1e9 || (!item.vendor || item.vendor.id !== item.vendorId || item.vendor.archived))) {
            setError('Enter an item name, category, allowed unit, positive quantity and a saved vendor for every row.'); return;
        }
        for (const item of items) {
            const linkError = productLinkError(productOptions.products.find(product => product.id === item.productId), { ...item, quantity: Number(item.quantity) });
            if (linkError) { setError(`${item.name}: ${linkError}`); return; }
        }
        setSaving(true);
        try {
            const usedVendors = [...new Map(items.flatMap(item => item.vendor ? [[item.vendor.id, item.vendor] as const] : [])).values()];
            await api.post('/inventory-requests/restock', { vendors: usedVendors, items: items.map(({ name, category, unit, quantity, vendorId, remarks, productId, sizeId }) => ({ name: name.trim(), category, unit, quantity: Number(quantity), vendorId, remarks, ...(productId ? { productId, sizeId } : {}) })) });
            setItems([newItem()]); onSaved();
        } catch (failure) { setError(message(failure)); }
        finally { setSaving(false); }
    };
    const accordionSx = {
        border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.2), borderRadius: '16px !important',
        bgcolor: 'background.paper', overflow: 'hidden', '&::before': { display: 'none' }, '&.Mui-expanded': { m: 0 },
    };
    const summarySx = { px: { xs: 2, sm: 2.5 }, minHeight: 82, '& .MuiAccordionSummary-expandIconWrapper': { p: 0.7, borderRadius: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main' } };
    const rowSx = { p: { xs: 1.5, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.main, 0.025) };
    const sectionTitle = () => <Stack direction="row" alignItems="center" spacing={1.5} sx={{ pr: 1 }}>
        <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: { xs: 'none', sm: 'flex' } }}><PackagePlus size={22} /></Box>
        <Box><Stack direction="row" alignItems="center" spacing={1}><Typography variant="h6" fontWeight={800}>Stock Required</Typography><Chip size="small" label={`${items.length} items`} /></Stack><Typography variant="body2" color="text.secondary">Create an order using your saved vendors.</Typography></Box>
    </Stack>;

    return <Box sx={{ display: 'grid', gap: 2.5, mb: 4 }}>
        {unitsOpen && <RequestCategoryUnitsDialog onClose={() => setUnitsOpen(false)} />}
        <Accordion expanded={stockOpen} onChange={(_, value) => setStockOpen(value)} disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />} sx={summarySx} aria-controls="request-stock-content" id="request-stock-header">{sectionTitle()}</AccordionSummary>
            <AccordionDetails sx={{ px: { xs: 2, sm: 2.5 }, pb: 2.5 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {categoryError && <Alert severity="error" action={<Button onClick={() => void loadCategories()}>Reload</Button>} sx={{ mb: 2 }}>{categoryError}</Alert>}
                {productOptions.error && <Alert severity="warning" action={<Button onClick={() => void productOptions.reload()}>Retry</Button>} sx={{ mb: 2 }}>{productOptions.error}</Alert>}
                <Button component={Link} to="/vendors" sx={{ mb: 2, mr: 1 }}>Manage Vendors</Button>{canManageUnits && <Button startIcon={<Settings2 size={16} />} sx={{ mb: 2 }} onClick={() => setUnitsOpen(true)}>Manage Category Units</Button>}
                <Box component="form" onSubmit={saveStock}><Box component="fieldset" disabled={saving} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                    <Stack spacing={1.5}>{items.map((item, index) => {
                        return <Box key={item.id} sx={rowSx}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Typography variant="subtitle2" fontWeight={700}>Item {index + 1}</Typography><IconButton size="small" disabled={items.length === 1} aria-label={`Remove item ${index + 1}`} onClick={() => setItems(current => current.filter(row => row.id !== item.id))}><Trash2 size={16} /></IconButton></Stack>
                            <Grid container spacing={1.5}>
                                <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth required size="small" label="Item / Raw Material Name" placeholder="e.g. Burger buns, chicken, packaging" value={item.name} onChange={event => changeItem(item.id, { name: event.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} /></Grid>
                                <Grid size={{ xs: 12, md: 6 }}><TextField select fullWidth required size="small" label="Category" value={categories.some(category => category.name === item.category) ? item.category : ''} disabled={categoriesLoading || Boolean(categoryError)} onChange={event => {
                                    const category = categories.find(category => category.name === event.target.value);
                                    const product = productOptions.products.find(product => product.id === item.productId);
                                    const matchingUnit = product ? category?.units.find(unit => stockUnitKey(unit) === stockUnitKey(linkedProductUnit(product))) : undefined;
                                    changeItem(item.id, { category: event.target.value, unit: matchingUnit || unitForCategory(category, item.unit) });
                                }}>{categories.map(category => <MenuItem key={category.name} value={category.name}>{category.name}</MenuItem>)}</TextField></Grid>
                                <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth required size="small" type="number" label="Required quantity" value={item.quantity} onChange={event => changeItem(item.id, { quantity: event.target.value })} slotProps={{ htmlInput: { min: 0.000001, max: 1e9, step: 'any' } }} /></Grid>
                                <Grid size={{ xs: 6, md: 4 }}><TextField select fullWidth required size="small" label="Unit" value={item.unit} disabled={!item.category || categoriesLoading || Boolean(categoryError)} onChange={event => changeItem(item.id, { unit: event.target.value })}>{(categories.find(category => category.name === item.category)?.units || []).map(unit => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}</TextField></Grid>
                                <Grid size={{ xs: 12, md: 6 }}><InventoryVendorPicker value={item.vendor} required disabled={saving} onChange={vendor => changeItem(item.id, { vendor, vendorId: vendor?.id || '' })} /></Grid>
                                <Grid size={{ xs: 12 }}><InventoryProductLink products={productOptions.products} loading={productOptions.loading} productId={item.productId} sizeId={item.sizeId} onChange={(productId, sizeId) => {
                                    const product = productOptions.products.find(product => product.id === productId);
                                    const matchingUnit = product ? categories.find(category => category.name === item.category)?.units.find(unit => stockUnitKey(unit) === stockUnitKey(linkedProductUnit(product))) : undefined;
                                    changeItem(item.id, { productId, sizeId, ...(matchingUnit ? { unit: matchingUnit } : {}) });
                                }} /></Grid>
                                <Grid size={{ xs: 12 }}><TextField fullWidth size="small" label="Remarks (optional)" value={item.remarks} onChange={event => changeItem(item.id, { remarks: event.target.value })} slotProps={{ htmlInput: { maxLength: 600 } }} /></Grid>
                            </Grid>
                        </Box>;
                    })}</Stack>
                    <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mt: 2 }}><Button startIcon={<Plus size={16} />} disabled={items.length >= 200} onClick={() => setItems(current => [...current, newItem()])}>Add Item</Button><Button type="submit" variant="contained" startIcon={<Save size={16} />} disabled={items.some(item => !item.vendorId) || categoriesLoading || Boolean(categoryError)}>{saving ? 'Saving...' : 'Save Stock Request'}</Button></Stack>
                </Box></Box>
            </AccordionDetails>
        </Accordion>
    </Box>;
}
