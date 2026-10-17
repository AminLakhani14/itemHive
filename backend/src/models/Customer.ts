import mongoose, { Schema, Document } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export interface ICustomer extends Document {
    fullName: string;
    cnic: string;
    phoneNumber: string;
    amount: number;
    email?: string;
    address?: string;
    city?: string;
    customerType: 'regular' | 'credit' | 'installment' | 'wholesale';
    status: 'active' | 'inactive';
    notes?: string;
    createdBy?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CustomerSchema: Schema<ICustomer> = new Schema(
    {
        fullName: { type: String, required: true, trim: true, index: true },
        cnic: { type: String, required: true, trim: true, index: true },
        phoneNumber: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0, default: 0 },
        email: { type: String, default: '', trim: true, lowercase: true },
        address: { type: String, default: '', trim: true },
        city: { type: String, default: '', trim: true },
        customerType: {
            type: String,
            enum: ['regular', 'credit', 'installment', 'wholesale'],
            default: 'regular',
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        notes: { type: String, default: '', trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    },
    { timestamps: true }
);

CustomerSchema.index({ businessId: 1, branchId: 1, cnic: 1 }, { unique: true });

CustomerSchema.plugin(branchScopedPlugin);
export default mongoose.model<ICustomer>('Customer', CustomerSchema);
