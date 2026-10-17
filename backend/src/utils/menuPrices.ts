export type MenuPrices = Record<string, number>;

export const parseMenuPrices = (value: unknown, productIds: string[]): MenuPrices | undefined | null => {
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const allowed = new Set(productIds);
    const entries = Object.entries(value);
    if (entries.length > 1000 || entries.some(([id, price]) => !allowed.has(id) || typeof price !== 'number' || !Number.isFinite(price) || price < 0 || !Number.isFinite(price * 100))) return null;
    return Object.fromEntries(entries.map(([id, price]) => [id, Math.round(price * 100) / 100]));
};

export const menuItemPrice = (product: { id: string; salePrice?: number; price?: number }, prices?: MenuPrices): number =>
    prices && Object.hasOwn(prices, product.id) ? prices[product.id] : Number(product.salePrice ?? product.price ?? 0);
