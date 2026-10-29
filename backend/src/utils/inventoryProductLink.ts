import type { IProduct } from '../models/Product';

const aliases: Record<string, string> = {
    piece: 'pcs', pieces: 'pcs', pc: 'pcs', pcs: 'pcs', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
    gram: 'g', grams: 'g', g: 'g', litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', l: 'litre',
    millilitre: 'ml', milliliter: 'ml', ml: 'ml', pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', pkt: 'pack',
};
export const stockUnitKey = (value: string) => aliases[value.trim().toLowerCase()] || value.trim().toLowerCase();

export function validateInventoryProductLink(product: Pick<IProduct, 'name' | 'unitSizeEnabled' | 'sellingType' | 'productUnit' | 'sizes'>, item: { unit?: string; sizeId?: string; quantity: number }) {
    const fixed = product.unitSizeEnabled && product.sellingType === 'fixed';
    const size = fixed ? product.sizes?.find(size => size.id === item.sizeId) : undefined;
    if ((fixed && !size) || (!fixed && item.sizeId)) throw new Error(`Select a valid variant for ${product.name}.`);
    const unit = fixed ? 'Pack' : product.productUnit || 'Piece';
    if (item.unit && stockUnitKey(item.unit) !== stockUnitKey(unit)) throw new Error(`Unit does not match ${product.name}. Use ${unit}; one ordered unit must equal one stock unit.`);
    if (!(product.unitSizeEnabled && product.sellingType === 'quantity') && !Number.isInteger(item.quantity)) throw new Error(`Use whole quantities for ${product.name}.`);
    return { fixed, size, unit, productName: size ? `${product.name} (${size.size})` : product.name };
}
