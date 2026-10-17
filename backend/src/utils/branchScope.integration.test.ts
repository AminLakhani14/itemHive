import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Business from '../models/Business';
import Category from '../models/Category';
import Product from '../models/Product';
import InventoryVendors from '../models/InventoryVendors';
import { acrossBranches, buildBranchScope, resolveBranchAccess, runInBranchScope } from './branchScope';
import { adoptUnbranchedRecords } from './branchData';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import User from '../models/User';
import { protect, type AuthRequest } from '../middleware/auth';

const ids = () => new mongoose.Types.ObjectId();

test('branch access: super admins and unassigned administrators use every branch; others only their own', () => {
    const [main, second, third, owner, manager] = [ids(), ids(), ids(), ids(), ids()];
    const business = { branches: [{ _id: main }, { _id: second, adminUserIds: [manager] }, { _id: third, adminUserId: manager }] };
    const all = [main, second, third].map(String);

    assert.deepEqual(resolveBranchAccess(business, { id: 'x', role: 'super_admin' })?.branchIds, all);
    assert.deepEqual(resolveBranchAccess(business, { id: String(owner), role: 'admin' })?.branchIds, all, 'an owner without assignments uses every branch');
    const managed = resolveBranchAccess(business, { id: String(manager), role: 'admin' }, String(main));
    assert.deepEqual(managed?.branchIds, [String(second), String(third)]);
    assert.equal(managed?.activeBranchId, String(second), 'a branch the login cannot use falls back to its first branch');
    assert.equal(resolveBranchAccess(business, { id: String(manager), role: 'admin' }, String(third))?.activeBranchId, String(third));
    assert.deepEqual(resolveBranchAccess(business, { id: 'staff', role: 'user', branchId: third }, String(main))?.branchIds, [String(third)], 'staff cannot switch branches');
    assert.deepEqual(resolveBranchAccess(business, { id: 'staff', role: 'user' })?.branchIds, [String(main)], 'staff without a branch work in the main branch');
    assert.equal(resolveBranchAccess({ branches: [] }, { id: 'x', role: 'admin' }), null, 'a business without branches is not filtered');
});

test('branch-scoped models keep each branch\'s records apart', { timeout: 180000 }, async (t) => {
    const db = await MongoMemoryServer.create();
    t.after(async () => { await mongoose.disconnect(); await db.stop(); });
    await mongoose.connect(db.getUri());
    await Promise.all([Business.init(), Category.init(), Product.init(), InventoryVendors.init()]);

    const [mainId, secondId] = [ids(), ids()];
    const business = await Business.create({ name: 'Two Shops', slug: 'two-shops', branches: [{ _id: mainId, name: 'Main' }, { _id: secondId, name: 'Second' }] });
    const access = (branchId: mongoose.Types.ObjectId) => resolveBranchAccess(business, { id: 'owner', role: 'admin' }, String(branchId))!;
    const inMain = <T>(fn: () => Promise<T>) => runInBranchScope(buildBranchScope(access(mainId)), fn);
    const inSecond = <T>(fn: () => Promise<T>) => runInBranchScope(buildBranchScope(access(secondId)), fn);
    const product = (sku: string) => ({ id: `p-${sku}`, sku, name: sku, category: 'Food', purchasePrice: 1, salePrice: 2, price: 2, stock: 5, minStock: 1, businessId: business._id });

    // Saved before the business had branches, so it belongs to the main branch.
    await Category.create({ name: 'Legacy', normalizedName: 'legacy', businessId: business._id });
    const mainDrinks = await inMain(() => Category.create({ name: 'Drinks', normalizedName: 'drinks', businessId: business._id }));
    const secondDrinks = await inSecond(() => Category.create({ name: 'Drinks', normalizedName: 'drinks', businessId: business._id }));
    assert.equal(String(mainDrinks.get('branchId')), String(mainId));
    assert.equal(String(secondDrinks.get('branchId')), String(secondId), 'the same category name is allowed in another branch');
    await assert.rejects(inSecond(() => Category.create({ name: 'Drinks', normalizedName: 'drinks', businessId: business._id })), /duplicate key/);

    const names = (docs: Array<{ name: string }>) => docs.map((doc) => doc.name).sort();
    assert.deepEqual(names(await inMain(() => Category.find({ businessId: business._id }).lean().exec())), ['Drinks', 'Legacy']);
    assert.deepEqual(names(await inSecond(() => Category.find({ businessId: business._id }).lean().exec())), ['Drinks']);
    assert.equal(await inSecond(() => Category.findById(mainDrinks._id).exec()), null, 'another branch\'s record cannot be opened by id');
    assert.equal((await inSecond(() => Category.updateMany({}, { $set: { archived: true } }).exec())).modifiedCount, 1);
    assert.equal((await Category.findById(mainDrinks._id).orFail()).archived, false, 'updates stay in the active branch');
    assert.equal(await inSecond(() => Category.countDocuments({}).exec()), 1);
    const [grouped] = await inSecond(() => Category.aggregate([{ $group: { _id: null, count: { $sum: 1 } } }]).exec());
    assert.equal(grouped.count, 1, 'aggregations stay in the active branch');

    await inSecond(() => Product.insertMany([product('A'), product('B')]));
    await inMain(() => Product.create(product('A')));
    assert.deepEqual((await Product.find({ sku: 'A' })).map((item) => String(item.get('branchId'))).sort(), [String(mainId), String(secondId)].sort());
    assert.equal(await inMain(() => Product.countDocuments({}).exec()), 1);

    // Upserts create the record in the active branch.
    await inSecond(() => InventoryVendors.findOneAndUpdate({ businessId: business._id }, { $setOnInsert: { vendors: [] } }, { upsert: true, new: true }).exec());
    assert.equal(String((await InventoryVendors.findOne({ businessId: business._id }).orFail()).get('branchId')), String(secondId));

    const everything = buildBranchScope(access(mainId), true);
    assert.equal(await runInBranchScope(everything, () => Category.countDocuments({}).exec()), 3, 'the read-only view covers every allowed branch');
    assert.equal(await inSecond(() => acrossBranches(() => Category.countDocuments({}).exec())), 3, 'cross-branch screens opt out explicitly');

    await adoptUnbranchedRecords(business._id, mainId);
    assert.equal(await Category.countDocuments({ branchId: null }), 0, 'records without a branch are adopted by the main branch');
    assert.deepEqual(names(await inMain(() => Category.find({}).lean().exec())), ['Drinks', 'Legacy']);
});

test('protect runs each request in the branch the login asked for and may use', { timeout: 180000 }, async (t) => {
    const db = await MongoMemoryServer.create();
    t.after(async () => { await mongoose.disconnect(); await db.stop(); });
    await mongoose.connect(db.getUri());
    await Promise.all([Business.init(), Category.init(), User.init()]);

    const [mainId, secondId] = [ids(), ids()];
    const businessId = ids();
    const [owner, staff] = await User.create([
        { name: 'Owner', email: 'owner-scope@example.com', password: 'test-only-password', role: 'admin', businessId },
        { name: 'Staff', email: 'staff-scope@example.com', password: 'test-only-password', role: 'user', businessId, branchId: secondId },
    ]);
    await Business.create({ _id: businessId, name: 'Scoped', slug: 'scoped-requests', branches: [{ _id: mainId, name: 'Main' }, { _id: secondId, name: 'Second' }] });
    await Category.collection.insertMany([
        { name: 'Main only', normalizedName: 'main only', businessId, branchId: mainId },
        { name: 'Second only', normalizedName: 'second only', businessId, branchId: secondId },
    ]);

    const request = async (user: typeof owner, { branch = '', method = 'GET', scope = '' } = {}) => {
        const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET || 'secret');
        const req = { headers: { authorization: `Bearer ${token}`, 'x-itemhive-branch-id': branch }, method, query: scope ? { branchScope: scope } : {} } as unknown as AuthRequest;
        const res = { status() { return res; }, json() { return res; } } as unknown as Response;
        let names: Promise<string[]> | undefined;
        await protect(req, res, () => { names = Category.find({}).lean().exec().then((docs) => docs.map((doc) => doc.name).sort()); });
        return { user: req.user!, names: await names! };
    };

    const second = await request(owner, { branch: String(secondId) });
    assert.deepEqual(second.names, ['Second only']);
    assert.equal(second.user.branchId, String(secondId));
    assert.deepEqual((await request(owner)).names, ['Main only'], 'without a choice the main branch is used');
    assert.deepEqual((await request(owner, { scope: 'all' })).names, ['Main only', 'Second only']);
    assert.deepEqual((await request(owner, { method: 'POST', scope: 'all' })).names, ['Main only'], 'the combined view is read-only');
    const staffView = await request(staff, { branch: String(mainId), scope: 'all' });
    assert.deepEqual(staffView.names, ['Second only'], 'staff stay in their own branch');
    assert.equal(staffView.user.branchScope, 'branch');
});
