import mongoose, { Schema, Document } from 'mongoose';

export interface IAppSetting extends Document {
    key: string;
    businessId?: mongoose.Types.ObjectId;
    salesTaxRate: number;
    shopName: string;
    shopPhone: string;
    shopAddress: string;
    receiptBannerUrl: string;
    invoiceLogoUrl: string;
    installmentsEnabled: boolean;
    discountsEnabled: boolean;
    discountOptions: number[];
    orderTypeOptions: string[];
    monthlyPaymentTrackingEnabled: boolean;
    monthlyPaymentPaidAt?: Date;
    monthlyPaymentTrackingStartedAt?: Date;
    /** Enables restaurant-only POS features such as Kitchen Order Tickets. */
    restaurantEnabled: boolean;
    businessTypeId: string;
    autoRegistrationEnabled: boolean;
    /** Shows the Basic-plan customization offer on the public pricing screen. */
    basicCustomizationOfferEnabled: boolean;
    /** Weekdays (0 = Sunday) the attendance report treats as off rather than absent. */
    attendanceWeeklyOffDays: number[];
}

const AppSettingSchema: Schema<IAppSetting> = new Schema({
    key: { type: String, required: true, unique: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    salesTaxRate: { type: Number, default: 0, min: 0, max: 100 },
    shopName: { type: String, default: 'ItemHive POS', trim: true },
    shopPhone: { type: String, default: '', trim: true },
    shopAddress: { type: String, default: '', trim: true },
    receiptBannerUrl: { type: String, default: '' },
    invoiceLogoUrl: { type: String, default: '' },
    installmentsEnabled: { type: Boolean, default: false },
    discountsEnabled: { type: Boolean, default: false },
    discountOptions: { type: [Number], default: [] },
    orderTypeOptions: { type: [String], default: ['Dine In', 'Takeaway', 'Foodpanda', 'Other'] },
    monthlyPaymentTrackingEnabled: { type: Boolean, default: false },
    monthlyPaymentPaidAt: { type: Date, default: null },
    monthlyPaymentTrackingStartedAt: { type: Date, default: null },
    restaurantEnabled: { type: Boolean, default: false },
    businessTypeId: { type: String, default: '' },
    autoRegistrationEnabled: { type: Boolean, default: true },
    basicCustomizationOfferEnabled: { type: Boolean, default: false },
    attendanceWeeklyOffDays: { type: [Number], default: [0] },
}, { timestamps: true });

export default mongoose.model<IAppSetting>('AppSetting', AppSettingSchema);
