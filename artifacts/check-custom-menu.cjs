const fs = require('node:fs');
const path = require('node:path');
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env'), quiet: true });
require('../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../backend/.env.local'), quiet: true, override: true });
const { suggestInventoryMenu } = require('../backend/dist/services/inventoryMenuAI');
global.fetch = (url, options) => new Promise((resolve, reject) => {
    const child = require('node:child_process').execFile('powershell', ['-NoProfile', '-File', path.resolve(__dirname, 'menu-ai-transport.ps1'), url], { maxBuffer: 1_000_000 }, (error, output) => {
        if (error) return reject(new Error('Unable to reach Google AI'));
        try { const result = JSON.parse(output); resolve(new Response(result.body, { status: result.status })); } catch { reject(new Error('Invalid verification transport response')); }
    });
    child.stdin.end(JSON.stringify({ key: options.headers['x-goog-api-key'], body: options.body }));
});
const inventory = [
    { id: 'pizza', name: 'Chicken Pizza', category: 'Meals', price: 800 },
    { id: 'burger', name: 'Beef Burger', category: 'Meals', price: 450 },
    { id: 'fries', name: 'French Fries', category: 'Sides', price: 200 },
    { id: 'cola', name: 'Cola', category: 'Drinks', price: 100 },
    { id: 'lemonade', name: 'Lemonade', category: 'Drinks', price: 150 },
];
const currentDesign = { templateId: 'custom', backgroundColor: '#ffffff', textColor: '#20221f', accentColor: '#20221f', headerColor: '#ffffff', surfaceColor: '#ffffff', fontStyle: 'sans', layout: 'list', showImages: false, visualStyle: 'classic', decoration: 'none', sectionColumns: 1 };
(async () => {
    const unbranded = await suggestInventoryMenu(inventory, { menuName: '', brief: '', existingSections: [], includeDeals: false, includeStyle: true, currentDesign, brand: { name: '', theme: '', logo: '', colors: [] } });
    fs.writeFileSync(path.resolve(__dirname, 'custom-menu-unbranded.json'), JSON.stringify(unbranded));
    console.log(JSON.stringify({ scenario: 'No theme or logo', style: unbranded.style, name: unbranded.menuName, headings: unbranded.headings }));
    const branded = await suggestInventoryMenu(inventory, { menuName: 'Cafe favorites', brief: 'Use a modern menu with a cream background #fff8ed and dark brown text #222222.', existingSections: [], includeDeals: false, includeStyle: true, currentDesign, brand: { name: 'Cafe', theme: 'Saved restaurant theme: accent #783925, background #fff8ed, text #222222.', colors: ['#783925', '#fff8ed', '#222222'], logo: '' } });
    fs.writeFileSync(path.resolve(__dirname, 'custom-menu-branded.json'), JSON.stringify(branded));
    console.log(JSON.stringify({ scenario: 'Saved theme without logo', style: branded.style, name: branded.menuName, headings: branded.headings }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
