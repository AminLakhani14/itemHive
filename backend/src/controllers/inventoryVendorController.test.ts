import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import InventoryVendors from '../models/InventoryVendors';
import InventoryRequest from '../models/InventoryRequest';
import { listVendors, createVendor, updateVendor, getVendorHistory } from './inventoryVendorController';

const tenantId = '507f1f77bcf86cd799439012';
const actorId = '507f1f77bcf86cd799439011';
const req = () => ({ user: { id: actorId, businessId: tenantId, businessIsLegacy: false, role: 'user' }, query: {}, body: {}, params: {} }) as unknown as AuthRequest;
const response = () => {
    const result = { status: 200, body: undefined as any };
    const res = { status: (status: number) => { result.status = status; return res; }, json: (value: unknown) => { result.body = value; return res; } } as unknown as Response;
    return { result, res };
};

test('vendor directory searches literal text and paginates inside the tenant', async t => {
    t.mock.method(InventoryVendors, 'aggregate', async (stages: any[]) => {
        assert.equal(String(stages[0].$match.businessId), tenantId);
        assert.equal(stages[2].$match['vendors.archived'].$ne, true);
        assert.equal(stages[2].$match.$or[0]['vendors.name'].$regex, 'Acme \\(Pvt\\)');
        assert.deepEqual(stages[4].$facet.vendors.slice(0, 2), [{ $skip: 20 }, { $limit: 10 }]);
        return [{ vendors: [{ id: 'v1', name: 'Acme (Pvt)' }], count: [{ total: 123 }] }];
    });
    const request = req(); request.query = { q: 'Acme (Pvt)', page: '2', pageSize: '10' };
    const { res, result } = response(); await listVendors(request, res);
    assert.equal(result.status, 200); assert.equal(result.body.total, 123); assert.equal(result.body.vendors.length, 1);
});

test('archived vendors can be searched for history and page sizes are bounded', async t => {
    t.mock.method(InventoryVendors, 'aggregate', async (stages: any[]) => {
        assert.equal(stages[2].$match['vendors.archived'], undefined);
        assert.deepEqual(stages[4].$facet.vendors.slice(0, 2), [{ $skip: 0 }, { $limit: 100 }]);
        return [{ vendors: [], count: [] }];
    });
    const request = req(); request.query = { includeArchived: 'true', page: 'Infinity', pageSize: '1000' };
    const { res, result } = response(); await listVendors(request, res);
    assert.equal(result.status, 200); assert.equal(result.body.total, 0);
});

test('creating one vendor appends to the existing directory without replacing other vendors', async t => {
    t.mock.method(InventoryVendors, 'findOneAndUpdate', async (filter: any, update: any) => {
        assert.equal(String(filter.businessId), tenantId); assert.deepEqual(update, { $setOnInsert: { vendors: [] } }); return {};
    });
    t.mock.method(InventoryVendors, 'updateOne', async (filter: any, update: any) => {
        assert.equal(String(filter.businessId), tenantId); assert.ok(update.$push.vendors.id); assert.equal(update.$push.vendors.name, 'Vendor 51');
        assert.equal(update.$set, undefined); return { modifiedCount: 1 };
    });
    const request = req(); request.body = { name: 'Vendor 51', cnic: '12345-1234567-1' };
    const { res, result } = response(); await createVendor(request, res);
    assert.equal(result.status, 201); assert.equal(result.body.vendor.cnic, '12345-1234567-1');
});

test('per-vendor edits and archival preserve IDs and reject stale revisions', async t => {
    let modified = 1;
    t.mock.method(InventoryVendors, 'updateOne', async (filter: any, update: any) => {
        assert.equal(String(filter.businessId), tenantId); assert.equal(filter.vendors.$elemMatch.id, 'old-vendor');
        assert.equal(filter.vendors.$elemMatch.version, 3);
        assert.equal(update.$set['vendors.$'].id, 'old-vendor'); assert.equal(update.$set['vendors.$'].version, 4); assert.equal(update.$set['vendors.$'].archived, true);
        return { modifiedCount: modified };
    });
    const request = req(); request.params = { vendorId: 'old-vendor' }; request.body = { name: 'Vendor', version: 3, archived: true };
    const first = response(); await updateVendor(request, first.res); assert.equal(first.result.status, 200);
    modified = 0;
    const second = response(); await updateVendor(request, second.res); assert.equal(second.result.status, 409);
});

test('legacy vendor rows without individual revisions remain editable', async t => {
    t.mock.method(InventoryVendors, 'updateOne', async (filter: any) => {
        assert.deepEqual(filter.vendors.$elemMatch.$or, [{ version: 0 }, { version: { $exists: false } }]); return { modifiedCount: 1 };
    });
    const request = req(); request.params = { vendorId: 'legacy-id' }; request.body = { name: 'Legacy Vendor', version: 0 };
    const { res, result } = response(); await updateVendor(request, res); assert.equal(result.status, 200);
});

test('vendor history paginates orders with vendor filters and retains tenant and requester scope', async t => {
    let expectedFilter: any;
    t.mock.method(InventoryRequest, 'find', (filter: any) => {
        expectedFilter = filter;
        const clauses = filter.$and;
        assert.equal(String(clauses[0].businessId), tenantId); assert.ok(clauses.some((clause: any) => clause.requestedBy === actorId));
        assert.ok(clauses.some((clause: any) => clause['items.vendorId'] === 'v1'));
        assert.ok(clauses.some((clause: any) => clause.deliveryStatus === 'partial'));
        return { sort: () => ({ skip: (skip: number) => { assert.equal(skip, 40); return { limit: (limit: number) => { assert.equal(limit, 20); return { lean: async () => [{ _id: 'order1', items: [{ name: 'Buns', vendorId: 'v1', quantity: 100, receivedQuantity: 80 }] }] }; } }; } }) };
    });
    t.mock.method(InventoryRequest, 'countDocuments', async (filter: any) => { assert.deepEqual(filter, expectedFilter); return 100; });
    const request = req(); request.query = { vendorId: 'v1', deliveryStatus: 'partial', page: '2', pageSize: '20', q: 'Buns' };
    const { res, result } = response(); await getVendorHistory(request, res);
    assert.equal(result.status, 200); assert.equal(result.body.total, 100); assert.equal(result.body.requests[0].items[0].receivedQuantity, 80);
});
