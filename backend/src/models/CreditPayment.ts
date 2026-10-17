import mongoose, { Schema, Document } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export interface ICreditPayment extends Document {
    customerName: string;
    customerCnic: string;
    amount: number;
    paidVia: 'cash' | 'card';
    receivedBy: string;
    notes?: string;
    timestamp: Date;
    businessId?: mongoose.Types.ObjectId;
    shiftId?: mongoose.Types.ObjectId;
}

const CreditPaymentSchema: Schema<ICreditPayment> = new Schema({
    customerName: { type: String, required: true, trim: true, index: true },
    customerCnic: { type: String, required: true, trim: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    paidVia: { type: String, enum: ['cash', 'card'], required: true },
    receivedBy: { type: String, required: true, trim: true },
    notes: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now, index: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'POSShift', default: null, index: true },
}, { timestamps: true });

CreditPaymentSchema.plugin(branchScopedPlugin);
export default mongoose.model<ICreditPayment>('CreditPayment', CreditPaymentSchema);
