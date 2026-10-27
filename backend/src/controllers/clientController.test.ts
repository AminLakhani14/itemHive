import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { requireScreenAccess } from '../middleware/auth';
import { createClient, createClientSchema } from './clientController';
import User from '../models/User';
import Business from '../models/Business';
import AppSetting from '../models/AppSetting';
import * as businessTypes from '../utils/businessTypes';
import * as locations from '../services/clientLocations';

const payload = () => ({
    businessName: 'Karachi Super Mart', businessTypeId: 'super-mart',
    client: { name: 'Client Contact', email: 'contact@example.com', phone: '+92 300 1234567', cnic: '12345-1234567-1' },
    admin: { name: 'Store Admin', email: 'admin@example.com', password: 'test-only-password', role: 'admin', countryCode: 'PK', city: 'Karachi' },
    branches: [
        { name: 'Karachi Branch', location: '12 Test Road', phone: '+92 300 1111111', city: 'Karachi', bindAdmin: true },
        { name: 'Lahore Branch', location: '34 Test Street', phone: '+92 300 2222222', city: 'Lahore', bindAdmin: false },
    ],
    screenPermissions: ['dashboard', 'inventory', 'finance_expense_create'],
});
const request = (body = payload(), role = 'super_admin') => ({ body, user: { id: '507f1f77bcf86cd799439011', role } }) as unknown as AuthRequest;
function response() {
    const result = { code: 200, body: {} as any };
    const res = { status(code: number) { result.code = code; return res; }, json(body: unknown) { result.body = body; return res; } } as unknown as Response;
    return { res, result };
}
function mockLookups(t: TestContext) {
    t.mock.method(User, 'exists', async () => null);
    t.mock.method(businessTypes, 'getBusinessTypeCatalog', async () => ({ types: [{ id: 'super-mart', restaurantEnabled: false }] }));
    t.mock.method(locations, 'getCountries', async () => [{ code: 'PK', name: 'Pakistan' }, { code: 'US', name: 'United States' }]);
    t.mock.method(locations, 'getCities', async (country: { code: string }) => country.code === 'PK' ? ['Karachi', 'Lahore'] : ['New York', 'Boston']);
}

test('validates required details, safe admin role, email, phone, CNIC and permission keys', () => {
    assert.equal(createClientSchema.validate(payload()).error, undefined);
    for (const change of [
        (p: any) => { p.businessName = ' '; },
        (p: any) => { p.client.email = 'bad'; },
        (p: any) => { p.client.phone = 'bad'; },
        (p: any) => { p.client.phone = '3232323232323333333333333'; },
        (p: any) => { p.client.phone = '123456'; },
        (p: any) => { p.client.phone = '92+3001234567'; },
        (p: any) => { p.client.cnic = '123'; },
        (p: any) => { p.client.cnic = '12345-12345671'; },
        (p: any) => { p.client.cnic = '12345123456712'; },
        (p: any) => { p.admin.role = 'super_admin'; },
        (p: any) => { p.admin.role = 'user'; },
        (p: any) => { p.admin.password = 'short'; },
        (p: any) => { p.screenPermissions = ['unknown']; },
        (p: any) => { p.branches[0].name = ' '; },
        (p: any) => { p.branches[0].phone = 'bad'; },
        (p: any) => { p.branches[0].phone = '3232323232323333333333333'; },
        (p: any) => { p.branches = Array.from({ length: 51 }, () => p.branches[0]); },
        (p: any) => { p.branches[0].bindAdmin = 'true'; },
    ]) { const input = payload(); change(input); assert.ok(createClientSchema.validate(input).error); }
    const international = payload(); international.client.cnic = ''; international.admin.countryCode = 'CA';
    assert.equal(createClientSchema.validate(international).error, undefined);
});

test('branches and their location, phone and city are optional', () => {
    for (const change of [
        (p: any) => { p.branches = []; },
        (p: any) => { delete p.branches; },
        (p: any) => { p.branches[0].location = ''; p.branches[0].phone = ''; p.branches[0].city = ''; },
        (p: any) => { p.branches[0] = { name: 'Head Office' }; },
    ]) { const input = payload(); change(input); assert.equal(createClientSchema.validate(input).error, undefined); }
    const input = payload(); delete (input as Partial<typeof input>).branches;
    assert.deepEqual(createClientSchema.validate(input).value.branches, []);
    const { value } = createClientSchema.validate({ ...payload(), branches: [{ name: 'Head Office' }] });
    assert.deepEqual(value.branches, [{ name: 'Head Office', location: '', phone: '', city: '', bindAdmin: false }]);
});

test('client phone and CNIC are optional but must match their formats when given', () => {
    for (const [phone, cnic] of [['', ''], ['   ', ''], ['03001234567', '1234512345671'], ['(021) 3456-7890', '12345-1234567-1'], ['+1 (555) 010.1234', '']]) {
        const input = payload(); input.client.phone = phone; input.client.cnic = cnic;
        assert.equal(createClientSchema.validate(input).error, undefined, `${phone} / ${cnic}`);
    }
    const input = payload(); delete (input.client as Partial<typeof input.client>).phone; delete (input.client as Partial<typeof input.client>).cnic;
    const { error, value } = createClientSchema.validate(input);
    assert.equal(error, undefined);
    assert.equal(value.client.phone, ''); assert.equal(value.client.cnic, '');
    const bad = payload(); bad.client.phone = '3232323232323333333333333';
    assert.match(createClientSchema.validate(bad).error!.message, /valid phone number with 7–15 digits/);
});

test('only super admins can create clients', async () => {
    for (const role of ['admin', 'user']) {
        const { res, result } = response(); await createClient(request(payload(), role), res); assert.equal(result.code, 403);
    }
});

test('new module restrictions also protect the API while preserving existing client access', () => {
    for (const permission of ['organization'] as const) {
        for (const [role, version, permissions, expected] of [
            ['admin', 3, [], 403], ['admin', 3, [permission], 200],
            ['admin', 2, [], 200], ['super_admin', 3, [], 200],
        ] as const) {
            const req = request(payload(), role);
            req.user!.screenPermissions = [...permissions];
            req.user!.screenPermissionsVersion = version;
            const { res, result } = response();
            let allowed = false;
            requireScreenAccess(permission)(req, res, () => { allowed = true; });
            assert.equal(result.code, expected);
            assert.equal(allowed, expected === 200);
        }
    }
});

test('rejects duplicate login, reserved email, missing type and a city from a different country before writing', async (t) => {
    mockLookups(t);
    const cases = [
        { change: (p: any) => { p.admin.email = 'admin@itemhive.com'; }, code: 400 },
        { change: (p: any) => { p.businessTypeId = 'deleted'; }, code: 400 },
        { change: (p: any) => { p.admin.countryCode = 'US'; }, code: 400 },
        { change: (p: any) => { p.branches[1].city = 'Boston'; }, code: 400 },
    ];
    const writes = t.mock.method(Business, 'create', async () => { throw new Error('must not write'); });
    for (const item of cases) { const input = payload(); item.change(input); const { res, result } = response(); await createClient(request(input), res); assert.equal(result.code, item.code); }
    t.mock.method(User, 'exists', async () => ({ _id: 'existing' }));
    const { res, result } = response(); await createClient(request(), res); assert.equal(result.code, 409);
    assert.equal(writes.mock.callCount(), 0);
});

test('creates the business, admin and tenant settings in one transaction with exact permissions', async (t) => {
    mockLookups(t);
    const writes: Array<{ kind: string; document: any }> = [];
    let ended = false;
    const session = { withTransaction: async (fn: () => Promise<void>) => fn(), endSession: async () => { ended = true; } };
    t.mock.method(mongoose, 'startSession', async () => session);
    for (const [model, kind] of [[Business, 'business'], [User, 'user'], [AppSetting, 'settings']] as const) {
        t.mock.method(model, 'create', async (docs: any[], options: any) => { assert.equal(options.session, session); writes.push({ kind, document: docs[0] }); return docs; });
    }
    const { res, result } = response(); await createClient(request(), res);
    assert.equal(result.code, 201); assert.equal(ended, true);
    assert.deepEqual(writes.map((w) => w.kind), ['business', 'user', 'settings']);
    const [business, user, settings] = writes.map((w) => w.document);
    assert.deepEqual(business.clientContact, payload().client);
    assert.deepEqual(business.branches, payload().branches.map(({ bindAdmin, ...branch }) => ({
        ...branch, countryCode: 'PK', country: 'Pakistan', adminUserId: bindAdmin ? user._id : null,
        adminUserIds: bindAdmin ? [user._id] : [],
    })));
    assert.equal(user.name, 'Store Admin'); assert.equal(user.role, 'admin');
    assert.deepEqual(user.screenPermissions, payload().screenPermissions);
    assert.deepEqual(user.location, { countryCode: 'PK', country: 'Pakistan', city: 'Karachi' });
    assert.equal(user.businessId.toString(), business._id.toString());
    assert.equal(settings.businessId.toString(), business._id.toString());
    assert.equal(settings.shopName, 'Karachi Super Mart'); assert.equal(settings.businessTypeId, 'super-mart');
    assert.equal(settings.restaurantEnabled, false);
    assert.equal(JSON.stringify(result.body).includes('password'), false);
});

test('branch bindings default to unassigned and cannot accept an unrelated administrator ID', () => {
    const input = payload();
    delete (input.branches[0] as { bindAdmin?: boolean }).bindAdmin;
    (input.branches[0] as Record<string, unknown>).adminUserId = '507f1f77bcf86cd799439099';
    const { error, value } = createClientSchema.validate(input, { stripUnknown: true });
    assert.equal(error, undefined);
    assert.equal(value.branches[0].bindAdmin, false);
    assert.equal(value.branches[0].adminUserId, undefined);
});

test('the same newly created administrator can be bound to multiple branches', async (t) => {
    mockLookups(t);
    const input = payload(); input.branches.forEach((branch) => { branch.bindAdmin = true; });
    const session = { withTransaction: async (fn: () => Promise<void>) => fn(), endSession: async () => {} };
    t.mock.method(mongoose, 'startSession', async () => session);
    let business: any, user: any;
    t.mock.method(Business, 'create', async (docs: any[]) => { business = docs[0]; return docs; });
    t.mock.method(User, 'create', async (docs: any[]) => { user = docs[0]; return docs; });
    t.mock.method(AppSetting, 'create', async () => []);
    const { res, result } = response(); await createClient(request(input), res);
    assert.equal(result.code, 201);
    assert.equal(business.branches.length, 2);
    assert.ok(business.branches.every((branch: any) => String(branch.adminUserId) === String(user._id)));
    assert.ok(business.branches.every((branch: any) => branch.adminUserIds.some((id: unknown) => String(id) === String(user._id))));
    assert.ok(business.branches.every((branch: any) => String(branch.adminUserId) !== request().user!.id));
});

test('branch subdocuments keep independent cities and require only a branch name', () => {
    const document = new Business({
        name: 'Client', slug: 'test-client',
        branches: payload().branches.map((branch) => ({ ...branch, countryCode: 'PK', country: 'Pakistan' })),
    });
    assert.equal(document.validateSync(), undefined);
    assert.deepEqual(document.branches.map((branch) => branch.city), ['Karachi', 'Lahore']);
    document.branches[1].city = '';
    assert.equal(document.validateSync(), undefined);
    document.branches[1].name = '';
    assert.ok(document.validateSync()?.errors['branches.1.name']);
});

test('creates a client without branches and accepts branches with no city', async (t) => {
    mockLookups(t);
    t.mock.method(mongoose, 'startSession', async () => ({ withTransaction: async (fn: () => Promise<void>) => fn(), endSession: async () => {} }));
    let business: any;
    t.mock.method(Business, 'create', async (docs: any[]) => { business = docs[0]; return docs; });
    t.mock.method(User, 'create', async (docs: any[]) => docs);
    t.mock.method(AppSetting, 'create', async () => []);
    for (const branches of [[], [{ name: 'Head Office', location: '', phone: '', city: '', bindAdmin: false }]]) {
        const { res, result } = response(); await createClient(request({ ...payload(), branches }), res);
        assert.equal(result.code, 201);
        assert.equal(business.branches.length, branches.length);
    }
});

test('transaction failure aborts creation and always ends the session', async (t) => {
    mockLookups(t);
    let aborted = false, ended = false;
    t.mock.method(console, 'error', () => {});
    t.mock.method(mongoose, 'startSession', async () => ({ withTransaction: async (fn: () => Promise<void>) => { try { await fn(); } catch (error) { aborted = true; throw error; } }, endSession: async () => { ended = true; } }));
    t.mock.method(Business, 'create', async () => []);
    t.mock.method(User, 'create', async () => { throw new Error('write failed'); });
    const settings = t.mock.method(AppSetting, 'create', async () => []);
    const { res, result } = response(); await createClient(request(), res);
    assert.equal(result.code, 500); assert.equal(aborted, true); assert.equal(ended, true);
    assert.equal(settings.mock.callCount(), 0);
});
