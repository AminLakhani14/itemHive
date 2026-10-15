import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    archived: { type: Boolean, default: false },
    normalizedName: { type: String, required: true },
    requestUnits: { type: [String], default: undefined },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
}, { timestamps: true });
schema.index({ businessId: 1, normalizedName: 1 }, { unique: true });
export default mongoose.model('Category', schema);
