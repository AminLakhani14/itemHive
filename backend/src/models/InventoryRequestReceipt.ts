import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
    requestId: { type: Schema.Types.ObjectId, ref: 'InventoryRequest', required: true, index: true },
    businessId: { type: Schema.Types.ObjectId, required: true, index: true },
    kind: { type: String, enum: ['delivery', 'opening_balance'], default: 'delivery' },
    occurredAt: Date,
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receivedByName: String,
    reference: { type: String, default: '' },
    note: { type: String, default: '' },
    deliveryStatus: String,
    items: [{
        itemIndex: Number, name: String, vendorId: String, vendorName: String, unit: String,
        orderedQuantity: Number, quantity: Number, totalReceived: Number, remaining: Number,
        productId: String, productName: String, sku: String, sizeId: String,
        stockAction: { type: String, enum: ['product_updated', 'record_only', 'previously_recorded'] }, _id: false,
    }],
}, { timestamps: true });
schema.index({ businessId: 1, requestId: 1, createdAt: 1 });

export default mongoose.model('InventoryRequestReceipt', schema);
