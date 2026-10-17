import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/auth';
import Business from '../models/Business';
import AppSetting from '../models/AppSetting';
import User from '../models/User';
import BusinessTypeCatalog, { DEFAULT_BUSINESS_TYPES } from '../models/BusinessTypeCatalog';
import { createBusinessType, deleteBusinessType, updateBusinessType } from './businessTypeController';
import { updateUserStatus } from './userController';
import { getBusinessTypeCatalog } from '../utils/businessTypes';
import { createBusinessTypeSchema, updateUserStatusSchema, updateBusinessTypeSchema } from '../middleware/validate';
import { businessProductFields } from '../utils/businessProductFields';

test('product fields use business defaults and honor an explicitly empty custom configuration', () => {
    assert.deepEqual(businessProductFields({ id: 'restaurant' }), ['unitSize']);
    assert.deepEqual(businessProductFields({ id: 'stationery' }), ['unitSize', 'supplier']);
    assert.deepEqual(businessProductFields({ id: 'super-mart' }), ['unitSize', 'supplier', 'batchNumber', 'expiryDate']);
    assert.deepEqual(businessProductFields({ id: 'custom', productFields: ['expiryDate'] }), ['expiryDate']);
    assert.deepEqual(businessProductFields({ id: 'super-mart', productFields: [] }), []);
    assert.equal(updateBusinessTypeSchema.validate({ productFields: [] }).error, undefined);
    assert.ok(updateBusinessTypeSchema.validate({ productFields: ['unknown'] }).error);
    assert.ok(updateBusinessTypeSchema.validate({ productFields: ['supplier', 'supplier'] }).error);
});

test('product field updates target one catalog type and report a missing type', async (t) => {
    let filter: unknown;
    let update: unknown;
    let found = true;
    t.mock.method(BusinessTypeCatalog, 'findOneAndUpdate', async (query: unknown, changes: unknown) => {
        filter = query; update = changes;
        return found ? { types: [] } : null;
    });
    const req = { params: { id: 'custom' }, body: { productFields: ['supplier', 'expiryDate'] } } as unknown as AuthRequest;
    const saved = response();
    await updateBusinessType(req, saved.res);
    assert.equal(saved.result.status, 200);
    assert.deepEqual(filter, { key: 'global', 'types.id': 'custom' });
    assert.deepEqual(update, { $set: { 'types.$.productFields': ['supplier', 'expiryDate'] } });
    found = false;
    const missing = response();
    await updateBusinessType(req, missing.res);
    assert.equal(missing.result.status, 404);
});

const response = () => {
    const result = { status: 200, body: {} as Record<string, unknown> };
    const res = {
        status: (status: number) => { result.status = status; return res; },
        json: (body: Record<string, unknown>) => { result.body = body; return res; },
    } as unknown as Response;
    return { res, result };
};

test('business type deletion protects legacy restaurants and follows tenant settings precedence', async (t) => {
    t.mock.method(BusinessTypeCatalog, 'findOneAndUpdate', () => ({ orFail: async () => ({ types: DEFAULT_BUSINESS_TYPES }) }));
    t.mock.method(Business, 'find', () => ({ select: () => ({ lean: async () => [{ _id: 'shop', isLegacy: true }] }) }));
    let settings = [{ key: 'global', restaurantEnabled: true, businessTypeId: '' }];
    t.mock.method(AppSetting, 'find', () => ({ select: () => ({ lean: async () => settings }) }));
    const remove = t.mock.method(BusinessTypeCatalog, 'updateOne', async () => ({}));
    const req = { params: { id: 'restaurant' } } as unknown as AuthRequest;
    const blocked = response();
    await deleteBusinessType(req, blocked.res);
    assert.equal(blocked.result.status, 409);
    assert.equal(remove.mock.callCount(), 0);

    settings = [...settings, { key: 'business:shop', restaurantEnabled: false, businessTypeId: 'stationery' }];
    const allowed = response();
    await deleteBusinessType(req, allowed.res);
    assert.equal(allowed.result.status, 200);
    assert.equal(remove.mock.callCount(), 1);

    req.params.id = 'stationery';
    const assigned = response();
    await deleteBusinessType(req, assigned.res);
    assert.equal(assigned.result.status, 409);
    assert.equal(remove.mock.callCount(), 1);
});

test('catalog initialization leaves deleted default types deleted', async (t) => {
    const remaining = DEFAULT_BUSINESS_TYPES.filter((type) => type.id !== 'super-mart');
    let observedUpdate: Record<string, unknown> = {};
    t.mock.method(BusinessTypeCatalog, 'findOneAndUpdate', (_filter: unknown, update: Record<string, unknown>) => {
        observedUpdate = update;
        return { orFail: async () => ({ types: remaining }) };
    });
    const catalog = await getBusinessTypeCatalog();
    assert.deepEqual(catalog.types, remaining);
    assert.equal('$set' in observedUpdate, false);
    assert.ok('$setOnInsert' in observedUpdate);
});

test('adding business types normalizes names and blocks duplicates without regex injection', async (t) => {
    let filter: Record<string, any> = {};
    let update: Record<string, any> = {};
    t.mock.method(BusinessTypeCatalog, 'findOneAndUpdate', (query: Record<string, any>, changes: Record<string, any>) => {
        if (changes.$setOnInsert) return { orFail: async () => ({ types: DEFAULT_BUSINESS_TYPES }) };
        filter = query;
        update = changes;
        return Promise.resolve(null);
    });
    const req = { body: { name: '  Book   Shop (A+)  ' } } as AuthRequest;
    const duplicate = response();
    await createBusinessType(req, duplicate.res);
    assert.equal(duplicate.result.status, 409);
    assert.equal(update.$push.types.name, 'Book Shop (A+)');
    assert.equal(update.$push.types.restaurantEnabled, false);
    assert.ok(filter['types.name'].$not.test('book shop (a+)'));
    assert.ok(!filter['types.name'].$not.test('Book Shop AAA'));
});

test('changing the business type enables KOT only for restaurant and rejects unknown types and user accounts', async (t) => {
    const settings = {
        businessId: 'shop', businessTypeId: '', restaurantEnabled: false,
        orderTypeOptions: ['Dine In', 'Takeaway'], save: async () => {},
    };
    const user = { _id: 'account', role: 'admin', businessId: 'shop', preferences: {}, save: async () => {} };
    t.mock.method(User, 'findById', async () => user);
    t.mock.method(Business, 'findById', () => ({ select: async () => ({ isLegacy: false }) }));
    t.mock.method(AppSetting, 'findOne', async () => settings);
    const saved = t.mock.method(settings, 'save', async () => {});
    t.mock.method(BusinessTypeCatalog, 'findOneAndUpdate', () => ({ orFail: async () => ({ types: DEFAULT_BUSINESS_TYPES }) }));
    const req = { params: { id: 'account' }, body: { businessTypeId: 'restaurant' } } as unknown as AuthRequest;
    const restaurant = response();
    await updateUserStatus(req, restaurant.res);
    assert.equal(restaurant.result.status, 200);
    assert.equal(settings.businessTypeId, 'restaurant');
    assert.equal(settings.restaurantEnabled, true);

    for (const typeId of ['stationery', 'super-mart', '']) {
        req.body.businessTypeId = typeId;
        const retail = response();
        await updateUserStatus(req, retail.res);
        assert.equal(retail.result.status, 200);
        assert.equal(settings.businessTypeId, typeId);
        assert.equal(settings.restaurantEnabled, false);
        assert.deepEqual(settings.orderTypeOptions, ['Dine In', 'Takeaway']);
    }
    const previousSaves = saved.mock.callCount();
    req.body.businessTypeId = 'deleted-type';
    const unknown = response();
    await updateUserStatus(req, unknown.res);
    assert.equal(unknown.result.status, 400);
    assert.equal(saved.mock.callCount(), previousSaves);

    user.role = 'user';
    req.body.businessTypeId = 'restaurant';
    const teamUser = response();
    await updateUserStatus(req, teamUser.res);
    assert.equal(teamUser.result.status, 400);
    assert.equal(saved.mock.callCount(), previousSaves);
});

test('only super admins can mutate the catalog and names and IDs are validated', () => {
    for (const role of ['user', 'admin']) {
        const denied = response();
        let continued = false;
        authorize('super_admin')({ user: { role } } as AuthRequest, denied.res, () => { continued = true; });
        assert.equal(denied.result.status, 403);
        assert.equal(continued, false);
    }
    let continued = false;
    authorize('super_admin')({ user: { role: 'super_admin' } } as AuthRequest, response().res, () => { continued = true; });
    assert.equal(continued, true);
    assert.ok(createBusinessTypeSchema.validate({ name: ' ' }).error);
    assert.ok(createBusinessTypeSchema.validate({ name: 'x'.repeat(81) }).error);
    assert.equal(createBusinessTypeSchema.validate({ name: 'Pharmacy' }).error, undefined);
    assert.equal(updateUserStatusSchema.validate({ businessTypeId: 'stationery' }).error, undefined);
    assert.equal(updateUserStatusSchema.validate({ businessTypeId: '' }).error, undefined);
    assert.ok(updateUserStatusSchema.validate({ businessTypeId: 42 }).error);
});
