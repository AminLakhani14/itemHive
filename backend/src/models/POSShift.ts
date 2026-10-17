import mongoose, { Document, Schema } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export interface IShiftReportTotals {
    completedOrders: number;
    itemsSold: number;
    grossSales: number;
    discounts: number;
    tax: number;
    netSales: number;
    cashSales: number;
    cardSales: number;
    creditSales: number;
    creditCashReceived: number;
    creditCardReceived: number;
    creditCollectionsCash: number;
    creditCollectionsCard: number;
    installmentSales: number;
    installmentCashAdvance: number;
    installmentCardAdvance: number;
    installmentCollectionsCash: number;
    installmentCollectionsCard: number;
    totalCollected?: number;
    expectedDrawerCash: number;
    expensePaidOut?: number;
    expenseRefunds?: number;
    countedCash?: number;
    cashDifference?: number;
}

export interface IShiftPaymentSummary {
    method: 'cash' | 'card' | 'credit' | 'installment';
    orderCount: number;
    amount: number;
}

export interface IShiftOrderTypeSummary {
    orderType: string;
    orderCount: number;
    amount: number;
}

export interface IShiftSoldItemSummary {
    productId: string;
    productName: string;
    quantity: number;
    amount: number;
}

export interface IShiftReportSnapshot {
    currency?: string;
    shiftCode: string;
    registerName: string;
    cashierName: string;
    openingCash: number;
    openedAt: Date;
    reportTime: Date;
    status: 'open' | 'closed';
    totals: IShiftReportTotals;
    paymentSummary?: IShiftPaymentSummary[];
    orderTypeSummary?: IShiftOrderTypeSummary[];
    soldItems?: IShiftSoldItemSummary[];
}

export interface IPOSShift extends Document {
    currency?: string;
    shiftCode: string;
    registerName: string;
    openingCash: number;
    status: 'open' | 'closed';
    openedBy: mongoose.Types.ObjectId;
    openedByName: string;
    openedAt: Date;
    closedBy?: mongoose.Types.ObjectId;
    closedByName?: string;
    closedAt?: Date;
    countedCash?: number;
    cashDifference?: number;
    activityVersion: number;
    finalReport?: IShiftReportSnapshot;
    businessId: mongoose.Types.ObjectId;
}

const ShiftReportTotalsSchema = new Schema<IShiftReportTotals>({
    completedOrders: { type: Number, required: true },
    itemsSold: { type: Number, required: true },
    grossSales: { type: Number, required: true },
    discounts: { type: Number, required: true },
    tax: { type: Number, required: true },
    netSales: { type: Number, required: true },
    cashSales: { type: Number, required: true },
    cardSales: { type: Number, required: true },
    creditSales: { type: Number, required: true },
    creditCashReceived: { type: Number, required: true },
    creditCardReceived: { type: Number, required: true },
    creditCollectionsCash: { type: Number, required: true },
    creditCollectionsCard: { type: Number, required: true },
    installmentSales: { type: Number, required: true },
    installmentCashAdvance: { type: Number, required: true },
    installmentCardAdvance: { type: Number, required: true },
    installmentCollectionsCash: { type: Number, required: true },
    installmentCollectionsCard: { type: Number, required: true },
    totalCollected: { type: Number, default: 0 },
    expectedDrawerCash: { type: Number, required: true },
    expensePaidOut: { type: Number, default: 0 },
    expenseRefunds: { type: Number, default: 0 },
    countedCash: { type: Number, default: undefined },
    cashDifference: { type: Number, default: undefined },
}, { _id: false });

const ShiftPaymentSummarySchema = new Schema<IShiftPaymentSummary>({
    method: { type: String, enum: ['cash', 'card', 'credit', 'installment'], required: true },
    orderCount: { type: Number, required: true },
    amount: { type: Number, required: true },
}, { _id: false });

const ShiftOrderTypeSummarySchema = new Schema<IShiftOrderTypeSummary>({
    orderType: { type: String, required: true },
    orderCount: { type: Number, required: true },
    amount: { type: Number, required: true },
}, { _id: false });

const ShiftSoldItemSummarySchema = new Schema<IShiftSoldItemSummary>({
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    amount: { type: Number, required: true },
}, { _id: false });

const ShiftReportSnapshotSchema = new Schema<IShiftReportSnapshot>({
    currency: { type: String },
    shiftCode: { type: String, required: true },
    registerName: { type: String, required: true },
    cashierName: { type: String, required: true },
    openingCash: { type: Number, required: true },
    openedAt: { type: Date, required: true },
    reportTime: { type: Date, required: true },
    status: { type: String, enum: ['open', 'closed'], required: true },
    totals: { type: ShiftReportTotalsSchema, required: true },
    paymentSummary: { type: [ShiftPaymentSummarySchema], default: [] },
    orderTypeSummary: { type: [ShiftOrderTypeSummarySchema], default: [] },
    soldItems: { type: [ShiftSoldItemSummarySchema], default: [] },
}, { _id: false });

const POSShiftSchema = new Schema<IPOSShift>({
    currency: { type: String },
    shiftCode: { type: String, required: true, trim: true },
    registerName: { type: String, required: true, trim: true, maxlength: 80 },
    openingCash: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    openedByName: { type: String, required: true },
    openedAt: { type: Date, required: true, default: Date.now },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: undefined },
    closedByName: { type: String, default: '' },
    closedAt: { type: Date, default: undefined },
    countedCash: { type: Number, min: 0, default: undefined },
    cashDifference: { type: Number, default: undefined },
    activityVersion: { type: Number, default: 0 },
    finalReport: { type: ShiftReportSnapshotSchema, default: undefined },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
}, { timestamps: true });

POSShiftSchema.index({ businessId: 1, shiftCode: 1 }, { unique: true });
POSShiftSchema.index(
    { businessId: 1, branchId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: 'open' } },
);
POSShiftSchema.index({ businessId: 1, closedAt: -1 });

POSShiftSchema.plugin(branchScopedPlugin);
export default mongoose.model<IPOSShift>('POSShift', POSShiftSchema);
