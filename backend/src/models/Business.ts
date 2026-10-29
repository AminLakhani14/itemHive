import mongoose, { Schema, Document } from 'mongoose';

export interface BusinessBranch {
    name: string;
    location: string;
    phone: string;
    city: string;
    countryCode: string;
    country: string;
    adminUserId?: mongoose.Types.ObjectId | null;
    adminUserIds: mongoose.Types.ObjectId[];
}

export interface BusinessDepartment {
    name: string;
    description: string;
    isActive: boolean;
}

export interface BusinessFiscalYear {
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
}

export interface IBusiness extends Document {
    name: string;
    slug: string;
    isActive: boolean;
    isLegacy: boolean;
    createdBy?: mongoose.Types.ObjectId;
    clientContact?: { name: string; email: string; phone: string; cnic: string };
    branches: BusinessBranch[];
    departments: BusinessDepartment[];
    fiscalYears: BusinessFiscalYear[];
}

const BusinessSchema: Schema<IBusiness> = new Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isLegacy: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    clientContact: {
        name: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        phone: { type: String, trim: true },
        cnic: { type: String, trim: true },
    },
    branches: {
        type: [new Schema<BusinessBranch>({
            name: { type: String, required: true, trim: true, maxlength: 160 },
            // Optional because a main branch created for a business that skipped client onboarding may not know its address yet.
            location: { type: String, default: '', trim: true, maxlength: 500 },
            phone: { type: String, default: '', trim: true, maxlength: 25 },
            city: { type: String, default: '', trim: true, maxlength: 160 },
            countryCode: { type: String, default: '', trim: true },
            country: { type: String, default: '', trim: true },
            adminUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
            adminUserIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
        })],
        default: [],
    },
    departments: {
        type: [new Schema<BusinessDepartment>({
            name: { type: String, required: true, trim: true, maxlength: 120 },
            description: { type: String, default: '', trim: true, maxlength: 500 },
            isActive: { type: Boolean, default: true },
        }, { timestamps: true })],
        default: [],
    },
    fiscalYears: {
        type: [new Schema<BusinessFiscalYear>({
            name: { type: String, required: true, trim: true, maxlength: 120 },
            startDate: { type: String, required: true, trim: true },
            endDate: { type: String, required: true, trim: true },
            isCurrent: { type: Boolean, default: false },
        }, { timestamps: true })],
        default: [],
    },
}, { timestamps: true });

export default mongoose.model<IBusiness>('Business', BusinessSchema);
