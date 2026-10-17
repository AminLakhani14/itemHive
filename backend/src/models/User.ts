import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { normalizeRole, USER_ROLES, type UserRole } from '../utils/accessControl';
import { ADMIN_SCREEN_PERMISSIONS, type AdminScreenPermission } from '../utils/screenPermissions';

export interface IUser extends Document {
    name: string;
    email: string;
    password?: string;
    visiblePassword?: string;
    role: UserRole;
    avatar?: string;
    location?: { countryCode: string; country: string; city: string };
    appearance?: { themeColor: string; backgroundColor?: string; sidebarColor?: string; navbarColor?: string; sidebarFontColor?: string; navbarFontColor?: string; borderColor?: string; headingColor?: string; secondaryTextColor?: string; secondaryColor?: string; successColor?: string; warningColor?: string; errorColor?: string; fontColor: string; logo: string };
    isActive: boolean;
    isVisible: boolean;
    installmentAccess: boolean;
    discountAccess: boolean;
    digitalMenuAccess: 'none' | 'menu' | 'pos';
    screenPermissions?: AdminScreenPermission[] | null;
    screenPermissionsVersion?: number;
    userCreationLimit: number;
    createdBy?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
    /** The branch a staff login works in. Administrators are assigned on the branch instead. */
    branchId?: mongoose.Types.ObjectId | null;
    preferences: {
        country: 'PK' | 'US' | 'DE' | 'GB' | 'CH' | 'CD' | 'CG' | 'IN' | 'AE';
        currency: 'USD' | 'EUR' | 'GBP' | 'CHF' | 'CDF' | 'XAF' | 'PKR' | 'INR' | 'AED';
        notifications: {
            orderUpdates: boolean;
            lowStockAlerts: boolean;
        };
    };
    comparePassword: (password: string) => Promise<boolean>;
}

const UserSchema: Schema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, select: false },
    visiblePassword: { type: String, select: false },
    role: { type: String, enum: USER_ROLES, default: 'user' },
    avatar: { type: String },
    location: {
        countryCode: { type: String, trim: true },
        country: { type: String, trim: true },
        city: { type: String, trim: true },
    },
    appearance: {
        themeColor: { type: String, default: '#0ea5a5' },
        backgroundColor: { type: String, default: '' },
        sidebarColor: { type: String, default: '' },
        navbarColor: { type: String, default: '' },
        sidebarFontColor: { type: String, default: '' },
        navbarFontColor: { type: String, default: '' },
        borderColor: { type: String, default: '' },
        headingColor: { type: String, default: '' },
        secondaryTextColor: { type: String, default: '' },
        secondaryColor: { type: String, default: '' },
        successColor: { type: String, default: '' },
        warningColor: { type: String, default: '' },
        errorColor: { type: String, default: '' },
        fontColor: { type: String, default: '' },
        logo: { type: String, default: '' },
    },
    isActive: { type: Boolean, default: true, index: true },
    isVisible: { type: Boolean, default: true, index: true },
    installmentAccess: { type: Boolean, default: false },
    // Allows a workspace administrator to configure the discounts available in POS.
    discountAccess: { type: Boolean, default: false },
    // Menu lets staff manage QR menus; pos additionally lets them send table drafts to billing.
    digitalMenuAccess: { type: String, enum: ['none', 'menu', 'pos'], default: 'none' },
    // null means an existing Admin keeps legacy full access. Once configured,
    // even an empty array is an explicit permission assignment.
    screenPermissions: {
        type: [{ type: String, enum: ADMIN_SCREEN_PERMISSIONS }],
        default: null,
    },
    screenPermissionsVersion: { type: Number, default: 1 },
    userCreationLimit: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    branchId: { type: Schema.Types.ObjectId, default: null },
    preferences: {
        country: { type: String, enum: ['PK', 'US', 'DE', 'GB', 'CH', 'CD', 'CG', 'IN', 'AE'], default: 'PK' },
        currency: { type: String, enum: ['USD', 'EUR', 'GBP', 'CHF', 'CDF', 'XAF', 'PKR', 'INR', 'AED'], default: 'PKR' },
        notifications: {
            orderUpdates: { type: Boolean, default: true },
            lowStockAlerts: { type: Boolean, default: true },
        },
    },
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function (this: any) {
    this.role = normalizeRole(this.role);
    this.email = String(this.email || '').trim().toLowerCase();

    if (!this.isModified('password') || !this.password) return;
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (err: any) {
        throw err;
    }
});

UserSchema.methods.comparePassword = async function (canditatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(canditatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
