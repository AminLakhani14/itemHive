import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { createBranch, getBranches, getOrganizationOverview, updateBranch } from './organizationController';
import * as locations from '../services/clientLocations';
import Business from '../models/Business';
import User from '../models/User';
import Employee from '../models/Employee';
import AppSetting from '../models/AppSetting';

test('a business that skipped client onboarding gets one main branch holding its staff', { timeout: 180000 }, async (t) => {
    const db = await MongoMemoryServer.create();
    t.after(async () => { await mongoose.disconnect(); await db.stop(); });
    await mongoose.connect(db.getUri());
    await Promise.all([Business.init(), User.init(), Employee.init(), AppSetting.init()]);

    const business = await Business.create({ name: '369 Pizza', slug: 'pizza-369-test' });
    const admin = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'test-only-password', role: 'admin', businessId: business._id, location: { countryCode: 'PK', country: 'Pakistan', city: 'Karachi' } });
    await AppSetting.create({ key: `business:${business._id}`, businessId: business._id, shopName: '369 Pizza', shopAddress: 'Shop 7, Tariq Road', shopPhone: '+92 300 7654321' });
    await Employee.create([
        { businessId: business._id, employeeCode: 'EMP-001', fullName: 'Sara Ahmed' },
        { businessId: business._id, employeeCode: 'EMP-002', fullName: 'Bilal Raza' },
    ]);

    const call = async (handler: typeof getBranches) => {
        const result = { code: 200, body: {} as any };
        const res = { status(code: number) { result.code = code; return res; }, json(value: unknown) { result.body = value; return res; } } as unknown as Response;
        await handler({ user: { id: String(admin._id), role: 'admin', businessId: String(business._id), businessIsLegacy: false } } as unknown as AuthRequest, res);
        return result;
    };

    const [first, second] = await Promise.all([call(getBranches), call(getBranches)]);
    assert.equal(first.code, 200);
    assert.equal(second.code, 200);
    const stored = await Business.findById(business._id).orFail();
    assert.equal(stored.branches.length, 1, 'concurrent first visits must not create duplicate main branches');
    const branch = (stored.branches[0] as any);
    assert.deepEqual(
        { name: branch.name, location: branch.location, phone: branch.phone, city: branch.city, country: branch.country },
        { name: 'Main Branch', location: 'Shop 7, Tariq Road', phone: '+92 300 7654321', city: 'Karachi', country: 'Pakistan' },
    );
    assert.deepEqual(first.body.branches.map((item: any) => item.id), [String(branch._id)]);
    const employees = await Employee.find({ businessId: business._id }).lean();
    assert.ok(employees.every((employee) => String(employee.branchId) === String(branch._id)));

    // Later visits keep the branch, and employees added afterwards are not moved automatically.
    await Employee.create({ businessId: business._id, employeeCode: 'EMP-003', fullName: 'Late Joiner' });
    const overview = await call(getOrganizationOverview);
    assert.equal(overview.code, 200);
    assert.equal(overview.body.branches.length, 1);
    assert.equal(overview.body.employees.find((employee: any) => employee.fullName === 'Late Joiner').branchId, null);
});

test('branches can be added and edited, and a branch-scoped administrator keeps the branches they add', { timeout: 180000 }, async (t) => {
    const db = await MongoMemoryServer.create();
    t.after(async () => { await mongoose.disconnect(); await db.stop(); });
    await mongoose.connect(db.getUri());
    await Promise.all([Business.init(), User.init(), Employee.init(), AppSetting.init()]);
    const cityLookups = t.mock.method(locations, 'getCities', async () => ['Karachi', 'Lahore']);
    t.mock.method(locations, 'getCountries', async () => [{ code: 'PK', name: 'Pakistan' }]);

    const businessId = new mongoose.Types.ObjectId();
    const [owner, scoped] = await User.create([
        { name: 'Owner', email: 'owner-branches@example.com', password: 'test-only-password', role: 'admin', businessId },
        { name: 'Scoped', email: 'scoped-branches@example.com', password: 'test-only-password', role: 'admin', businessId },
    ]);
    await Business.create({
        _id: businessId, name: 'Branch Client', slug: 'branch-client-test',
        branches: [{ name: 'Main', city: 'Karachi', countryCode: 'PK', country: 'Pakistan', adminUserId: scoped._id, adminUserIds: [scoped._id] }],
    });
    const call = async (handler: typeof createBranch, actor: typeof owner, body: unknown = {}, id = '') => {
        const result = { code: 200, body: {} as any };
        const res = { status(code: number) { result.code = code; return res; }, json(value: unknown) { result.body = value; return res; } } as unknown as Response;
        await handler({ body, params: { id }, user: { id: String(actor._id), role: 'admin', businessId: String(businessId), businessIsLegacy: false } } as unknown as AuthRequest, res);
        return result;
    };

    const added = await call(createBranch, owner, { name: 'Lahore Branch', phone: '+92 300 1111111', countryCode: 'pk', city: 'Lahore' });
    assert.equal(added.code, 201);
    assert.deepEqual({ ...added.body, id: undefined }, { id: undefined, name: 'Lahore Branch', location: '', phone: '+92 300 1111111', city: 'Lahore', countryCode: 'PK', country: 'Pakistan', adminUserIds: [] });
    assert.equal((await call(createBranch, owner, { name: 'Head Office' })).code, 201, 'only a name is required');
    assert.equal((await call(createBranch, owner, { name: 'lahore branch' })).code, 409);
    assert.equal((await call(createBranch, owner, { name: 'Elsewhere', countryCode: 'PK', city: 'Boston' })).code, 400);
    assert.equal((await call(createBranch, owner, { name: 'Elsewhere', city: 'Lahore' })).code, 400);
    assert.equal((await call(createBranch, owner, { name: 'Elsewhere', phone: 'bad' })).code, 400);

    const scopedAdded = await call(createBranch, scoped, { name: 'Scoped Branch' });
    assert.equal(scopedAdded.code, 201);
    assert.deepEqual(scopedAdded.body.adminUserIds, [String(scoped._id)]);
    const scopedView = await call(getBranches, scoped);
    assert.deepEqual(scopedView.body.branches.map((branch: any) => branch.name), ['Main', 'Scoped Branch']);

    // An unchanged place is kept without asking the location service again.
    const lookupsBefore = cityLookups.mock.callCount();
    const edited = await call(updateBranch, owner, { name: 'Lahore Central', location: '1 Mall Road', phone: '', countryCode: 'PK', city: 'Lahore' }, added.body.id);
    assert.equal(edited.code, 200);
    assert.equal(cityLookups.mock.callCount(), lookupsBefore);
    assert.deepEqual([edited.body.name, edited.body.location, edited.body.phone, edited.body.city], ['Lahore Central', '1 Mall Road', '', 'Lahore']);
    assert.equal((await call(updateBranch, owner, { name: 'Main' }, added.body.id)).code, 409);
    assert.equal((await call(updateBranch, scoped, { name: 'Taken Over' }, added.body.id)).code, 404, 'a branch-scoped administrator cannot edit other branches');
    const stored = await Business.findById(businessId).orFail();
    assert.deepEqual(stored.branches.map((branch) => branch.name), ['Main', 'Lahore Central', 'Head Office', 'Scoped Branch']);
});
