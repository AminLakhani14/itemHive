import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Transaction from '../models/Transaction';
import POSShift from '../models/POSShift';
import * as tenancy from '../utils/tenancy';
import * as payrollService from '../services/payrollService';
import { createPOSCheckout } from './transactionController';
import type { AuthRequest } from '../middleware/auth';
import type { Response } from 'express';
import OrderDraft from '../models/OrderDraft';
import { createOrderDraft } from './orderDraftController';

test('checkout bills decimal units and separate sizes, guards stock and stores size metadata', async (t) => {
    const products = [
        { _id: 'sugar-id', id: 'sugar', name: 'Sugar', unitSizeEnabled: true, sellingType: 'quantity', productUnit: 'Kg', purchasePrice: 120, salePrice: 160, stock: 50 },
        { _id: 'pepsi-id', id: 'pepsi', name: 'Pepsi', unitSizeEnabled: true, sellingType: 'fixed', productUnit: 'Liter', purchasePrice: 70, salePrice: 100, stock: 16, sizes: [
            { id: 'small', size: 0.5, purchasePrice: 70, salePrice: 100, stock: 10 },
            { id: 'large', size: 1.5, purchasePrice: 150, salePrice: 200, stock: 6 },
        ] },
    ];
    let lines: any[] = [];
    let operations: any[] = [];
    const session = { withTransaction: async (callback: () => Promise<void>) => callback(), endSession: async () => {} };
    t.mock.method(mongoose, 'startSession', async () => session);
    t.mock.method(tenancy, 'getCachedAppSettingsForTenant', async () => ({ discountsEnabled: false, salesTaxRate: 0 }));
    t.mock.method(payrollService, 'salesPerson', async () => ({}));
    t.mock.method(payrollService, 'recordCommission', async () => {});
    t.mock.method(POSShift, 'updateOne', async () => ({ modifiedCount: 1 }));
    t.mock.method(Product, 'find', () => ({ select: () => ({ session: () => ({ lean: async () => products }) }) }));
    t.mock.method(Transaction, 'insertMany', async (documents: any[]) => { lines = documents; return documents; });
    t.mock.method(Transaction, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
    t.mock.method(Product, 'bulkWrite', async (updates: any[]) => { operations = updates; return { modifiedCount: updates.length }; });
    let status = 200;
    let payload: any;
    const res = { setHeader: () => {}, status: (value: number) => { status = value; return res; }, json: (value: any) => { payload = value; return res; } } as unknown as Response;
    const req = { user: { role: 'user', name: 'Cashier', businessId: new mongoose.Types.ObjectId() }, body: { orderId: 'ORDER', shiftId: String(new mongoose.Types.ObjectId()), paymentMethod: 'cash', items: [
        { productId: 'sugar', quantity: 0.5 }, { productId: 'pepsi', sizeId: 'small', quantity: 2 }, { productId: 'pepsi', sizeId: 'large', quantity: 1 },
    ] } } as unknown as AuthRequest;
    await createPOSCheckout(req, res);
    assert.equal(status, 201);
    assert.deepEqual(lines.map(line => line.totalPrice), [80, 200, 200]);
    assert.equal(lines[1].sizeId, 'small');
    assert.equal(lines[1].unitCost, 70);
    assert.equal(lines[2].unitCost, 150);
    assert.equal(lines[1].productName, 'Pepsi — 0.5 Liter × 2');
    assert.deepEqual(operations[0].updateOne.update[0].$set.stock, { $toDouble: { $subtract: [{ $toDecimal: '$stock' }, { $toDecimal: 0.5 }] } });
    assert.equal(operations[1].updateOne.update.$inc['sizes.$.stock'], -2);
    assert.deepEqual(operations[1].updateOne.filter.sizes, { $elemMatch: { id: 'small', stock: { $gte: 2 } } });
    for (const items of [
        [{ productId: 'pepsi', sizeId: 'small', quantity: 11 }],
        [{ productId: 'pepsi', quantity: 1 }],
        [{ productId: 'pepsi', sizeId: 'small', quantity: 0.5 }],
        [{ productId: 'pepsi', sizeId: 'small', quantity: 1, unitPrice: 1 }],
        [{ productId: 'sugar', quantity: 1 }, { productId: 'sugar', quantity: 2 }],
    ]) {
        req.body.items = items;
        await createPOSCheckout(req, res);
        assert.equal(status, 400, JSON.stringify(items));
        assert.ok(payload.message);
    }
});

test('drafts preserve fractional quantities and independent size selections', async (t) => {
    const products = [
        { id: 'fabric', name: 'Fabric', unitSizeEnabled: true, sellingType: 'quantity', productUnit: 'Meter', purchasePrice: 80, salePrice: 100, stock: 20 },
        { id: 'pepsi', name: 'Pepsi', unitSizeEnabled: true, sellingType: 'fixed', productUnit: 'Liter', purchasePrice: 70, salePrice: 100, stock: 16, sizes: [
            { id: 'small', size: 0.5, purchasePrice: 70, salePrice: 100, stock: 10 },
            { id: 'large', size: 1.5, purchasePrice: 150, salePrice: 200, stock: 6 },
        ] },
    ];
    t.mock.method(tenancy, 'getCachedAppSettingsForTenant', async () => ({ discountsEnabled: false, orderTypeOptions: [] }));
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => products }) }));
    let saved: any;
    t.mock.method(OrderDraft, 'create', async (document: any) => { saved = document; return document; });
    let status = 200;
    const res = { status: (value: number) => { status = value; return res; }, json: () => res } as unknown as Response;
    const req = { user: { id: String(new mongoose.Types.ObjectId()), role: 'user', name: 'Cashier', businessId: new mongoose.Types.ObjectId() }, body: { items: [
        { productId: 'fabric', quantity: 0.75, unitPrice: 1 },
        { productId: 'pepsi', sizeId: 'small', quantity: 2, unitPrice: 1 },
        { productId: 'pepsi', sizeId: 'large', quantity: 1, unitPrice: 1 },
    ] } } as unknown as AuthRequest;
    await createOrderDraft(req, res);
    assert.equal(status, 201);
    assert.deepEqual(saved.items.map((item: any) => item.unitPrice), [100, 100, 200]);
    assert.deepEqual(saved.items.map((item: any) => item.sizeId), ['', 'small', 'large']);
    assert.equal(saved.items[0].productName, 'Fabric — 0.75 Meter');
    await new OrderDraft(saved).validate();
    req.body.items = [{ productId: 'pepsi', quantity: 2 }];
    await createOrderDraft(req, res);
    assert.equal(status, 400);
});
