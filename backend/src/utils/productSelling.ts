export interface SizeData { id: string; size: number | string; purchasePrice: number; salePrice: number; stock: number }
export interface SellingProduct { name: string; stock: number; salePrice?: number; price?: number; purchasePrice: number; unitSizeEnabled?: boolean; sellingType?: string; productUnitCode?: string; productUnit?: string; sizes?: SizeData[] }

export function validateSellingProduct(product: SellingProduct) {
    if (!product.unitSizeEnabled) return;
    if (!product.productUnitCode || !product.productUnit?.trim() || (product.productUnitCode === 'other' && product.productUnit === 'Other')) throw new Error('Unit and unit name are required');
    if (!['quantity', 'fixed'].includes(product.sellingType || '')) throw new Error('Selling type is required');
    if (product.sellingType === 'quantity' && Number.isFinite(product.stock)) product.stock = Number(product.stock.toPrecision(15));
    if (product.sellingType === 'fixed') {
        const sizes = product.sizes || [];
        for (const row of sizes) {
            if (typeof row.size === 'string') row.size = row.size.trim();
            row.purchasePrice ??= 0; row.salePrice ??= 0; row.stock ??= 0;
        }
        if (!sizes.length || sizes.some(row => !row.id || (typeof row.size === 'number' ? !Number.isFinite(row.size) || row.size <= 0 : typeof row.size !== 'string' || !row.size.trim()) || !Number.isFinite(row.purchasePrice) || row.purchasePrice < 0 || !Number.isFinite(row.salePrice) || row.salePrice < 0 || !Number.isInteger(row.stock) || row.stock < 0)) throw new Error('At least one complete size / variant with valid prices and whole pack stock is required');
        if (new Set(sizes.map(row => String(row.size).trim().toLowerCase())).size !== sizes.length || new Set(sizes.map(row => row.id)).size !== sizes.length) throw new Error('Variants and IDs must be unique');
        product.stock = sizes.reduce((sum, row) => sum + row.stock, 0);
        product.purchasePrice = sizes[0].purchasePrice;
        product.salePrice = sizes[0].salePrice;
        product.price = sizes[0].salePrice;
    }
}

export function resolveSellingLine(product: SellingProduct, quantity: number, sizeId?: string) {
    const fixed = product.unitSizeEnabled && product.sellingType === 'fixed';
    const fractional = product.unitSizeEnabled && product.sellingType === 'quantity';
    if (!Number.isFinite(quantity) || quantity <= 0 || (!fractional && !Number.isInteger(quantity))) throw new Error(`Invalid quantity for ${product.name}`);
    const size = fixed ? product.sizes?.find(row => row.id === sizeId) : undefined;
    if ((fixed && !size) || (!fixed && sizeId)) throw new Error(`Invalid size for ${product.name}`);
    const stock = size?.stock ?? product.stock;
    if (quantity > stock) throw new Error(`Insufficient stock for ${product.name}`);
    const name = !product.unitSizeEnabled ? product.name : size ? `${product.name} — ${size.size}${typeof size.size === 'number' ? ` ${product.productUnit}` : ''} × ${quantity}` : `${product.name} — ${quantity} ${product.productUnit}`;
    return { size, name, unitPrice: Number(size?.salePrice ?? product.salePrice ?? product.price ?? 0), unitCost: Number(size?.purchasePrice ?? product.purchasePrice ?? 0) };
}
