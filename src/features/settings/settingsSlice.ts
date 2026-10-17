import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import api from '../../api/axios';
import type { BusinessProductField } from '../../types/businessType';

interface NotificationSettings {
    orderUpdates: boolean;
    lowStockAlerts: boolean;
}

export interface AppSettings {
    businessTypeId?: string;
    businessTypeName?: string;
    productFields?: BusinessProductField[];
    salesTaxRate: number;
    shopName: string;
    shopPhone: string;
    shopAddress: string;
    /** Base64 data URL shown as the header banner on receipts, invoices and printed slips. */
    receiptBannerUrl: string;
    /** Optional invoice-specific logo. Falls back to the receipt banner when empty. */
    invoiceLogoUrl: string;
    installmentsEnabled: boolean;
    /** Enables percentage discounts in the POS for this workspace. */
    discountsEnabled: boolean;
    /** Super-admin configured discount percentages shown to cashiers. */
    discountOptions: number[];
    /** Restaurant POS choices configured for this workspace. */
    orderTypeOptions: string[];
    /** Turns on restaurant-only POS functionality for this workspace. */
    restaurantEnabled: boolean;
    autoRegistrationEnabled: boolean;
    /** Super-admin toggle for the public Basic-plan customization offer. */
    basicCustomizationOfferEnabled: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    salesTaxRate: 0,
    shopName: 'ItemHive POS',
    shopPhone: '',
    shopAddress: '',
    receiptBannerUrl: '',
    invoiceLogoUrl: '',
    installmentsEnabled: false,
    discountsEnabled: false,
    discountOptions: [],
    orderTypeOptions: ['Dine In', 'Takeaway', 'Foodpanda', 'Other'],
    restaurantEnabled: false,
    autoRegistrationEnabled: true,
    basicCustomizationOfferEnabled: false,
};

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CHF' | 'CDF' | 'XAF' | 'PKR' | 'INR' | 'AED';
export type CountryCode = 'PK' | 'US' | 'DE' | 'GB' | 'CH' | 'CD' | 'CG' | 'IN' | 'AE';

export const countryCurrencyMap: Record<CountryCode, CurrencyCode> = {
    PK: 'PKR',
    US: 'USD',
    DE: 'EUR',
    GB: 'GBP',
    CH: 'CHF',
    CD: 'CDF',
    CG: 'XAF',
    IN: 'INR',
    AE: 'AED',
};

interface SettingsState {
    notifications: NotificationSettings;
    country: CountryCode;
    currency: CurrencyCode;
    app: AppSettings;
    canManageDiscounts: boolean;
    canManageOrderTypes: boolean;
    loading: boolean;
    error: string | null;
}

const initialState: SettingsState = {
    notifications: {
        orderUpdates: true,
        lowStockAlerts: true,
    },
    country: 'PK',
    currency: 'PKR',
    app: DEFAULT_APP_SETTINGS,
    canManageDiscounts: false,
    canManageOrderTypes: false,
    loading: false,
    error: null,
};

export const fetchSettings = createAsyncThunk(
    'settings/fetchSettings',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/settings');
            return response.data as {
                country: CountryCode;
                currency: CurrencyCode;
                notifications: NotificationSettings;
                app: AppSettings;
                canManageDiscounts: boolean;
                canManageOrderTypes: boolean;
            };
        } catch (error: any) {
            return rejectWithValue(error.response?.data?.message || 'Failed to fetch settings');
        }
    }
);

export const saveSettings = createAsyncThunk(
    'settings/saveSettings',
    async (
        payload: {
            country: CountryCode;
            currency: CurrencyCode;
            notifications: NotificationSettings;
            app: AppSettings;
        },
        { rejectWithValue }
    ) => {
        try {
            const editableApp = { ...payload.app };
            delete editableApp.businessTypeId;
            delete editableApp.businessTypeName;
            delete editableApp.productFields;
            const response = await api.put('/settings', { ...payload, app: editableApp });
            return response.data as {
                country: CountryCode;
                currency: CurrencyCode;
                notifications: NotificationSettings;
                app: AppSettings;
                canManageDiscounts: boolean;
                canManageOrderTypes: boolean;
            };
        } catch (error: any) {
            if (error.response?.status === 413) {
                return rejectWithValue(
                    'The banner is too large for the server. Upload a smaller image, or restart the API if it is running old code.'
                );
            }
            return rejectWithValue(error.response?.data?.message || 'Failed to save settings');
        }
    }
);

const settingsSlice = createSlice({
    name: 'settings',
    initialState,
    reducers: {
        setOrderUpdatesEnabled: (state, action: PayloadAction<boolean>) => {
            state.notifications.orderUpdates = action.payload;
        },
        setLowStockAlertsEnabled: (state, action: PayloadAction<boolean>) => {
            state.notifications.lowStockAlerts = action.payload;
        },
        setCountry: (state, action: PayloadAction<CountryCode>) => {
            state.country = action.payload;
            state.currency = countryCurrencyMap[action.payload];
        },
        setCurrency: (state, action: PayloadAction<CurrencyCode>) => {
            state.currency = action.payload;
        },
        clearSettingsError: (state) => {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchSettings.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSettings.fulfilled, (state, action) => {
                state.loading = false;
                state.country = action.payload.country;
                state.currency = action.payload.currency;
                state.notifications = action.payload.notifications;
                state.app = { ...DEFAULT_APP_SETTINGS, ...action.payload.app };
                state.canManageDiscounts = Boolean(action.payload.canManageDiscounts);
                state.canManageOrderTypes = Boolean(action.payload.canManageOrderTypes);
            })
            .addCase(fetchSettings.rejected, (state, action: PayloadAction<any>) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(saveSettings.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(saveSettings.fulfilled, (state, action) => {
                state.loading = false;
                state.country = action.payload.country;
                state.currency = action.payload.currency;
                state.notifications = action.payload.notifications;
                state.app = { ...DEFAULT_APP_SETTINGS, ...action.payload.app };
                state.canManageDiscounts = Boolean(action.payload.canManageDiscounts);
                state.canManageOrderTypes = Boolean(action.payload.canManageOrderTypes);
            })
            .addCase(saveSettings.rejected, (state, action: PayloadAction<any>) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export const { setOrderUpdatesEnabled, setLowStockAlertsEnabled, setCountry, setCurrency, clearSettingsError } = settingsSlice.actions;
export default settingsSlice.reducer;
