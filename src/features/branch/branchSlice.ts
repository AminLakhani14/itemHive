import { createAsyncThunk, createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import api from '../../api/axios';
import type { RootState } from '../../store';
import { DEFAULT_APP_SETTINGS } from '../settings/settingsSlice';

/** Sent as `x-itemhive-branch-id`; the server falls back to an allowed branch when it is missing or not allowed. */
export const BRANCH_STORAGE_KEY = 'itemhive-branch-id';

export interface BranchOption {
    id: string;
    name: string;
    location: string;
    phone: string;
    city: string;
    country: string;
}

interface MyBranchesResponse {
    activeBranchId: string | null;
    canViewAll: boolean;
    businessBranchCount: number;
    branches: BranchOption[];
}

interface BranchState extends MyBranchesResponse {
    loaded: boolean;
    /** Counts switches made in the top bar; the page content remounts on each one. */
    switchCount: number;
}

const initialState: BranchState = { activeBranchId: null, canViewAll: false, businessBranchCount: 0, branches: [], loaded: false, switchCount: 0 };

export const fetchMyBranches = createAsyncThunk('branch/fetchMine', async () => (await api.get<MyBranchesResponse>('/organization/my-branches')).data);

const branchSlice = createSlice({
    name: 'branch',
    initialState,
    reducers: {
        setActiveBranch: (state, action: PayloadAction<string>) => {
            state.activeBranchId = action.payload;
            state.switchCount += 1;
        },
        resetBranches: () => initialState,
    },
    extraReducers: (builder) => {
        builder.addCase(fetchMyBranches.fulfilled, (state, action) => {
            Object.assign(state, action.payload, { loaded: true });
            // Keep the stored choice in step with the branch the server is actually using.
            if (action.payload.activeBranchId) localStorage.setItem(BRANCH_STORAGE_KEY, action.payload.activeBranchId);
            else localStorage.removeItem(BRANCH_STORAGE_KEY);
        });
    },
});

export const { setActiveBranch, resetBranches } = branchSlice.actions;
export default branchSlice.reducer;

export const selectActiveBranch = (state: RootState) =>
    state.branch.branches.find((branch) => branch.id === state.branch.activeBranchId) || null;

/**
 * Settings are shared by every branch. When a business has several branches, printed receipts, invoices,
 * slips and reports name the active branch and use its own address and phone.
 */
export const selectPrintSettings = createSelector(
    [(state: RootState) => state.settings.app || DEFAULT_APP_SETTINGS, selectActiveBranch, (state: RootState) => state.branch.businessBranchCount],
    (app, branch, branchCount) => !branch || branchCount < 2 ? app : {
        ...app,
        shopName: `${app.shopName || DEFAULT_APP_SETTINGS.shopName} — ${branch.name}`,
        shopAddress: [branch.location, branch.city].filter(Boolean).join(', ') || app.shopAddress,
        shopPhone: branch.phone || app.shopPhone,
    },
);
