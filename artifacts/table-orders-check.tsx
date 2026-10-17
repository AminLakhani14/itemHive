import React from 'react';
import { createRoot } from 'react-dom/client';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box, Button, Stack, Typography } from '@mui/material';
import api from '../src/api/axios';
import inventory from '../src/features/inventory/inventorySlice';
import transactions from '../src/features/transactions/transactionSlice';
import orders from '../src/features/orders/ordersSlice';
import pos from '../src/features/pos/posSlice';
import { DEFAULT_APP_SETTINGS } from '../src/features/settings/settingsSlice';
import OrderDesk from '../src/pages/Orders/OrderDesk';
import OrderDraftsPage from '../src/pages/Orders/OrderDraftsPage';
import POSTerminal from '../src/pages/POS/POSTerminal';

const product = { id: 'ui-burger', sku: 'TEST', name: 'Test Burger', category: 'Meals', price: 100, salePrice: 100, purchasePrice: 50, stock: 20, minStock: 1, description: '', sellingType: 'quantity', productUnitCode: 'piece' };
let pending = [{ _id: 'ui-table-order', draftCode: 'TB-UI-TEST', digitalMenuTable: 'Table 1', items: [{ productId: product.id, productName: product.name, quantity: 2, unitPrice: 100 }], discountPercent: 0, orderType: 'dine_in', createdByName: 'QR Customer', createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' }];
pending.push({ ...structuredClone(pending[0]), _id: 'ui-table-2', draftCode: 'TB-UI-2', digitalMenuTable: 'Table 2', items: [{ productId: product.id, productName: product.name, quantity: 4, unitPrice: 100 }] });
pending.push({ ...structuredClone(pending[0]), _id: 'ui-manual', draftCode: 'DR-UI-POS', digitalMenuTable: '', createdByName: 'Cashier', items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: 100 }] });
// All requests in this page are isolated fixtures. Nothing is written to the service.
api.get = async (url) => {
    if (url === '/order-drafts') return { data: structuredClone(pending) };
    if (url.startsWith('/order-drafts/')) return { data: structuredClone(pending.find(order=>order._id===url.split('/').at(-1))) };
    if (url === '/products') return { data: [product] };
    if (url === '/categories') return { data: ['Meals'] };
    if (url === '/pos-shifts/current') return { data: { shift: null } };
    return { data: [] };
};
for (const method of ['post', 'put', 'delete', 'patch']) api[method] = async () => { throw new Error('Writes are disabled in this UI test'); };
const store = configureStore({ reducer: {
    inventory, transactions, orders, pos,
    auth: () => ({ user: { id: 'ui-staff', role: 'super_admin', name: 'UI Test' } }),
    settings: () => ({ currency: 'PKR', country: 'PK', app: { ...DEFAULT_APP_SETTINGS, restaurantEnabled: true } }),
} });
function Test() {
    const navigate = useNavigate();
    return <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Typography fontWeight={800}>Isolated UI test · sample data only</Typography>
            <Button onClick={() => navigate('/order-drafts')}>Test Order Drafts</Button><Button onClick={() => navigate('/orders')}>Test Order Desk</Button><Button onClick={() => navigate('/pos')}>Test POS</Button>
            <Button onClick={() => { pending[0].items[0].quantity = 3; pending[0].updatedAt = '2026-10-12T00:01:00.000Z'; window.dispatchEvent(new Event('itemhive-order-drafts-changed')); }}>Simulate more table items</Button>
            <Button onClick={() => { pending = pending.filter(order=>!order.digitalMenuTable); window.dispatchEvent(new Event('itemhive-order-drafts-changed')); }}>Simulate paid order</Button>
        </Stack>
        <Routes><Route path="/order-drafts" element={<OrderDraftsPage />} /><Route path="/orders" element={<OrderDesk />} /><Route path="/pos" element={<POSTerminal />} /></Routes>
    </Box>;
}
createRoot(document.getElementById('test-root')!).render(<Provider store={store}><ThemeProvider theme={createTheme({ palette: { primary: { main: '#0aa4a7' } } })}><CssBaseline /><MemoryRouter initialEntries={['/order-drafts']}><Test /></MemoryRouter></ThemeProvider></Provider>);
