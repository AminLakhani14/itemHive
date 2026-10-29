import mongoose, { Schema, Document } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export interface ITransaction extends Document {
    salespersonEmployeeId?: mongoose.Types.ObjectId;
    salespersonName?: string;
    id: string;
    timestamp: Date;
    sizeId?: string;
    selectedSize?: number | string;
    productUnit?: string;
    productId: string;
    productName: string;
    userName: string;
    type: 'addition' | 'reduction';
    amount: number;
    totalPrice: number;
    subtotal?: number;
    discountPercent?: number;
    discountAmount?: number;
    taxAmount?: number;
    paymentMethod?: 'cash' | 'card' | 'credit' | 'installment';
    paidVia?: 'cash' | 'card';
    paidNow?: number;
    dueAmount?: number;
    customerName?: string;
    customerCnic?: string;
    orderType?: string;
    otherOrderType?: string;
    foodpandaOrderNumber?: string;
    foodpandaRiderName?: string;
    unitCost?: number;
    unitPrice?: number;
    grossProfit?: number;
    installmentPlanId?: string;
    source?: 'pos' | 'order_desk' | 'inventory';
    orderId?: string;
    shiftId?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
}

const TransactionSchema: Schema = new Schema({
    salespersonEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    salespersonName: { type: String, default: '' },
    id: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    sizeId: { type: String, default: '' },
        selectedSize: { type: Schema.Types.Mixed },
        productUnit: { type: String },
        productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    userName: { type: String, required: true },
    type: { type: String, enum: ['addition', 'reduction'], required: true, index: true },
    amount: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    subtotal: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'credit', 'installment'], default: 'cash' },
    paidVia: { type: String, enum: ['cash', 'card'], default: undefined },
    paidNow: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    customerName: { type: String, default: '' },
    customerCnic: { type: String, default: '' },
    orderType: { type: String, trim: true, maxlength: 80, default: undefined },
    otherOrderType: { type: String, default: '' },
    foodpandaOrderNumber: { type: String, default: '', trim: true, maxlength: 80 },
    foodpandaRiderName: { type: String, default: '', trim: true, maxlength: 120 },
    unitCost: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    grossProfit: { type: Number, default: 0 },
    installmentPlanId: { type: String, default: '', index: true },
    source: { type: String, enum: ['pos', 'order_desk', 'inventory'], default: undefined, index: true },
    orderId: { type: String, default: '', index: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'POSShift', default: null, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true }
}, { timestamps: true });

TransactionSchema.index({ businessId: 1, id: 1 }, { unique: true });

TransactionSchema.plugin(branchScopedPlugin);
export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
