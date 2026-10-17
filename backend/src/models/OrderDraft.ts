import mongoose, { Document, Schema } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export interface IOrderDraftItem {
    sizeId?: string;
    selectedSize?: number | string;
    productUnit?: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
}

export interface IOrderDraft extends Document {
    salespersonEmployeeId?: mongoose.Types.ObjectId;
    draftCode: string;
    items: IOrderDraftItem[];
    discountPercent: number;
    orderType?: string;
    otherOrderType?: string;
    deliveryNumber?: string;
    digitalMenuTable?: string;
    createdBy: mongoose.Types.ObjectId;
    createdByName: string;
    businessId?: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

const OrderDraftSchema = new Schema<IOrderDraft>({
    salespersonEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    draftCode: { type: String, required: true, trim: true },
    items: [{
        sizeId: { type: String, default: '' },
        selectedSize: { type: Schema.Types.Mixed },
        productUnit: { type: String },
        productId: { type: String, required: true, trim: true },
        productName: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: Number.MIN_VALUE },
        unitPrice: { type: Number, required: true, min: 0 },
        _id: false,
    }],
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    orderType: { type: String, trim: true, maxlength: 80, default: undefined },
    otherOrderType: { type: String, default: '', trim: true, maxlength: 80 },
    deliveryNumber: { type: String, default: '', trim: true, maxlength: 40 },
    digitalMenuTable: { type: String, default: '', trim: true, maxlength: 50, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByName: { type: String, required: true, trim: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
}, { timestamps: true });

OrderDraftSchema.index({ businessId: 1, draftCode: 1 }, { unique: true });
OrderDraftSchema.index({ businessId: 1, updatedAt: -1 });

OrderDraftSchema.plugin(branchScopedPlugin);
export default mongoose.model<IOrderDraft>('OrderDraft', OrderDraftSchema);
