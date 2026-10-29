import { Autocomplete, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { Product } from '../../features/inventory/inventorySlice';
import { linkedProductUnit } from '../../lib/inventoryProductLinks';

export default function InventoryProductLink({ products, loading, disabled, productId, sizeId, onChange }: {
    products: Product[]; loading: boolean; disabled?: boolean; productId?: string; sizeId?: string;
    onChange: (productId: string, sizeId: string) => void;
}) {
    const product = products.find(product => product.id === productId);
    return <Stack spacing={1.5}>
        <Autocomplete size="small" disabled={disabled} options={products} loading={loading} value={product || null} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={product => `${product.name} (${product.sku})`} onChange={(_, value) => onChange(value?.id || '', '')} renderInput={params => <TextField {...params} label="Link to Product (optional)" helperText={product ? `Stock unit: ${linkedProductUnit(product)}. Each newly received unit adds one unit to this product.` : productId ? `Linked product ${productId} is unavailable. Reload products or clear this link.` : 'Leave empty to keep an order and receiving record without updating POS stock.'} />} />
        {productId && !product && <Box><Typography component="button" type="button" disabled={disabled} onClick={() => onChange('', '')} sx={{ border: 0, bgcolor: 'transparent', color: 'primary.main', cursor: 'pointer' }}>Remove unavailable product link</Typography></Box>}
        {product?.unitSizeEnabled && product.sellingType === 'fixed' && <TextField select size="small" fullWidth required disabled={disabled} label="Product variant" value={sizeId || ''} onChange={event => onChange(productId || '', event.target.value)}>{product.sizes?.map(size => <MenuItem key={size.id} value={size.id}>{size.size} ({size.stock} in stock)</MenuItem>)}</TextField>}
    </Stack>;
}
