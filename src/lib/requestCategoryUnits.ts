export interface RequestCategoryUnits { name: string; units: string[] }
export interface RequestCategoryUnitsResponse { categories: RequestCategoryUnits[]; unitOptions: string[] }

export function unitForCategory(category: RequestCategoryUnits | undefined, currentUnit = '') {
    if (!category) return '';
    if (category.units.length === 1) return category.units[0];
    return category.units.includes(currentUnit) ? currentUnit : '';
}
