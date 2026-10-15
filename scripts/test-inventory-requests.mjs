import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
let exportedWorkbook;
const cache = new Map();
function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    new Function('require', 'module', 'exports', outputText)(id => id === 'xlsx' ? { ...XLSX, writeFile: workbook => { exportedWorkbook = workbook; } } : load(id.replace('./', '')), module, module.exports);
    return module.exports;
}
const { downloadStockRequest } = load('inventoryRequestExports');
const { buildInvoicePdfBlob } = load('invoicePdf');
const request = {
    _id: 'request-123', createdAt: '2026-10-16T08:00:00Z', status: 'pending', requestedByName: 'Ali', requestedByEmail: 'ali@example.com',
    vendors: [{ id: 'v1', name: 'Vendor One', phone: '03001234567', address: 'Main Road' }, { id: 'v2', name: 'Vendor Two', phone: '', address: '' }],
    items: [{ productId: 'p1', name: 'Rice', sku: 'RICE', quantity: 12.5, unit: 'kg', vendorId: 'v1', remarks: 'Urgent' }, { productId: 'p2', name: 'Flour', sku: 'FLOUR', quantity: 2, unit: 'Bag', vendorId: 'v2', remarks: '' }],
};

test('Excel export contains request metadata, every vendor and numeric quantities with vendor assignments', async () => {
    await downloadStockRequest(request, 'xlsx');
    const workbook = XLSX.read(XLSX.write(exportedWorkbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, ['Request', 'Vendors', 'Required Stock']);
    const rows = name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
    assert.equal(rows('Request')[0][1], request._id);
    assert.deepEqual(rows('Vendors')[1], ['Vendor One', '03001234567', 'Main Road', '']);
    assert.equal(rows('Vendors').length, 3);
    assert.deepEqual(rows('Required Stock')[1], ['Rice', 'RICE', 12.5, 'kg', 'Vendor One', 'Urgent', 0, 12.5, '']);
    assert.equal(rows('Required Stock')[2][4], 'Vendor Two');
});

test('PDF export downloads a multipage PDF containing the final item and full long remarks', async t => {
    let blob;
    const anchor = { click() {}, href: '', download: '' };
    t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:test'; });
    t.mock.method(URL, 'revokeObjectURL', () => {});
    t.mock.method(globalThis, 'setTimeout', callback => { callback(); });
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => anchor };
    t.after(() => { globalThis.document = previousDocument; });
    const items = Array.from({ length: 40 }, (_, index) => ({ ...request.items[0], name: `Item ${index}`, remarks: index === 39 ? 'Long remarks end with IMPORTANTDETAIL' : '' }));
    await downloadStockRequest({ ...request, items }, 'pdf');
    assert.equal(anchor.download, 'inventory_request_request-123.pdf');
    const pdf = await blob.text();
    assert.ok(pdf.startsWith('%PDF-1.4'));
    assert.ok(Number(pdf.match(/\/Count (\d+)/)[1]) > 1);
    assert.ok(pdf.includes('Item 39'));
    const renderedText = [...pdf.matchAll(/\(([^)]*)\) Tj/g)].map(match => match[1]).join('');
    for (const phrase of ['Long remarks', 'end with', 'IMPORTANTDET', 'AIL']) assert.ok(renderedText.includes(phrase));
    assert.ok(pdf.includes('03001234567'));
    assert.ok(pdf.endsWith('%%EOF'));
});

test('shared invoice writer still generates a valid single-page document by default', async () => {
    const blob = await buildInvoicePdfBlob({ title: 'Invoice', shop: { name: 'Shop' }, columns: [{ label: 'Item', width: 1 }], rows: [['Rice']] });
    const pdf = await blob.text();
    assert.ok(pdf.includes('/Count 1'));
    assert.ok(pdf.includes('(Rice)'));
    const pageRefs = pdf.match(/\/Kids \[([^\]]+)\]/)[1].match(/\d+ 0 R/g);
    for (const ref of pageRefs) assert.ok(pdf.includes(`${ref.replace(' R', ' obj')}\n<< /Type /Page `));
});

test('Excel export includes optional vendor CNIC and partial delivery quantities', async () => {
    await downloadStockRequest({ ...request, deliveryStatus: 'partial', vendors: [{ ...request.vendors[0], cnic: '12345-1234567-1' }], items: [{ ...request.items[0], receivedQuantity: 2.5 }] }, 'xlsx');
    assert.equal(XLSX.utils.sheet_to_json(exportedWorkbook.Sheets.Vendors, { header: 1 })[1][3], '12345-1234567-1');
    const stock = XLSX.utils.sheet_to_json(exportedWorkbook.Sheets['Required Stock'], { header: 1 });
    assert.deepEqual(stock[1].slice(6, 8), [2.5, 10]);
    const meta = XLSX.utils.sheet_to_json(exportedWorkbook.Sheets.Request, { header: 1 });
    assert.equal(meta.find(row => row[0] === 'Delivery status')[1], 'partial');
});

test('custom raw material exports preserve manually entered names and units without a SKU', async () => {
    await downloadStockRequest({ ...request, items: [{ name: 'Burger buns', unit: 'dozen', quantity: 5, receivedQuantity: 2, vendorId: 'v1', remarks: 'Sesame' }] }, 'xlsx');
    const rows = XLSX.utils.sheet_to_json(exportedWorkbook.Sheets['Required Stock'], { header: 1 });
    assert.deepEqual(rows[1], ['Burger buns', '', 5, 'dozen', 'Vendor One', 'Sesame', 2, 3, '']);
});

test('unit selection autofills a single option, preserves valid choices and clears incompatible categories', () => {
    const { unitForCategory } = load('requestCategoryUnits');
    assert.equal(unitForCategory({ name: 'Buns', units: ['pcs'] }), 'pcs');
    assert.equal(unitForCategory({ name: 'Meat', units: ['kg', 'g'] }, 'kg'), 'kg');
    assert.equal(unitForCategory({ name: 'Meat', units: ['kg', 'g'] }, 'pcs'), '');
    assert.equal(unitForCategory(undefined, 'pcs'), '');
});

test('category and its bound unit are retained in stock request exports', async () => {
    await downloadStockRequest({ ...request, items: [{ name: 'Chicken', category: 'Chicken / Meat', unit: 'kg', quantity: 5, receivedQuantity: 2, vendorId: 'v1', remarks: '' }] }, 'xlsx');
    const rows = XLSX.utils.sheet_to_json(exportedWorkbook.Sheets['Required Stock'], { header: 1 });
    assert.equal(rows[1][3], 'kg'); assert.equal(rows[1][8], 'Chicken / Meat');
});

test('optional product linking enforces matching units and supports fractional measured stock only', () => {
    const { productLinkError } = load('inventoryProductLinks');
    const product = { id: 'buns', name: 'Buns', productUnit: 'Piece' };
    assert.equal(productLinkError(undefined, { unit: 'kg', quantity: 2.5 }), '');
    assert.equal(productLinkError(product, { productId: 'buns', unit: 'pcs', quantity: 80 }), '');
    assert.match(productLinkError(product, { productId: 'buns', unit: 'kg', quantity: 80 }), /matching/);
    assert.match(productLinkError(product, { productId: 'buns', unit: 'pcs', quantity: 2.5 }), /whole/);
    assert.equal(productLinkError({ ...product, unitSizeEnabled: true, sellingType: 'quantity', productUnit: 'Kilogram' }, { productId: 'buns', unit: 'kg', quantity: 2.5 }), '');
});
