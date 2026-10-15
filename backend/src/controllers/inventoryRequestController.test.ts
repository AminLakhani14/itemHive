import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import InventoryRequest from '../models/InventoryRequest';
import Product from '../models/Product';
import InventoryVendors from '../models/InventoryVendors';
import InventoryMaterial, { materialKey } from '../models/InventoryMaterial';
import InventoryRequestReceipt from '../models/InventoryRequestReceipt';
import { validateInventoryProductLink } from '../utils/inventoryProductLink';
import * as categoryUnitsService from '../services/requestCategoryUnits';
import { mergeRequestCategories, normalizeRequestUnits } from '../utils/requestCategoryUnits';
import { createRestockRequest, reviewInventoryRequest, receiveInventoryRequest, saveInventoryVendors, getInventoryRequestHistory } from './inventoryRequestController';
import { restockRequestSchema, inventoryVendorsSchema } from '../middleware/validate';
import { receiptChanges } from '../utils/inventoryReceiving';
import type { AuthRequest } from '../middleware/auth';
import type { Response } from 'express';

const actor = { id: '507f1f77bcf86cd799439011', businessId: '507f1f77bcf86cd799439012', businessIsLegacy: false, name: 'Test User', email: 'test@example.com' };
const body = () => ({ vendors: [{ id: 'v1', name: 'Vendor', phone: '12345', address: 'Main Road' }], items: [{ productId: 'p1', quantity: 12.5, vendorId: 'v1', remarks: 'Urgent' }] });
const response = () => {
    const result = { status: 200, body: undefined as any };
    const res = { status: (status: number) => { result.status = status; return res; }, json: (value: unknown) => { result.body = value; return res; } } as unknown as Response;
    return { result, res };
};
const request = (value = body()) => ({ user: actor, body: value, params: { id: '507f1f77bcf86cd799439013' } }) as unknown as AuthRequest;

const captureReceipts = (t: TestContext) => {
    const receipts: any[] = [];
    t.mock.method(InventoryRequestReceipt, 'create', async (events: any[], options: any) => {
        assert.ok(options.session);
        for (const event of events) { await new InventoryRequestReceipt(event).validate(); receipts.push(event); }
        return events;
    });
    return receipts;
};

test('stock requests reject invalid quantities, duplicate vendor IDs and empty sections', () => {
    assert.equal(restockRequestSchema.validate(body()).error, undefined);
    for (const quantity of [0, -1, Infinity, NaN, 1e10]) {
        const value = body(); value.items[0].quantity = quantity;
        assert.ok(restockRequestSchema.validate(value).error);
    }
    const duplicate = body(); duplicate.vendors.push(duplicate.vendors[0]);
    assert.ok(restockRequestSchema.validate(duplicate).error);
    assert.ok(restockRequestSchema.validate({ vendors: [], items: [] }).error);
});

test('stock requests snapshot tenant-owned product details and persist without productData', async t => {
    t.mock.method(InventoryVendors, 'findOne', () => ({ lean: async () => ({ vendors: body().vendors }) }));
    t.mock.method(Product, 'find', (filter: any) => {
        assert.equal(String(filter.businessId), actor.businessId);
        assert.deepEqual(filter.id.$in, ['p1']);
        return { lean: async () => [{ id: 'p1', name: 'Rice', sku: 'RICE', productUnit: 'kg', unitSizeEnabled: true, sellingType: 'quantity' }] };
    });
    let saved: any;
    t.mock.method(InventoryRequest.prototype, 'save', async function (this: any) { await this.validate(); saved = this.toObject(); return this; });
    const { res, result } = response();
    await createRestockRequest(request(), res);
    assert.equal(result.status, 201);
    assert.equal(saved.requestType, 'restock'); assert.equal(saved.productData, undefined);
    assert.equal(saved.items[0].name, 'Rice'); assert.equal(saved.items[0].quantity, 12.5); assert.equal(saved.items[0].unit, 'kg');
    assert.equal(String(saved.businessId), actor.businessId);
});

test('stock requests reject unrelated vendors and products outside the workspace', async t => {
    t.mock.method(InventoryVendors, 'findOne', () => ({ lean: async () => ({ vendors: body().vendors }) }));
    t.mock.method(Product, 'find', () => ({ lean: async () => [] }));
    let saves = 0;
    t.mock.method(InventoryRequest.prototype, 'save', async () => { saves++; });
    const badVendor = body(); badVendor.items[0].vendorId = 'foreign';
    const first = response(); await createRestockRequest(request(badVendor), first.res); assert.equal(first.result.status, 400);
    const second = response(); await createRestockRequest(request(), second.res); assert.equal(second.result.status, 400);
    assert.equal(saves, 0);
});

test('approving a stock request records approval without creating or incrementing inventory', async t => {
    let committed = false;
    t.mock.method(mongoose, 'startSession', async () => ({ startTransaction() {}, async commitTransaction() { committed = true; }, async abortTransaction() {}, endSession() {} }));
    const document = new InventoryRequest({ requestType: 'restock', ...body(), requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email });
    t.mock.method(InventoryRequest, 'findOne', (filter: any) => { assert.equal(String(filter.businessId), actor.businessId); return { session: async () => document }; });
    t.mock.method(InventoryRequest.prototype, 'save', async function (this: any) { await this.validate(); return this; });
    t.mock.method(Product, 'findOne', () => { throw new Error('Approval must not touch products'); });
    const req = request(); req.body = { status: 'approved', decisionNote: 'Order these items' };
    const { res, result } = response(); await reviewInventoryRequest(req, res);
    assert.equal(result.status, 200); assert.equal(document.status, 'approved'); assert.equal(document.reviewedByName, actor.name); assert.ok(committed);
});

test('legacy product requests still require product details', async () => {
    const document = new InventoryRequest({ requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email });
    await assert.rejects(document.validate(), /productData/);
});

test('legacy product approval preserves product fields when constructing inventory', async t => {
    t.mock.method(mongoose, 'startSession', async () => ({ startTransaction() {}, async commitTransaction() {}, async abortTransaction() {}, endSession() {} }));
    const productData = { id: 'legacy-p1', sku: 'LEGACY', name: 'Legacy Product', category: 'General', purchasePrice: 5, salePrice: 10, price: 10, stock: 5, minStock: 1 };
    const document = new InventoryRequest({ requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email, productData });
    t.mock.method(InventoryRequest, 'findOne', () => ({ session: async () => document }));
    t.mock.method(Product, 'findOne', () => ({ session: async () => null }));
    let product: any;
    t.mock.method(Product.prototype, 'save', async function (this: any) { await this.validate(); product = this.toObject(); return this; });
    t.mock.method(InventoryRequest.prototype, 'save', async function (this: any) { await this.validate(); return this; });
    const req = request(); req.body = { status: 'approved' };
    const { res, result } = response(); await reviewInventoryRequest(req, res);
    assert.equal(result.status, 200); assert.equal(product.id, productData.id); assert.equal(product.stock, 5); assert.equal(product.name, productData.name);
});

test('new stock requests require independently saved vendors', async t => {
    t.mock.method(InventoryVendors, 'findOne', () => ({ lean: async () => null }));
    const { res, result } = response(); await createRestockRequest(request(), res);
    assert.equal(result.status, 400); assert.match(result.body.message, /Save vendor details/);
});

test('archived vendors remain historical records but cannot be used for new orders', async t => {
    t.mock.method(InventoryVendors, 'findOne', () => ({ lean: async () => ({ vendors: [{ ...body().vendors[0], archived: true }] }) }));
    const { res, result } = response(); await createRestockRequest(request(), res);
    assert.equal(result.status, 400);
});

test('optional CNIC accepts blank, compact and formatted values and rejects malformed input', () => {
    for (const cnic of ['', '1234512345671', '12345-1234567-1']) assert.equal(inventoryVendorsSchema.validate({ vendors: [{ ...body().vendors[0], cnic }], version: 0 }).error, undefined);
    for (const cnic of ['123', 'abc', '12345-1234567-X']) assert.ok(inventoryVendorsSchema.validate({ vendors: [{ ...body().vendors[0], cnic }], version: 0 }).error);
});

test('obsolete whole-directory saves cannot overwrite the individual vendor records', async t => {
    t.mock.method(InventoryVendors, 'findOneAndUpdate', async () => { assert.fail('Legacy forms must not replace the directory'); });
    const req = request(); req.body = { vendors: body().vendors, version: 3 };
    const { res, result } = response(); await saveInventoryVendors(req, res); assert.equal(result.status, 409); assert.match(result.body.message, /Vendors screen/);
});

test('receipt calculations track none, partial, complete and reject overdelivery or reductions', () => {
    const items = [{ quantity: 8, receivedQuantity: 2 }, { quantity: 5, receivedQuantity: 0 }];
    assert.deepEqual(receiptChanges(items, [3, 0]), { deltas: [1, 0], deliveryStatus: 'partial' });
    assert.deepEqual(receiptChanges(items, [8, 5]), { deltas: [6, 5], deliveryStatus: 'complete' });
    assert.deepEqual(receiptChanges([{ quantity: 3 }], [0]), { deltas: [0], deliveryStatus: 'not_received' });
    for (const received of [[1, 0], [9, 0], [3], [NaN, 0], [3, -1]]) assert.throws(() => receiptChanges(items, received));
});

test('partial deliveries add only new stock; repeated totals add nothing; stale retries cannot add stock', async t => {
    const receipts = captureReceipts(t);
    const session = { async withTransaction(callback: () => Promise<void>) { await callback(); }, async endSession() {} };
    t.mock.method(mongoose, 'startSession', async () => session);
    const document = new InventoryRequest({ requestType: 'restock', requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email, ...body(), items: [{ productId: 'p1', quantity: 8, receivedQuantity: 0 }], __v: 0 });
    t.mock.method(InventoryRequest, 'findOne', (filter: any) => {
        assert.equal(String(filter.businessId), actor.businessId); assert.equal(filter.requestedBy, actor.id);
        return { session: async () => document };
    });
    t.mock.method(Product, 'findOne', () => ({ session: async () => ({ _id: '507f1f77bcf86cd799439020', name: 'Rice', unitSizeEnabled: true, sellingType: 'quantity' }) }));
    const increments: number[] = [];
    t.mock.method(Product, 'updateOne', async (filter: any, update: any, options: any) => { assert.equal(String(filter.businessId), actor.businessId); assert.equal(options.session, session); increments.push(update.$inc.stock); return { modifiedCount: 1 }; });
    t.mock.method(InventoryRequest, 'findOneAndUpdate', async (filter: any, update: any, options: any) => {
        assert.equal(options.session, session); assert.equal(filter.__v, document.__v);
        document.set(update.$set); document.__v += 1; return document;
    });
    const receive = async (quantity: number, version: number) => {
        const req = request(); req.user!.role = 'user'; req.body = { receivedQuantities: [quantity], version };
        const result = response(); await receiveInventoryRequest(req, result.res); return result.result;
    };
    assert.equal((await receive(3, 0)).status, 200); assert.equal(document.deliveryStatus, 'partial');
    assert.equal((await receive(5, 1)).status, 200);
    assert.equal((await receive(5, 2)).status, 200);
    assert.equal((await receive(8, 1)).status, 409);
    assert.deepEqual(increments, [3, 2]);
    assert.equal((await receive(8, 3)).status, 200); assert.equal(document.deliveryStatus, 'complete');
    assert.deepEqual(increments, [3, 2, 3]);
    assert.equal(receipts.length, 3);
    assert.deepEqual(receipts.map(receipt => receipt.items[0].quantity), [3, 2, 3]);
    assert.deepEqual(receipts.map(receipt => receipt.items[0].remaining), [5, 3, 0]);
    assert.equal(receipts[0].items[0].stockAction, 'product_updated');
});

test('variant receipts increment both the selected variant and aggregate stock in the same transaction', async t => {
    captureReceipts(t);
    const session = { async withTransaction(callback: () => Promise<void>) { await callback(); }, async endSession() {} };
    t.mock.method(mongoose, 'startSession', async () => session);
    const document = new InventoryRequest({ requestType: 'restock', requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email, items: [{ productId: 'p1', sizeId: 'large', quantity: 4, receivedQuantity: 1 }], __v: 0 });
    t.mock.method(InventoryRequest, 'findOne', () => ({ session: async () => document }));
    t.mock.method(Product, 'findOne', () => ({ session: async () => ({ _id: '507f1f77bcf86cd799439020', name: 'Pack', unitSizeEnabled: true, sellingType: 'fixed', sizes: [{ id: 'large' }] }) }));
    let increments;
    t.mock.method(Product, 'updateOne', async (filter: any, update: any) => { assert.equal(filter['sizes.id'], 'large'); increments = update.$inc; return { modifiedCount: 1 }; });
    t.mock.method(InventoryRequest, 'findOneAndUpdate', async () => document);
    const req = request(); req.body = { receivedQuantities: [3], version: 0 };
    const { res, result } = response(); await receiveInventoryRequest(req, res);
    assert.equal(result.status, 200); assert.deepEqual(increments, { stock: 2, 'sizes.$.stock': 2 });
});

test('unavailable or rejected requests never update inventory', async t => {
    t.mock.method(mongoose, 'startSession', async () => ({ async withTransaction(callback: () => Promise<void>) { await callback(); }, async endSession() {} }));
    let document: any = null;
    t.mock.method(InventoryRequest, 'findOne', () => ({ session: async () => document }));
    t.mock.method(Product, 'updateOne', async () => { assert.fail('Inventory must not change'); });
    const req = request(); req.body = { receivedQuantities: [1], version: 0 };
    const missing = response(); await receiveInventoryRequest(req, missing.res); assert.equal(missing.result.status, 400);
    document = { status: 'rejected' };
    const rejected = response(); await receiveInventoryRequest(req, rejected.res); assert.equal(rejected.result.status, 400);
});

test('free-text material orders accept custom names, units and fractional quantities without inventory IDs', () => {
    const input = { vendors: body().vendors, items: [{ name: 'Chicken boneless', unit: 'kg', quantity: 2.5, vendorId: 'v1' }] };
    const parsed = restockRequestSchema.validate(input);
    assert.equal(parsed.error, undefined); assert.equal(parsed.value.items[0].name, 'Chicken boneless');
    for (const missing of ['name', 'unit']) {
        const invalid: any = structuredClone(input); delete invalid.items[0][missing];
        assert.ok(restockRequestSchema.validate(invalid).error);
    }
    assert.equal(materialKey('  Chicken   BONELESS '), 'chicken boneless');
});

test('custom materials save without a product lookup or product ID', async t => {
    t.mock.method(InventoryVendors, 'findOne', () => ({ lean: async () => ({ vendors: body().vendors }) }));
    t.mock.method(Product, 'find', () => { assert.fail('Material names must not be matched to sale products'); });
    let saved: any;
    t.mock.method(InventoryRequest.prototype, 'save', async function (this: any) { await this.validate(); saved = this.toObject(); return this; });
    const req = request(); req.body = { vendors: body().vendors, items: [{ name: 'Burger buns', unit: 'pcs', quantity: 50, vendorId: 'v1', remarks: '' }, { name: 'Chicken', unit: 'kg', quantity: 2.5, vendorId: 'v1', remarks: '' }] };
    const { res, result } = response(); await createRestockRequest(req, res);
    assert.equal(result.status, 201); assert.equal(saved.items[0].name, 'Burger buns'); assert.equal(saved.items[0].productId, undefined);
    assert.equal(saved.items[1].unit, 'kg'); assert.equal(saved.items[1].quantity, 2.5);
});

test('unlinked receipts preserve receiving history without updating or creating stock', async t => {
    const receipts = captureReceipts(t);
    const session = { async withTransaction(callback: () => Promise<void>) { await callback(); }, async endSession() {} };
    t.mock.method(mongoose, 'startSession', async () => session);
    const document = new InventoryRequest({ requestType: 'restock', requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email, items: [{ name: ' Chicken ', unit: ' KG ', quantity: 5, receivedQuantity: 1 }], __v: 0 });
    t.mock.method(InventoryRequest, 'findOne', () => ({ session: async () => document }));
    t.mock.method(Product, 'findOne', () => { assert.fail('Receiving materials must not update finished products'); });
    t.mock.method(InventoryMaterial, 'updateOne', async () => { assert.fail('Unlinked items must be record-only'); });
    t.mock.method(Product.prototype, 'save', async () => { assert.fail('A new product must never be created'); });
    t.mock.method(InventoryRequest, 'findOneAndUpdate', async (_: any, update: any) => { document.set(update.$set); document.__v += 1; return document; });
    for (const [version, total] of [[0, 2.5], [1, 2.5], [2, 5]]) {
        const req = request(); req.body = { receivedQuantities: [total], version };
        const { res, result } = response(); await receiveInventoryRequest(req, res); assert.equal(result.status, 200);
    }
    assert.equal(document.deliveryStatus, 'complete');
    assert.equal(receipts[0].kind, 'opening_balance'); assert.equal(receipts[0].items[0].quantity, 1);
    assert.equal(receipts[1].items[0].quantity, 1.5); assert.equal(receipts[1].items[0].stockAction, 'record_only');
    assert.equal(receipts[2].items[0].quantity, 2.5); assert.equal(receipts.length, 3);
    assert.equal(String(receipts[1].businessId), actor.businessId);
});

test('product links require matching units and valid variants and support canonical unit aliases', () => {
    const product: any = { name: 'Buns', productUnit: 'Piece', unitSizeEnabled: false };
    assert.equal(validateInventoryProductLink(product, { unit: 'pcs', quantity: 5 }).unit, 'Piece');
    assert.throws(() => validateInventoryProductLink(product, { unit: 'kg', quantity: 5 }), /Unit does not match/);
    assert.throws(() => validateInventoryProductLink(product, { unit: 'pcs', quantity: 2.5 }), /whole quantities/);
    assert.throws(() => validateInventoryProductLink({ ...product, unitSizeEnabled: true, sellingType: 'fixed', sizes: [{ id: 'large' }] }, { unit: 'Pack', quantity: 2 }), /variant/);
});

test('linking an existing order updates only future receipts and preserves vendor, manual item name and reference', async t => {
    const receipts = captureReceipts(t);
    const session = { async withTransaction(callback: () => Promise<void>) { await callback(); }, async endSession() {} };
    t.mock.method(mongoose, 'startSession', async () => session);
    const document = new InventoryRequest({ requestType: 'restock', requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email, vendors: body().vendors, items: [{ name: 'Burger buns', vendorId: 'v1', unit: 'pcs', quantity: 100, receivedQuantity: 80 }], __v: 0 });
    t.mock.method(InventoryRequest, 'findOne', () => ({ session: async () => document }));
    t.mock.method(Product, 'findOne', (filter: any) => {
        assert.equal(String(filter.businessId), actor.businessId); assert.equal(filter.id, 'buns-product');
        return { session: async () => ({ _id: '507f1f77bcf86cd799439020', sku: 'BUNS', name: 'Fresh Buns', productUnit: 'Piece' }) };
    });
    let increment = 0;
    t.mock.method(Product, 'updateOne', async (_: any, update: any) => { increment += update.$inc.stock; return { modifiedCount: 1 }; });
    t.mock.method(InventoryRequest, 'findOneAndUpdate', async (_: any, update: any) => { document.set(update.$set); document.__v += 1; return document; });
    const req = request(); req.body = { receivedQuantities: [100], version: 0, links: [{ productId: 'buns-product' }], reference: 'INV-555', note: 'Remaining delivery' };
    const { res, result } = response(); await receiveInventoryRequest(req, res);
    assert.equal(result.status, 200); assert.equal(increment, 20); assert.equal(document.items[0].name, 'Burger buns');
    assert.equal(receipts[0].kind, 'opening_balance'); assert.equal(receipts[0].items[0].quantity, 80);
    assert.equal(receipts[1].reference, 'INV-555'); assert.equal(receipts[1].items[0].quantity, 20);
    assert.equal(receipts[1].items[0].productName, 'Fresh Buns'); assert.equal(receipts[1].items[0].vendorName, 'Vendor');
});

test('history access is scoped to the workspace and staff member who owns the order', async t => {
    let found = true;
    t.mock.method(InventoryRequest, 'findOne', (filter: any) => {
        assert.equal(String(filter.businessId), actor.businessId); assert.equal(filter.requestedBy, actor.id);
        return { lean: async () => found ? { _id: request().params.id } : null };
    });
    t.mock.method(InventoryRequestReceipt, 'find', (filter: any) => {
        assert.equal(String(filter.businessId), actor.businessId); assert.equal(String(filter.requestId), String(request().params.id));
        return { sort: () => ({ lean: async () => [{ kind: 'delivery', items: [] }] }) };
    });
    const req = request(); req.user!.role = 'user';
    const first = response(); await getInventoryRequestHistory(req, first.res); assert.equal(first.result.status, 200); assert.equal(first.result.body.receipts.length, 1);
    found = false; const second = response(); await getInventoryRequestHistory(req, second.res); assert.equal(second.result.status, 404);
});

test('receipt persistence failure aborts the same transaction used for inventory changes', async t => {
    let aborted = false;
    const session = { async withTransaction(callback: () => Promise<void>) { try { await callback(); } catch (error) { aborted = true; throw error; } }, async endSession() {} };
    t.mock.method(mongoose, 'startSession', async () => session);
    const document = new InventoryRequest({ requestType: 'restock', requestedBy: actor.id, requestedByName: actor.name, requestedByEmail: actor.email, items: [{ name: 'Buns', productId: 'p1', unit: 'pcs', quantity: 100, receivedQuantity: 0 }], __v: 0 });
    t.mock.method(InventoryRequest, 'findOne', () => ({ session: async () => document }));
    t.mock.method(Product, 'findOne', () => ({ session: async () => ({ _id: '507f1f77bcf86cd799439020', name: 'Buns', productUnit: 'Piece' }) }));
    t.mock.method(Product, 'updateOne', async (_: any, __: any, options: any) => { assert.equal(options.session, session); return { modifiedCount: 1 }; });
    t.mock.method(InventoryRequestReceipt, 'create', async (_: any, options: any) => { assert.equal(options.session, session); throw new Error('Receipt unavailable'); });
    t.mock.method(InventoryRequest, 'findOneAndUpdate', async () => { assert.fail('Failed receipts must not complete an order update'); });
    const req = request(); req.body = { version: 0, receivedQuantities: [80] };
    const { res, result } = response(); await receiveInventoryRequest(req, res);
    assert.equal(result.status, 400); assert.ok(aborted);
});

test('category unit lists preserve saved bindings, exclude archived categories and validate custom units', () => {
    const categories = mergeRequestCategories([
        { name: 'Chicken / Meat', normalizedName: 'chicken / meat', requestUnits: ['kg'] },
        { name: 'Buns / Bread', normalizedName: 'buns / bread', archived: true },
        { name: 'Custom Category', normalizedName: 'custom category', requestUnits: ['Bundle'] },
    ], ['Groceries']);
    assert.deepEqual(categories.find(category => category.name === 'Chicken / Meat')?.units, ['kg']);
    assert.equal(categories.some(category => category.name === 'Buns / Bread'), false);
    assert.deepEqual(categories.find(category => category.name === 'Custom Category')?.units, ['Bundle']);
    assert.ok(categories.find(category => category.name === 'Groceries')?.units.includes('kg'));
    assert.deepEqual(normalizeRequestUnits([' kg ', 'KG', 'box']), ['KG', 'box']);
    for (const invalid of [null, [], [''], [3], Array(31).fill('kg')]) assert.throws(() => normalizeRequestUnits(invalid));
});

test('material requests persist the selected category and reject units outside its binding', async t => {
    t.mock.method(InventoryVendors, 'findOne', () => ({ lean: async () => ({ vendors: body().vendors }) }));
    t.mock.method(categoryUnitsService, 'getRequestCategoryUnits', async (tenant: any) => {
        assert.equal(tenant.businessId, actor.businessId);
        return [{ name: 'Chicken / Meat', units: ['kg', 'g'] }, { name: 'Buns / Bread', units: ['pcs'] }];
    });
    let saved: any;
    t.mock.method(InventoryRequest.prototype, 'save', async function (this: any) { await this.validate(); saved = this.toObject(); return this; });
    const req = request(); req.body = { vendors: body().vendors, items: [{ name: 'Boneless chicken', category: 'Chicken / Meat', unit: 'kg', quantity: 3.5, vendorId: 'v1', remarks: '' }] };
    const first = response(); await createRestockRequest(req, first.res);
    assert.equal(first.result.status, 201); assert.equal(saved.items[0].category, 'Chicken / Meat'); assert.equal(saved.items[0].unit, 'kg');
    saved = undefined; req.body.items[0].unit = 'pcs';
    const second = response(); await createRestockRequest(req, second.res);
    assert.equal(second.result.status, 400); assert.equal(saved, undefined);
    req.body.items[0].category = 'Unknown';
    const third = response(); await createRestockRequest(req, third.res); assert.equal(third.result.status, 400);
});
