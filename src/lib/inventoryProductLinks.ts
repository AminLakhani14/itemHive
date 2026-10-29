import type { Product } from '../features/inventory/inventorySlice';

const aliases: Record<string, string> = { piece: 'pcs', pieces: 'pcs', pc: 'pcs', pcs: 'pcs', kilogram: 'kg', kilograms: 'kg', kg: 'kg', gram: 'g', grams: 'g', g: 'g', litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', l: 'litre', millilitre: 'ml', milliliter: 'ml', ml: 'ml', pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', pkt: 'pack' };
export const stockUnitKey = (value: string) => aliases[value.trim().toLowerCase()] || value.trim().toLowerCase();
export const linkedProductUnit = (product: Product) => product.unitSizeEnabled && product.sellingType === 'fixed' ? 'Pack' : product.productUnit || 'Piece';

export function productLinkError(product: Product | undefined, item: { productId?: string; sizeId?: string; unit: string; quantity: number }) {
    if (!item.productId) return '';
    if (!product) return 'Linked product is unavailable. Reload products or remove the link.';
    const fixed = product.unitSizeEnabled && product.sellingType === 'fixed';
    if (fixed && !product.sizes?.some(size => size.id === item.sizeId)) return 'Choose a product variant.';
    if (stockUnitKey(item.unit) !== stockUnitKey(linkedProductUnit(product))) return `Choose a unit matching the product stock unit (${linkedProductUnit(product)}).`;
    if (!(product.unitSizeEnabled && product.sellingType === 'quantity') && !Number.isInteger(item.quantity)) return 'This product requires whole quantities.';
    return '';
}
