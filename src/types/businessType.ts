export interface BusinessType {
    id: string;
    name: string;
    restaurantEnabled: boolean;
    businessCount: number;
    productFields?: BusinessProductField[];
}

export type BusinessProductField = 'unitSize' | 'supplier' | 'batchNumber' | 'expiryDate';
export const BUSINESS_PRODUCT_FIELDS: Array<{ key: BusinessProductField; label: string }> = [
    { key: 'unitSize', label: 'Units / sizes / packs' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'batchNumber', label: 'Batch number' },
    { key: 'expiryDate', label: 'Expiry date' },
];
