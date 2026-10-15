import { type SizeData } from '../utils/productSelling';
import mongoose, { Schema, Document } from 'mongoose';

export interface IInventoryRequestProductData {
    unitSizeEnabled?: boolean;
    sellingType?: string;
    sizes?: SizeData[];
    id: string;
    sku: string;
    name: string;
    category: string;
    purchasePrice: number;
    salePrice: number;
    price: number;
    stock: number;
    minStock: number;
    productUnitCode?: string;
    productUnit?: string;
    productUnitUrdu?: string;
    description?: string;
    imageUrl?: string;
    batchNumber?: string;
    expiryDate?: string;
    supplier?: string;
}

export interface IInventoryRequest extends Document {
    requestType?: 'product' | 'restock';
    vendors: { id: string; name: string; phone: string; cnic?: string; address: string }[];
    items: { productId?: string; productName?: string; name: string; category?: string; sku?: string; quantity: number; receivedQuantity?: number; sizeId?: string; unit: string; vendorId: string; remarks: string }[];
    receiptHistoryStarted?: boolean;
    deliveryStatus?: 'not_received' | 'partial' | 'complete';
    receivedByName?: string;
    receivedAt?: Date;
    requestedBy: mongoose.Types.ObjectId;
    requestedByName: string;
    requestedByEmail: string;
    status: 'pending' | 'approved' | 'rejected';
    productData: IInventoryRequestProductData;
    decisionNote?: string;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedByName?: string;
    approvedProductId?: string;
    businessId?: mongoose.Types.ObjectId;
}

const InventoryRequestSchema = new Schema<IInventoryRequest>({
    requestType: { type: String, enum: ['product', 'restock'], default: 'product' },
    vendors: [{ id: String, name: String, phone: String, cnic: { type: String, default: '' }, address: String, _id: false }],
    items: [{ productId: String, productName: String, name: String, category: String, sku: String, sizeId: String, quantity: { type: Number, min: 0 }, receivedQuantity: { type: Number, min: 0, default: 0 }, unit: String, vendorId: String, remarks: String, _id: false }],
    receiptHistoryStarted: { type: Boolean, default: false },
    deliveryStatus: { type: String, enum: ['not_received', 'partial', 'complete'], default: 'not_received' },
    receivedByName: String,
    receivedAt: Date,
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedByName: { type: String, required: true },
    requestedByEmail: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    productData: { type: new Schema({
        unitSizeEnabled: { type: Boolean, default: false },
        sellingType: { type: String, default: '' },
        sizes: [{ id: String, size: Schema.Types.Mixed, purchasePrice: { type: Number, default: 0 }, salePrice: { type: Number, default: 0 }, stock: { type: Number, default: 0 }, _id: false }],
        id: { type: String, required: true },
        sku: { type: String, required: true },
        name: { type: String, required: true },
        category: { type: String, required: true },
        purchasePrice: { type: Number, required: true, min: 0 },
        salePrice: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 },
        stock: { type: Number, required: true, min: 0 },
        minStock: { type: Number, required: true, min: 0 },
        productUnitCode: { type: String, default: 'piece' },
        productUnit: { type: String, default: 'Piece' },
        productUnitUrdu: { type: String, default: 'عدد' },
        description: { type: String, default: '' },
        imageUrl: { type: String, default: '' },
        batchNumber: { type: String, default: '' },
        expiryDate: { type: String, default: '' },
        supplier: { type: String, default: '' },
    }, { _id: false }), required: function () { return this.requestType !== 'restock'; } },
    decisionNote: { type: String, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    approvedProductId: { type: String, default: '' },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
}, { timestamps: true });

InventoryRequestSchema.index({ businessId: 1, requestType: 1, 'items.vendorId': 1, createdAt: -1 });

export default mongoose.model<IInventoryRequest>('InventoryRequest', InventoryRequestSchema);
