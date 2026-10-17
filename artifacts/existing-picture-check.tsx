import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider, createTheme, CssBaseline, Box, Typography } from '@mui/material';
import ImportMenuButton from '../src/pages/DigitalMenus/ImportMenuButton';
import MenuBuilder from '../src/pages/DigitalMenus/MenuBuilder';
import { PLAIN_MENU_DESIGN } from '../src/pages/DigitalMenus/menuTemplates';
import { buildImportedMenu } from '../src/pages/DigitalMenus/oldMenuImport';
import api from '../src/api/axios';

import extraction from './extracted-picture-menu.json';
const sections = extraction.sections;
const products = sections.flatMap(section => section.items).map((item, index) => ({ id: `item-${index}`, name: item.name, price: item.price }));
products.push({ id: 'new-meal', name: 'Grilled Chicken Special', price: 16 });
api.post = async (url) => { if (url !== '/digital-menus/ai/import') throw new Error('Live writes disabled'); const file = await (await fetch('/artifacts/imported-menu-reference.jpg')).blob(); const picture = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); }); return { data: { ...extraction, picture, notes: 'UI check using the real Google AI extraction of your image. No live menu or inventory writes.' } }; };
const store = configureStore({ reducer: { auth: () => ({ user: { id: 'test', role: 'super_admin' } }), settings: () => ({ currency: 'PKR', app: { restaurantEnabled: true } }) } });
function Test() {
    const [menu, setMenu] = React.useState({ name: '', content: [], productIds: [], productPrices: {}, pageCount: 1, design: PLAIN_MENU_DESIGN });
    return <Box sx={{ p: 2, maxWidth: 1100, mx: 'auto' }}>
        <Typography sx={{ mb: 2 }}>UI verification with your uploaded image · no live inventory or menu changes</Typography>
        <pre hidden data-menu-test-state>{JSON.stringify(menu)}</pre>
        <ImportMenuButton products={products} productPrices={menu.productPrices} currentName={menu.name} loading={false} productsError={null} allowNewItems={false} onRetry={() => {}} onApply={async review => { setMenu(buildImportedMenu(review, menu.design, menu, products)); return undefined; }} />
        <Box sx={{ mt: 2 }}><MenuBuilder {...menu} products={products} loading={false} productsError={null} onRetry={() => {}} onNameChange={name => setMenu(value => ({ ...value, name }))} onChange={content => setMenu(value => ({ ...value, content }))} onProductsChange={productIds => setMenu(value => ({ ...value, productIds }))} onPricesChange={productPrices => setMenu(value => ({ ...value, productPrices }))} onPageCountChange={pageCount => setMenu(value => ({ ...value, pageCount }))} /></Box>
    </Box>;
}
createRoot(document.getElementById('test-root')!).render(<Provider store={store}><ThemeProvider theme={createTheme({ palette: { primary: { main: '#0aa4a7' } } })}><CssBaseline /><Test /></ThemeProvider></Provider>);
