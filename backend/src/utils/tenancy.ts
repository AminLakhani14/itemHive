import mongoose from 'mongoose';
import Business from '../models/Business';
import AppSetting, { type IAppSetting } from '../models/AppSetting';
import type { IUser } from '../models/User';

type CheckoutSettings = Pick<
    IAppSetting,
    'salesTaxRate' | 'installmentsEnabled' | 'discountsEnabled' | 'discountOptions' | 'orderTypeOptions' | 'restaurantEnabled'
>;

const CHECKOUT_SETTINGS_CACHE_TTL_MS = 15 * 1000;
const checkoutSettingsCache = new Map<string, { expiresAt: number; value: CheckoutSettings }>();
const DEFAULT_ORDER_TYPE_OPTIONS = ['Dine In', 'Takeaway', 'Foodpanda', 'Other'];

export interface TenantContext {
    businessId: string;
    businessIsLegacy: boolean;
}

export const ensureLegacyBusiness = () => Business.findOneAndUpdate(
    { slug: 'legacy-itemhive' },
    {
        $setOnInsert: {
            name: 'ItemHive Legacy Workspace',
            slug: 'legacy-itemhive',
            isActive: true,
            isLegacy: true,
        },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
).orFail();

export const getGlobalAppSettings = () => AppSetting.findOneAndUpdate(
    { key: 'global-auth' },
    { $setOnInsert: { key: 'global-auth' } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
).orFail();

export const ensureUserBusiness = async (user: IUser) => {
    if (user.businessId) {
        const business = await Business.findById(user.businessId);
        if (business) return business;
    }

    const legacyBusiness = await ensureLegacyBusiness();
    user.businessId = legacyBusiness._id;
    await user.save();
    return legacyBusiness;
};

export const buildTenantFilter = (tenant: TenantContext) => {
    const businessId = new mongoose.Types.ObjectId(tenant.businessId);
    return tenant.businessIsLegacy
        ? { $or: [{ businessId }, { businessId: { $exists: false } }] }
        : { businessId };
};

export const getTenantObjectId = (tenant: TenantContext) =>
    new mongoose.Types.ObjectId(tenant.businessId);

export const getAppSettingsForTenant = async (tenant: TenantContext) => {
    const tenantKey = `business:${tenant.businessId}`;
    let settings = await AppSetting.findOne({ key: tenantKey });

    if (!settings && tenant.businessIsLegacy) {
        settings = await AppSetting.findOneAndUpdate(
            { key: 'global' },
            { $set: { key: tenantKey, businessId: getTenantObjectId(tenant) } },
            { returnDocument: 'after' }
        );
    }

    if (!settings) {
        settings = await AppSetting.findOneAndUpdate(
            { key: tenantKey },
            { $setOnInsert: { key: tenantKey, businessId: getTenantObjectId(tenant) } },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        ).orFail();
    }

    return settings;
};

// Checkout can be one of the busiest API paths. These settings change rarely,
// so a short cache removes a database read from each sale without delaying a
// setting update (the update endpoint explicitly clears this cache).
export const getCachedAppSettingsForTenant = async (tenant: TenantContext): Promise<CheckoutSettings> => {
    const tenantKey = tenant.businessId;
    const cached = checkoutSettingsCache.get(tenantKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const settings = await getAppSettingsForTenant(tenant);
    const value: CheckoutSettings = {
        salesTaxRate: settings.salesTaxRate,
        installmentsEnabled: settings.installmentsEnabled,
        discountsEnabled: settings.discountsEnabled,
        discountOptions: settings.discountOptions || [],
        orderTypeOptions: settings.orderTypeOptions?.length ? settings.orderTypeOptions : DEFAULT_ORDER_TYPE_OPTIONS,
        restaurantEnabled: settings.restaurantEnabled,
    };
    checkoutSettingsCache.set(tenantKey, {
        expiresAt: Date.now() + CHECKOUT_SETTINGS_CACHE_TTL_MS,
        value,
    });
    return value;
};

export const invalidateAppSettingsCache = (tenant: TenantContext) => {
    checkoutSettingsCache.delete(tenant.businessId);
};
