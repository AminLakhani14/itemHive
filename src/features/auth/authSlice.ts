import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { REHYDRATE } from 'redux-persist';
import { isAxiosError } from 'axios';
import api from '../../api/axios';
import type { ScreenPermission } from '../../lib/screenPermissions';

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface Appearance { themeColor: string; backgroundColor?: string; sidebarColor?: string; navbarColor?: string; sidebarFontColor?: string; navbarFontColor?: string; borderColor?: string; headingColor?: string; secondaryTextColor?: string; secondaryColor?: string; successColor?: string; warningColor?: string; errorColor?: string; fontColor: string; logo: string }

export interface User {
    appearance?: Appearance;
    id: string;
    name: string;
    email: string;
    role: UserRole;
    photoUrl?: string;
    location?: { countryCode: string; country: string; city: string };
    isActive?: boolean;
    isVisible?: boolean;
    installmentAccess?: boolean;
    discountAccess?: boolean;
    digitalMenuAccess?: 'none' | 'menu' | 'pos';
    /** null/undefined means legacy full access; an array is an explicit Admin assignment. */
    screenPermissions?: ScreenPermission[] | null;
    screenPermissionsVersion?: number;
    /** Workspace-level flag provided to client-admin rows in Team Management. */
    restaurantEnabled?: boolean;
    businessTypeId?: string;
    monthlyPayment?: { enabled: boolean; paidAt?: string; trackingStartedAt?: string; overdue: boolean };
    userCreationLimit?: number;
    businessId?: string;
    businessName?: string;
    /** Team only: the branch a staff login works in, or an administrator's assigned branches. */
    branchName?: string;
    createdBy?: string;
    visiblePassword?: string;
    /** True for team users: `appearance` is their business's theme and they cannot change it. */
    themeManaged?: boolean;
    /** Team rows only: the employee profile linked to this login. */
    employeeId?: string | null;
    preferences?: {
        country: 'PK' | 'US' | 'DE' | 'GB' | 'CH' | 'CD' | 'CG' | 'IN' | 'AE';
        currency: 'USD' | 'EUR' | 'GBP' | 'CHF' | 'CDF' | 'XAF' | 'PKR' | 'INR' | 'AED';
        notifications: {
            orderUpdates: boolean;
            lowStockAlerts: boolean;
        };
    };
}

export interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    loading: boolean;
    error: string | null;
}

const SUPER_ADMIN_EMAILS = ['admin@itemhive.com', 'admin@itemhive.pro'];

const normalizeRole = (role?: string, email?: string): UserRole => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (SUPER_ADMIN_EMAILS.includes(normalizedEmail)) {
        return 'super_admin';
    }

    if (role === 'super_admin' || role === 'admin' || role === 'user') {
        return role;
    }

    if (role === 'cashier') {
        return 'user';
    }

    return 'user';
};

const normalizeUser = (user: User | null): User | null => {
    if (!user) {
        return null;
    }

    return {
        ...user,
        role: normalizeRole(user.role, user.email),
    };
};

const initialState: AuthState = {
    user: null,
    token: localStorage.getItem('token'),
    isAuthenticated: !!localStorage.getItem('token'),
    loading: false,
    error: null,
};

export const loginUser = createAsyncThunk(
    'auth/login',
    async (credentials: { email: string; password: string }, { rejectWithValue, signal }) => {
        try {
            const response = await api.post('/auth/login', credentials, { timeout: 30000, signal });
            localStorage.setItem('token', response.data.token);
            return response.data;
        } catch (error: unknown) {
            if (isAxiosError<{ details?: string; message?: string }>(error)) {
                if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return rejectWithValue('Sign in timed out. Please try again.');
                if (!error.response) return rejectWithValue('Unable to reach the sign-in service. Please try again.');
                if (error.response.status >= 500) {
                    const unavailable = 'The sign-in service is temporarily unavailable. Please try again.';
                    return rejectWithValue(error.response.status === 503 ? error.response.data?.message || unavailable : unavailable);
                }
                return rejectWithValue(error.response.data?.details || error.response.data?.message || 'Login failed');
            }
            return rejectWithValue('Login failed. Please try again.');
        }
    }
);

export const registerUser = createAsyncThunk(
    'auth/register',
    async (
        payload: { name: string; email: string; password: string; role: UserRole; businessName?: string },
        { rejectWithValue }
    ) => {
        try {
            const response = await api.post('/auth/register', payload);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(error.response?.data?.details || error.response?.data?.message || 'Registration failed');
        }
    }
);

export const refreshCurrentUser = createAsyncThunk(
    'auth/refreshCurrentUser',
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get('/auth/me');
            return response.data.user as User;
        } catch (error: any) {
            return rejectWithValue(error.response?.data?.message || 'Unable to refresh account access');
        }
    }
);

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        logout: (state) => {
            state.user = null;
            state.token = null;
            state.isAuthenticated = false;
            state.loading = false;
            state.error = null;
            localStorage.removeItem('token');
        },
        setAppearance: (state, action: PayloadAction<Appearance>) => {
            if (state.user) state.user.appearance = action.payload;
        },
        clearError: (state) => {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(loginUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(loginUser.fulfilled, (state, action: PayloadAction<{ token: string; user: User }>) => {
                state.loading = false;
                state.isAuthenticated = true;
                state.user = normalizeUser(action.payload.user);
                state.token = action.payload.token;
            })
            .addCase(loginUser.rejected, (state, action: PayloadAction<any>) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(registerUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(registerUser.fulfilled, (state) => {
                state.loading = false;
            })
            .addCase(registerUser.rejected, (state, action: PayloadAction<any>) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(refreshCurrentUser.fulfilled, (state, action: PayloadAction<User>) => {
                state.user = normalizeUser(action.payload);
            })
            .addCase(REHYDRATE as any, (state, action: PayloadAction<any>) => {
                state.loading = false;
                state.error = null;
                const persistedAuth = action.payload?.auth;
                if (!persistedAuth) {
                    return;
                }

                state.user = normalizeUser(persistedAuth.user ?? state.user);
                state.token = persistedAuth.token ?? state.token;
                state.isAuthenticated = Boolean(persistedAuth.token ?? state.token);
                if (state.token) {
                    localStorage.setItem('token', state.token);
                }
            });
    }
});

export const { logout, clearError, setAppearance } = authSlice.actions;
export default authSlice.reducer;
