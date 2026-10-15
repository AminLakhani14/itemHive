import mongoose, { Schema } from 'mongoose';

export interface InventoryVendor { id: string; name: string; phone: string; cnic?: string; address: string; version?: number; archived?: boolean }
const schema = new Schema({
    businessId: { type: Schema.Types.ObjectId, required: true, unique: true },
    vendors: [{ id: String, name: String, phone: String, cnic: { type: String, default: '' }, address: String, version: { type: Number, default: 0 }, archived: { type: Boolean, default: false }, _id: false }],
}, { timestamps: true });

export default mongoose.model('InventoryVendors', schema);
