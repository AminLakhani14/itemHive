import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { productSchema, validate } from './validate';
import Product from '../models/Product';
import { resolveSellingLine } from '../utils/productSelling';

const coke = () => ({ id: 'coke', sku: 'COKE', name: 'Coke', category: 'Beverages', purchasePrice: 130, salePrice: 150, price: 150, stock: 1100, minStock: 5,
    unitSizeEnabled: true, sellingType: 'fixed', productUnitCode: 'litre', productUnit: 'Liter', sizes: [
        { id: 'one-liter', size: 1, purchasePrice: 130, salePrice: 150, stock: 1000 },
        { id: 'one-point-five-liter', size: 1.5, purchasePrice: 170, salePrice: 200, stock: 100 },
    ],
});
const options = { abortEarly: false, stripUnknown: true };

test('actual product request middleware preserves the enabled flag and both Coke sizes', async () => {
    const req = { body: coke() } as unknown as Request;
    const res = { status: () => { throw new Error('Unexpected validation rejection'); } } as unknown as Response;
    let continued = false;
    validate(productSchema)(req, res, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.body.unitSizeEnabled, true);
    assert.equal(req.body.sellingType, 'fixed');
    assert.deepEqual(req.body.sizes, coke().sizes);
    const document = new Product(req.body);
    await document.validate();
    const saved = document.toObject();
    assert.deepEqual(saved.sizes?.map(row => row.size), [1, 1.5]);
    assert.equal(saved.unitSizeEnabled, true);
    assert.equal(resolveSellingLine(saved, 2, 'one-point-five-liter').unitPrice, 200);
    assert.throws(() => resolveSellingLine(saved, 1), /Invalid size/);
});

test('quantity units survive request validation while normal products remain optional', () => {
    const input = { ...coke(), name: 'Sugar', sellingType: 'quantity', productUnitCode: 'kg', productUnit: 'Kg', stock: 12.5, sizes: [] };
    const { value, error } = productSchema.validate(input, options);
    assert.equal(error, undefined);
    assert.equal(value.unitSizeEnabled, true);
    assert.equal(value.stock, 12.5);
    assert.equal(value.productUnitCode, 'kg');
    const { unitSizeEnabled, sellingType, sizes, productUnitCode, productUnit, ...normal } = coke();
    assert.equal(productSchema.validate(normal, options).error, undefined);
    assert.equal(productSchema.validate({ ...normal, unitSizeEnabled: false, sellingType: '', sizes: [] }, options).error, undefined);
});

test('enabled product requests reject missing units, selling type and incomplete or duplicate sizes', () => {
    for (const input of [
        { ...coke(), productUnitCode: '' }, { ...coke(), productUnit: '' }, { ...coke(), sellingType: '' },
        { ...coke(), sizes: undefined }, { ...coke(), sizes: [] },
        { ...coke(), sizes: [{ ...coke().sizes[0], size: '  ' }] },
        { ...coke(), sizes: [{ ...coke().sizes[0], stock: 0.5 }] },
        { ...coke(), sizes: [coke().sizes[0], { ...coke().sizes[1], size: 1 }] },
    ]) assert.ok(productSchema.validate(input, options).error, JSON.stringify(input));
});

test('named variants save with optional prices and stock defaulting to zero', async () => {
    const input = { ...coke(), productUnitCode: 'piece', productUnit: 'Piece', sizes: [{ id: 'large', size: ' Large ' }] };
    const { value, error } = productSchema.validate(input, options);
    assert.equal(error, undefined);
    assert.deepEqual(value.sizes, [{ id: 'large', size: 'Large', purchasePrice: 0, salePrice: 0, stock: 0 }]);
    assert.equal(productSchema.validate({ ...input, sizes: [{ id: 'number-label', size: '500' }] }, options).value.sizes[0].size, '500');
    const document = new Product(value);
    await document.validate();
    assert.equal(document.sizes?.[0].size, 'Large');
    assert.equal(document.stock, 0);
    document.sizes![0].stock = 2;
    await document.validate();
    const line = resolveSellingLine(document.toObject(), 1, 'large');
    assert.equal(line.unitPrice, 0);
    assert.equal(line.name, 'Coke — Large × 1');
    assert.equal(productSchema.validate({ ...input, sizes: [{ id: 'empty' }] }, options).error != null, true);
    assert.ok(productSchema.validate({ ...input, sizes: [{ id: 'bad', size: 'Large', stock: -1 }] }, options).error);
    const duplicate = new Product({ ...value, sizes: [value.sizes[0], { ...value.sizes[0], id: 'other', size: 'large' }] });
    await assert.rejects(duplicate.validate(), /unique/);
});
