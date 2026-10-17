import mongoose, { Schema } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

// Procurement materials are independent of the products sold at the POS.
const schema = new Schema({
    businessId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    nameKey: { type: String, required: true },
    unitKey: { type: String, required: true },
    stock: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
schema.index({ businessId: 1, branchId: 1, nameKey: 1, unitKey: 1 }, { unique: true });

export const materialKey = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
schema.plugin(branchScopedPlugin);
export default mongoose.model('InventoryMaterial', schema);
