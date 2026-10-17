import type { Product } from '../features/inventory/inventorySlice';
import type { CartItem } from '../features/pos/posSlice';

export const emptySellingDetails: Pick<Product, 'unitSizeEnabled' | 'sellingType' | 'productUnitCode' | 'productUnit' | 'sizes'> = { unitSizeEnabled: false, sellingType: '', productUnitCode: 'piece', productUnit: 'Piece', sizes: [] };

export const isFixedProduct = (product: Pick<Partial<Product>, 'unitSizeEnabled' | 'sellingType' | 'productUnitCode' | 'productUnit' | 'sizes'>) => product.unitSizeEnabled && product.sellingType === 'fixed';
export function sellingPayload<T extends Partial<Product>>(product: T): T {
    if (!isFixedProduct(product)) return { ...product, sizes: [] };
    const sizes = (product.sizes || []).map(row => ({ ...row, size: typeof row.size === 'string' ? row.size.trim() : row.size }));
    return { ...product, sizes, purchasePrice: sizes[0]?.purchasePrice ?? 0, salePrice: sizes[0]?.salePrice ?? 0, price: sizes[0]?.salePrice ?? 0, stock: sizes.reduce((sum, row) => sum + row.stock, 0) };
}
export function sellingError(product: Pick<Partial<Product>, 'unitSizeEnabled' | 'sellingType' | 'productUnitCode' | 'productUnit' | 'sizes'>): string {
    if (!product.unitSizeEnabled) return '';
    if (!product.productUnitCode || !product.productUnit?.trim() || (product.productUnitCode === 'other' && product.productUnit === 'Other')) return 'Select a unit and enter its name.';
    if (!['quantity', 'fixed'].includes(product.sellingType || '')) return 'Select a selling type.';
    if (isFixedProduct(product)) {
        const sizes = product.sizes || [];
        if (!sizes.length || sizes.some(row => (typeof row.size === 'number' ? !Number.isFinite(row.size) || row.size <= 0 : !row.size.trim()) || !Number.isFinite(row.purchasePrice) || row.purchasePrice < 0 || !Number.isFinite(row.salePrice) || row.salePrice < 0 || !Number.isInteger(row.stock) || row.stock < 0)) return 'Enter a variant for each row. Prices must be nonnegative and stock must be a whole number.';
        if (new Set(sizes.map(row => String(row.size).trim().toLowerCase())).size !== sizes.length) return 'Each variant must be unique.';
    }
    return '';
}
export function verifySavedSellingDetails(requested: Product, saved: Product): Product {
    if (!requested.unitSizeEnabled) return saved;
    const matchesSizes = !isFixedProduct(requested) || (saved.sizes?.length === requested.sizes?.length && requested.sizes?.every(size => {
        const savedSize = saved.sizes?.find(row => row.id === size.id);
        return savedSize && (['size', 'purchasePrice', 'salePrice', 'stock'] as const).every(field => savedSize[field] === size[field]);
    }));
    if (!saved.unitSizeEnabled || saved.sellingType !== requested.sellingType || saved.productUnitCode !== requested.productUnitCode || saved.productUnit?.trim() !== requested.productUnit?.trim() || !matchesSizes) {
        throw new Error('The server did not save the product unit/size details. Reload the updated backend and save the product again.');
    }
    return saved;
}
export const cartLineId = (productId: string, sizeId?: string) => sizeId ? `${productId}::${sizeId}` : productId;
export const cartDescription = (item: CartItem) => !item.unitSizeEnabled ? item.name : item.sizeId ? `${item.name} — ${item.selectedSize}${typeof item.selectedSize === 'number' ? ` ${item.productUnit}` : ''} × ${item.quantity}` : `${item.name} — ${item.quantity} ${item.productUnit}`;
export function productForCart(product: Product, sizeId?: string): Product & { productId: string; sizeId?: string; selectedSize?: number | string } {
    if (!isFixedProduct(product) && sizeId) throw new Error(`The selling type has changed for ${product.name}`);
    const size = sizeId ? product.sizes?.find(row => row.id === sizeId) : undefined;
    if (isFixedProduct(product) && !size) throw new Error(`Select an available size for ${product.name}`);
    return { ...product, id: cartLineId(product.id, sizeId), productId: product.id, sizeId, selectedSize: size?.size, ...(size ? { price: size.salePrice, salePrice: size.salePrice, purchasePrice: size.purchasePrice, stock: size.stock } : {}) };
}
