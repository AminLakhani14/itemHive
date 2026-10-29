import mongoose, { Schema } from 'mongoose';

export interface BusinessTypeOption {
    id: string;
    name: string;
    restaurantEnabled: boolean;
    productFields?: string[];
}

export const DEFAULT_BUSINESS_TYPES: BusinessTypeOption[] = [
    { id: 'restaurant', name: 'Restaurant / KOT', restaurantEnabled: true },
    { id: 'stationery', name: 'Stationery', restaurantEnabled: false },
    { id: 'super-mart', name: 'Super Mart', restaurantEnabled: false },
    { id: 'pharmacy', name: 'Pharmacy', restaurantEnabled: false, productFields: ['unitSize', 'supplier', 'batchNumber', 'expiryDate'] },
    { id: 'other', name: 'Other', restaurantEnabled: false },
];

const optionSchema = new Schema<BusinessTypeOption>({
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    restaurantEnabled: { type: Boolean, default: false },
    productFields: { type: [String], enum: ['unitSize', 'supplier', 'batchNumber', 'expiryDate'], default: undefined },
}, { _id: false });

const catalogSchema = new Schema({
    key: { type: String, required: true, unique: true },
    types: { type: [optionSchema], default: () => DEFAULT_BUSINESS_TYPES },
    clientTypesInitialized: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('BusinessTypeCatalog', catalogSchema);
