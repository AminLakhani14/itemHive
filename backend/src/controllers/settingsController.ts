import { Response } from 'express';
import User from '../models/User';
import type { AuthRequest } from '../middleware/auth';
import { normalizeRole } from '../utils/accessControl';
import type { IUser } from '../models/User';
import { getAppSettingsForTenant, getGlobalAppSettings, invalidateAppSettingsCache } from '../utils/tenancy';
import type { IAppSetting } from '../models/AppSetting';
import { effectiveBusinessTypeId, getBusinessTypeCatalog } from '../utils/businessTypes';
import { businessProductFields } from '../utils/businessProductFields';

const DEFAULT_ORDER_TYPE_OPTIONS = ['Dine In', 'Takeaway', 'Foodpanda', 'Other'];

const serializeAppSettings = async (appSettings: IAppSetting, globalAppSettings: IAppSetting) => {
    const businessTypeId = effectiveBusinessTypeId(appSettings);
    const catalog = await getBusinessTypeCatalog();
    const businessType = catalog.types.find(type => type.id === businessTypeId);
    return {
        businessTypeId,
        businessTypeName: businessType?.name || '',
        productFields: businessProductFields(businessType),
        salesTaxRate: appSettings.salesTaxRate,
        shopName: appSettings.shopName,
        shopPhone: appSettings.shopPhone,
        shopAddress: appSettings.shopAddress,
        receiptBannerUrl: appSettings.receiptBannerUrl || '',
        invoiceLogoUrl: appSettings.invoiceLogoUrl || '',
        installmentsEnabled: appSettings.installmentsEnabled,
        discountsEnabled: appSettings.discountsEnabled,
        discountOptions: appSettings.discountOptions || [],
        orderTypeOptions: appSettings.orderTypeOptions?.length ? appSettings.orderTypeOptions : DEFAULT_ORDER_TYPE_OPTIONS,
        restaurantEnabled: appSettings.restaurantEnabled,
        autoRegistrationEnabled: globalAppSettings.autoRegistrationEnabled,
        basicCustomizationOfferEnabled: globalAppSettings.basicCustomizationOfferEnabled,
    };
};

const serializePreferences = (preferences: IUser['preferences']) => ({
    country: preferences.country,
    currency: preferences.currency,
    notifications: {
        orderUpdates: preferences.notifications.orderUpdates,
        lowStockAlerts: preferences.notifications.lowStockAlerts,
    },
});

export const getSettings = async (req: AuthRequest, res: Response) => {
    try {
        const [user, appSettings, globalAppSettings] = await Promise.all([
            User.findById(req.user?.id).select('preferences'),
            getAppSettingsForTenant(req.user!),
            getGlobalAppSettings(),
        ]);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json({
            ...serializePreferences(user.preferences),
            app: await serializeAppSettings(appSettings, globalAppSettings),
            canManageDiscounts: req.user?.role === 'super_admin' || Boolean(req.user?.discountAccess),
            canManageOrderTypes: req.user?.role === 'super_admin' || req.user?.role === 'admin',
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to fetch settings' });
    }
};

/** Public, deliberately minimal pricing configuration. No authentication required. */
export const getPublicPricingSettings = async (_req: AuthRequest, res: Response) => {
    try {
        const globalAppSettings = await getGlobalAppSettings();
        return res.json({
            basicCustomizationOfferEnabled: Boolean(globalAppSettings.basicCustomizationOfferEnabled),
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to fetch pricing settings' });
    }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.user?.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.preferences = {
            country: req.body.country,
            currency: req.body.currency,
            notifications: {
                orderUpdates: req.body.notifications.orderUpdates,
                lowStockAlerts: req.body.notifications.lowStockAlerts,
            },
        };

        await user.save();

        const appSettings = await getAppSettingsForTenant(req.user!);
        const globalAppSettings = await getGlobalAppSettings();
        const role = normalizeRole(req.user?.role);
        const isSuperAdmin = role === 'super_admin';
        const canEditDiscounts = isSuperAdmin || (role === 'admin' && Boolean(req.user?.discountAccess));
        // Admins may brand their own workspace; the rest of the POS config is super-admin only.
        // Branding (banner, shop name, contact block) belongs to the workspace owner;
        // tax and installments stay with the super admin.
        const canEditBranding = isSuperAdmin || role === 'admin';

        if (req.body.app) {
            if (canEditBranding) {
                if (typeof req.body.app.receiptBannerUrl === 'string') {
                    appSettings.receiptBannerUrl = req.body.app.receiptBannerUrl;
                }
                if (typeof req.body.app.invoiceLogoUrl === 'string') {
                    appSettings.invoiceLogoUrl = req.body.app.invoiceLogoUrl;
                }
                appSettings.shopName = req.body.app.shopName;
                appSettings.shopPhone = req.body.app.shopPhone;
                appSettings.shopAddress = req.body.app.shopAddress;
            }
            if (isSuperAdmin) {
                appSettings.salesTaxRate = req.body.app.salesTaxRate;
                appSettings.installmentsEnabled = req.body.app.installmentsEnabled;
            }
            if (canEditDiscounts) {
                appSettings.discountsEnabled = req.body.app.discountsEnabled;
                appSettings.discountOptions = req.body.app.discountOptions;
            }
            if ((isSuperAdmin || role === 'admin') && appSettings.restaurantEnabled && Array.isArray(req.body.app.orderTypeOptions)) {
                const options = (req.body.app.orderTypeOptions as unknown[])
                    .map((option) => String(option || '').trim())
                    .filter(Boolean);
                appSettings.orderTypeOptions = [...new Map(options.map((option: string) => [option.toLowerCase(), option])).values()];
            }
            if (appSettings.isModified()) {
                await appSettings.save();
                invalidateAppSettingsCache(req.user!);
            }
            if (isSuperAdmin && typeof req.body.app.autoRegistrationEnabled === 'boolean') {
                globalAppSettings.autoRegistrationEnabled = req.body.app.autoRegistrationEnabled;
            }
            if (isSuperAdmin && typeof req.body.app.basicCustomizationOfferEnabled === 'boolean') {
                globalAppSettings.basicCustomizationOfferEnabled = req.body.app.basicCustomizationOfferEnabled;
            }
            if (isSuperAdmin && globalAppSettings.isModified()) {
                await globalAppSettings.save();
            }
        }

        return res.json({
            ...serializePreferences(user.preferences),
            app: await serializeAppSettings(appSettings, globalAppSettings),
            canManageDiscounts: req.user?.role === 'super_admin' || Boolean(req.user?.discountAccess),
            canManageOrderTypes: req.user?.role === 'super_admin' || req.user?.role === 'admin',
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update settings' });
    }
};
