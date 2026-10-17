import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { createClient, getClient, updateClient } from './clientController';
import Business from '../models/Business';
import User from '../models/User';
import AppSetting from '../models/AppSetting';
import BusinessTypeCatalog from '../models/BusinessTypeCatalog';
import * as locations from '../services/clientLocations';

test('client onboarding persists safely and rolls back a partial creation', { timeout: 180000 }, async (t) => {
    const db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    t.after(async () => { await mongoose.disconnect(); await db.stop(); });
    await mongoose.connect(db.getUri());
    await Promise.all([Business.init(), User.init(), AppSetting.init(), BusinessTypeCatalog.init()]);
    t.mock.method(locations, 'getCountries', async () => [{ code: 'PK', name: 'Pakistan' }, { code: 'US', name: 'United States' }]);
    t.mock.method(locations, 'getCities', async (country: { code: string }) => country.code === 'PK' ? ['Karachi', 'Lahore'] : ['Boston', 'New York']);
    const body = {
        businessName: 'Test Pharmacy', businessTypeId: 'pharmacy',
        client: { name: 'Test Client', email: 'contact@example.com', phone: '+92 300 1234567', cnic: '12345-1234567-1' },
        admin: { name: 'Test Admin', email: 'pharmacy@example.com', password: 'test-only-password', role: 'admin', countryCode: 'PK', city: 'Karachi' },
        branches: [
            { name: 'Karachi Branch', location: '12 Test Road', phone: '+92 300 1111111', city: 'Karachi', bindAdmin: true },
            { name: 'Lahore Branch', location: '34 Test Street', phone: '+92 300 2222222', city: 'Lahore', bindAdmin: false },
        ],
        screenPermissions: ['dashboard', 'inventory'],
    };
    async function submit(input: typeof body) {
        const result = { code: 200, body: {} as any };
        const res = { status(code: number) { result.code = code; return res; }, json(value: unknown) { result.body = value; return res; } } as unknown as Response;
        await createClient({ body: input, user: { id: '507f1f77bcf86cd799439011', role: 'super_admin' } } as unknown as AuthRequest, res);
        return result;
    }
    const result = await submit(body);
    assert.equal(result.code, 201);
    const business = await Business.findById(result.body.businessId).orFail();
    const admin = await User.findById(result.body.userId).select('+password +visiblePassword').orFail();
    const settings = await AppSetting.findOne({ businessId: business._id }).orFail();
    assert.equal(business.name, body.businessName);
    assert.deepEqual(JSON.parse(JSON.stringify(business.clientContact)), body.client);
    assert.deepEqual(business.branches.map(({ name, location, phone, city, countryCode, country }) => ({ name, location, phone, city, countryCode, country })),
        body.branches.map(({ bindAdmin: _bindAdmin, ...branch }) => ({ ...branch, countryCode: 'PK', country: 'Pakistan' })));
    assert.equal(String(business.branches[0].adminUserId), String(admin._id));
    assert.equal(business.branches[1].adminUserId, null);
    assert.equal(admin.email, body.admin.email);
    assert.notEqual(admin.password, body.admin.password);
    assert.equal(await admin.comparePassword(body.admin.password), true);
    assert.equal(admin.visiblePassword, undefined);
    assert.equal(admin.location?.city, 'Karachi');
    assert.equal(admin.screenPermissionsVersion, 3);
    assert.deepEqual([...admin.screenPermissions!], body.screenPermissions);
    assert.equal(settings.businessTypeId, 'pharmacy');
    assert.equal(settings.restaurantEnabled, false);
    assert.equal((await submit(body)).code, 409);
    assert.equal(await Business.countDocuments(), 1);

    const failed = structuredClone(body); failed.admin.email = 'rollback@example.com';
    const settingWrite = t.mock.method(AppSetting, 'create', async () => { throw new Error('Simulated settings failure'); });
    const log = t.mock.method(console, 'error', () => {});
    assert.equal((await submit(failed)).code, 500);
    settingWrite.mock.restore(); log.mock.restore();
    assert.equal(await Business.countDocuments(), 1);
    assert.equal(await User.countDocuments(), 1);
    assert.equal(await AppSetting.countDocuments(), 1);
    assert.equal(await User.exists({ email: failed.admin.email }), null);

    failed.admin.countryCode = 'US';
    assert.equal((await submit(failed)).code, 400);
    assert.equal(await Business.countDocuments(), 1);
    failed.admin.city = 'Boston';
    assert.equal((await submit(failed)).code, 400);
    failed.branches[0].city = 'Boston'; failed.branches[1].city = 'New York';
    assert.equal((await submit(failed)).code, 201);
    const usAdmin = await User.findOne({ email: failed.admin.email }).orFail();
    assert.equal(usAdmin.location?.countryCode, 'US');
    assert.equal(usAdmin.location?.city, 'Boston');
});

test('Edit Client updates details, edits and adds branches, and keeps branches it is not sent', { timeout: 180000 }, async (t) => {
    const db = await MongoMemoryServer.create();
    t.after(async () => { await mongoose.disconnect(); await db.stop(); });
    await mongoose.connect(db.getUri());
    await Promise.all([Business.init(), User.init(), AppSetting.init(), BusinessTypeCatalog.init()]);
    t.mock.method(locations, 'getCountries', async () => [{ code: 'PK', name: 'Pakistan' }, { code: 'US', name: 'United States' }]);
    t.mock.method(locations, 'getCities', async (country: { code: string }) => country.code === 'PK' ? ['Karachi', 'Lahore'] : ['Boston', 'New York']);

    const businessId = new mongoose.Types.ObjectId();
    const [owner, former, outsider] = await User.create([
        { name: 'Owner', email: 'owner-edit@example.com', password: 'test-only-password', role: 'admin', businessId },
        { name: 'Former', email: 'former-edit@example.com', password: 'test-only-password', role: 'admin', businessId, isActive: false },
        { name: 'Outsider', email: 'outsider-edit@example.com', password: 'test-only-password', role: 'admin', businessId: new mongoose.Types.ObjectId() },
    ]);
    const business = await Business.create({
        _id: businessId, name: 'Old Name', slug: 'edit-client-test',
        branches: [
            { name: 'Karachi', city: 'Karachi', countryCode: 'PK', country: 'Pakistan', adminUserId: former._id, adminUserIds: [former._id] },
            { name: 'Kept', location: 'Unchanged Road' },
        ],
    });
    const legacy = await Business.create({ name: 'Legacy', slug: 'edit-client-legacy', isLegacy: true });
    const [karachi] = business.branches as any[];
    const call = async (handler: typeof updateClient, body: unknown = {}, id = String(businessId), role = 'super_admin') => {
        const result = { code: 200, body: {} as any };
        const res = { status(code: number) { result.code = code; return res; }, json(value: unknown) { result.body = value; return res; } } as unknown as Response;
        await handler({ body, params: { id }, user: { id: '507f1f77bcf86cd799439011', role } } as unknown as AuthRequest, res);
        return result;
    };

    const read = await call(getClient);
    assert.equal(read.code, 200);
    assert.equal(read.body.countryCode, 'PK');
    assert.deepEqual(read.body.administrators.map((admin: any) => admin.name), ['Owner'], 'only active administrators can be assigned');
    assert.equal((await call(getClient, {}, String(legacy._id))).code, 404, 'the shared default workspace is not a client');

    const body = () => ({
        businessName: 'New Name', businessTypeId: 'restaurant',
        client: { name: 'Contact', email: 'CONTACT@example.com', phone: '', cnic: '' },
        branches: [
            // The deactivated administrator's existing assignment is kept.
            { id: String(karachi._id), name: 'Karachi Central', location: '', phone: '', countryCode: 'PK', city: 'Karachi', adminUserIds: [String(former._id), String(owner._id)] },
            { name: 'Lahore', location: '', phone: '+92 300 2222222', countryCode: 'PK', city: 'Lahore', adminUserIds: [String(owner._id)] },
        ] as any[],
    });
    for (const [change, code] of [
        [(p: any) => { p.branches[1].adminUserIds = [String(former._id)]; }, 400],
        [(p: any) => { p.branches[1].adminUserIds = [String(outsider._id)]; }, 400],
        [(p: any) => { p.branches[1].name = 'kept'; }, 409],
        [(p: any) => { p.branches[0].id = String(new mongoose.Types.ObjectId()); }, 400],
        [(p: any) => { p.branches[1].city = 'Boston'; }, 400],
        [(p: any) => { p.businessTypeId = 'deleted-type'; }, 400],
    ] as const) {
        const input = body(); change(input);
        assert.equal((await call(updateClient, input)).code, code);
    }
    assert.equal((await call(updateClient, body(), String(businessId), 'admin')).code, 403);
    assert.equal((await Business.findById(businessId).orFail()).name, 'Old Name', 'rejected edits change nothing');

    const result = await call(updateClient, body());
    assert.equal(result.code, 200);
    assert.equal(result.body.name, 'New Name');
    assert.deepEqual(result.body.branches.map((branch: any) => branch.name), ['Karachi Central', 'Kept', 'Lahore']);
    const stored = await Business.findById(businessId).orFail();
    assert.equal(stored.clientContact?.email, 'contact@example.com');
    assert.deepEqual(stored.branches[0].adminUserIds.map(String), [String(former._id), String(owner._id)]);
    assert.equal(stored.branches[1].location, 'Unchanged Road');
    assert.deepEqual([stored.branches[2].city, stored.branches[2].country, stored.branches[2].adminUserIds.map(String)], ['Lahore', 'Pakistan', [String(owner._id)]]);
    const settings = await AppSetting.findOne({ key: `business:${businessId}` }).orFail();
    assert.deepEqual([settings.businessTypeId, settings.restaurantEnabled], ['restaurant', true]);
});
