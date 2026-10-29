import mongoose, { Schema } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export interface InventoryVendor { id: string; name: string; phone: string; cnic?: string; address: string; version?: number; archived?: boolean }
const schema = new Schema({
    businessId: { type: Schema.Types.ObjectId, required: true },
    vendors: [{ id: String, name: String, phone: String, cnic: { type: String, default: '' }, address: String, version: { type: Number, default: 0 }, archived: { type: Boolean, default: false }, _id: false }],
}, { timestamps: true });

// One vendor list per branch.
schema.index({ businessId: 1, branchId: 1 }, { unique: true });
schema.plugin(branchScopedPlugin);
export default mongoose.model('InventoryVendors', schema);
