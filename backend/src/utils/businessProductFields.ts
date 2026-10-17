export const PRODUCT_FIELDS = ['unitSize', 'supplier', 'batchNumber', 'expiryDate'] as const;
export type BusinessProductField = typeof PRODUCT_FIELDS[number];

export const businessProductFields = (type?: { id: string; productFields?: string[] }) => {
    if (type?.productFields) return type.productFields;
    if (type?.id === 'super-mart') return [...PRODUCT_FIELDS];
    if (type?.id === 'stationery') return ['unitSize', 'supplier'];
    return ['unitSize'];
};
