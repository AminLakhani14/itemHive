export interface RequestCategoryUnits { name: string; units: string[] }

export const REQUEST_UNIT_OPTIONS = ['kg', 'g', 'litre', 'ml', 'pcs', 'dozen', 'packet', 'box', 'carton', 'bottle', 'sack', 'crate', 'tray', 'roll', 'meter'];
export const REQUEST_CATEGORY_DEFAULTS: RequestCategoryUnits[] = [
    { name: 'Chicken / Meat', units: ['kg', 'g'] },
    { name: 'Buns / Bread', units: ['pcs', 'dozen', 'packet'] },
    { name: 'Oil / Drinks', units: ['litre', 'ml', 'bottle', 'carton'] },
    { name: 'Vegetables / Fruit', units: ['kg', 'g', 'pcs', 'crate'] },
    { name: 'Dairy', units: ['litre', 'ml', 'kg', 'g', 'packet'] },
    { name: 'Flour / Rice / Grains', units: ['kg', 'g', 'sack'] },
    { name: 'Spices / Sauces', units: ['g', 'kg', 'packet', 'bottle'] },
    { name: 'Eggs', units: ['pcs', 'dozen', 'tray'] },
    { name: 'Packaging', units: ['pcs', 'packet', 'box', 'carton', 'roll'] },
    { name: 'Cleaning Supplies', units: ['pcs', 'litre', 'ml', 'bottle', 'packet'] },
    { name: 'Other', units: REQUEST_UNIT_OPTIONS },
];

export function normalizeRequestUnits(input: unknown): string[] {
    if (!Array.isArray(input) || !input.length || input.length > 30 || input.some(unit => typeof unit !== 'string' || !unit.trim() || unit.trim().length > 80)) {
        throw new Error('Choose between 1 and 30 units, each up to 80 characters.');
    }
    const units = new Map<string, string>();
    input.forEach(unit => { const name = unit.trim().replace(/\s+/g, ' '); units.set(name.toLowerCase(), name); });
    return [...units.values()];
}

export function mergeRequestCategories(saved: { name: string; normalizedName: string; archived?: boolean; requestUnits?: string[] | null }[], existing: string[] = []): RequestCategoryUnits[] {
    const categories = new Map(REQUEST_CATEGORY_DEFAULTS.map(category => [category.name.toLowerCase(), { ...category, units: [...category.units] }]));
    existing.forEach(name => { if (!categories.has(name.toLowerCase())) categories.set(name.toLowerCase(), { name, units: [...REQUEST_UNIT_OPTIONS] }); });
    saved.forEach(category => {
        if (category.archived) categories.delete(category.normalizedName);
        else categories.set(category.normalizedName, { name: category.name, units: category.requestUnits?.length ? category.requestUnits : categories.get(category.normalizedName)?.units || [...REQUEST_UNIT_OPTIONS] });
    });
    return [...categories.values()];
}
