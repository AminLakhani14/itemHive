import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Product } from '../inventory/inventorySlice';

export interface CartItem extends Product {
    productId?: string;
    sizeId?: string;
    selectedSize?: number | string;
    quantity: number;
    discount?: number;
}

interface POSState {
    cart: CartItem[];
    discountPercent: number;
}

const initialState: POSState = {
    cart: [],
    discountPercent: 0,
};

const posSlice = createSlice({
    name: 'pos',
    initialState,
    reducers: {
        addToCart: (state, action: PayloadAction<Product & { quantity?: number; productId?: string; sizeId?: string; selectedSize?: number | string }>) => {
            const existingItem = state.cart.find(item => item.id === action.payload.id);
            if (existingItem) {
                existingItem.quantity = Number((existingItem.quantity + (action.payload.quantity ?? 1)).toPrecision(15));
            } else {
                state.cart.push({ ...action.payload, quantity: action.payload.quantity ?? 1 });
            }
        },
        updateCartItemPrice: (state, action: PayloadAction<{ id: string; price: number }>) => {
            const item = state.cart.find(cartItem => cartItem.id === action.payload.id);
            if (item) {
                item.price = Math.max(0, action.payload.price);
            }
        },
        removeFromCart: (state, action: PayloadAction<string>) => {
            state.cart = state.cart.filter(item => item.id !== action.payload);
        },
        updateQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
            const item = state.cart.find(item => item.id === action.payload.id);
            if (item) {
                item.quantity = Math.max(0, action.payload.quantity);
                if (item.quantity === 0) {
                    state.cart = state.cart.filter(i => i.id !== action.payload.id);
                }
            }
        },
        clearCart: (state) => {
            state.cart = [];
            state.discountPercent = 0;
        },
        replaceCart: (state, action: PayloadAction<{ cart: CartItem[]; discountPercent?: number }>) => {
            state.cart = action.payload.cart;
            state.discountPercent = Math.min(100, Math.max(0, action.payload.discountPercent || 0));
        },
        setCartDiscountPercent: (state, action: PayloadAction<number>) => {
            state.discountPercent = Math.min(100, Math.max(0, action.payload || 0));
        },
    },
});

export const { addToCart, updateCartItemPrice, removeFromCart, updateQuantity, clearCart, replaceCart, setCartDiscountPercent } = posSlice.actions;
export default posSlice.reducer;
