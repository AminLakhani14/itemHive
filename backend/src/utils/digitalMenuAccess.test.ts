import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import User, { type IUser } from '../models/User';
import OrderDraft from '../models/OrderDraft';
import * as tenancy from './tenancy';
import { getDigitalMenuAccess, hasExplicitScreenPermission, serializeUser } from './accessControl';
import { protect, requireInstallmentAccess, requireScreenAccess, type AuthRequest } from '../middleware/auth';
import { getTableDrafts } from '../controllers/digitalMenuController';
import { updateAdminScreenPermissions, updateUserStatus } from '../controllers/userController';
import productRoutes from '../routes/productRoutes';
import categoryRoutes from '../routes/categoryRoutes';

const response = () => {
    const result = { status: 200, body: undefined as any };
    const res = { status: (code: number) => { result.status = code; return res; }, json: (body: unknown) => { result.body = body; return res; } } as Response;
    return { result, res };
};

test('explicit menu assignments override every old access flag without changing staff access', () => {
    for (const digitalMenuAccess of ['none', 'menu', 'pos'] as const) {
        const admin = { role: 'admin', digitalMenuAccess, screenPermissions: ['digital_menus'] };
        const expected = 'pos';
        assert.equal(getDigitalMenuAccess(admin), expected);
        assert.equal(serializeUser(admin as IUser).digitalMenuAccess, expected);
        assert.equal(getDigitalMenuAccess({ ...admin, screenPermissions: [] }), 'none');
        assert.equal(getDigitalMenuAccess({ ...admin, screenPermissions: null }), digitalMenuAccess);
        assert.equal(getDigitalMenuAccess({ ...admin, role: 'user' }), digitalMenuAccess);
        assert.equal(getDigitalMenuAccess({ ...admin, role: 'super_admin', screenPermissions: [] }), 'pos');
    }
});

test('authenticated API requests accept an already saved checked permission and reject its removal', async t => {
    const user = { _id: '507f1f77bcf86cd799439011', name: 'Waqas', email: 'fixture@example.invalid', role: 'admin', isActive: true, digitalMenuAccess: 'none', installmentAccess: false, discountAccess: false, screenPermissions: ['digital_menus', 'installments', 'settings'] };
    t.mock.method(User, 'findById', () => ({ select: async () => user }) as any);
    t.mock.method(tenancy, 'ensureUserBusiness', async () => ({ _id: '507f1f77bcf86cd799439012', isActive: true, isLegacy: false, name: 'Fixture business' }) as any);
    t.mock.method(OrderDraft, 'find', () => ({ sort: () => ({ lean: async () => [] }) }) as any);
    const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET || 'secret');
    const request = () => ({ headers: { authorization: `Bearer ${token}` } }) as AuthRequest;
    const req = request();
    const { res, result } = response();
    let authenticated = false;
    await protect(req, res, () => { authenticated = true; });
    assert.equal(authenticated, true);
    assert.equal(req.user!.digitalMenuAccess, 'pos');
    assert.equal(req.user!.installmentAccess, true);
    assert.equal(req.user!.discountAccess, true);
    let installmentAllowed = false;
    await requireInstallmentAccess(req, res, () => { installmentAllowed = true; });
    assert.equal(installmentAllowed, true);
    let allowed = false;
    requireScreenAccess('digital_menus')(req, res, () => { allowed = true; });
    assert.equal(allowed, true);
    await getTableDrafts(req, res);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, []);

    user.screenPermissions = [];
    const denied = request();
    await protect(denied, res, () => {});
    assert.equal(denied.user!.digitalMenuAccess, 'none');
    requireScreenAccess('digital_menus')(denied, res, () => assert.fail('Removed permission must be denied'));
    assert.equal(result.status, 403);
});

test('saving permissions grants full menu access and secondary Team updates cannot revoke it', async t => {
    const user = { _id: 'fixture', role: 'admin', digitalMenuAccess: 'none', screenPermissions: [] as string[], save: async () => {} };
    t.mock.method(User, 'findById', async () => user as any);
    const { res, result } = response();
    await updateAdminScreenPermissions({ params: { id: 'fixture' }, body: { screenPermissions: ['digital_menus', 'dashboard'] } } as unknown as AuthRequest, res);
    assert.equal(result.status, 200);
    assert.equal(result.body.user.digitalMenuAccess, 'pos');

    for (const access of ['none', 'menu', 'pos', 'none']) {
        await updateUserStatus({ params: { id: 'fixture' }, body: { digitalMenuAccess: access } } as unknown as AuthRequest, res);
        assert.equal(result.status, 200);
        assert.equal(result.body.user.digitalMenuAccess, 'pos');
        assert.equal(user.screenPermissions.includes('digital_menus'), true);
        assert.ok(user.screenPermissions.includes('dashboard'));
    }
    await updateAdminScreenPermissions({ params: { id: 'fixture' }, body: { screenPermissions: ['dashboard'] } } as unknown as AuthRequest, res);
    assert.equal(result.body.user.digitalMenuAccess, 'none');
});

test('installment grants bypass secondary account and feature settings, but unrelated grants do not', async t => {
    const setting = t.mock.method(tenancy, 'getCachedAppSettingsForTenant', async () => ({ installmentsEnabled: false }) as any);
    const { res, result } = response();
    const granted = { role: 'admin', installmentAccess: false, discountAccess: false, screenPermissions: ['installments', 'settings'] };
    assert.equal(serializeUser(granted as IUser).installmentAccess, true);
    assert.equal(serializeUser(granted as IUser).discountAccess, true);
    let allowed = false;
    await requireInstallmentAccess({ user: granted } as AuthRequest, res, () => { allowed = true; });
    assert.equal(allowed, true);
    assert.equal(setting.mock.callCount(), 0);
    for (const user of [
        { ...granted, screenPermissions: ['pos'] },
        { ...granted, role: 'user' },
        { ...granted, screenPermissions: null },
    ]) {
        assert.equal(hasExplicitScreenPermission(user, 'installments'), false);
        await requireInstallmentAccess({ user } as AuthRequest, res, () => assert.fail('Other permissions must not bypass installment access'));
        assert.equal(result.status, 403);
    }
});

test('a Digital Menus grant alone permits the product and category reads needed to build menus', () => {
    for (const [router, guardIndex] of [[productRoutes, 1], [categoryRoutes, 0]] as const) {
        const route = (router as any).stack.find((layer: any) => layer.route?.path === '/' && layer.route.methods.get).route;
        const guard = route.stack[guardIndex].handle;
        const { res, result } = response();
        let allowed = false;
        guard({ user: { role: 'admin', screenPermissions: ['digital_menus'] } }, res, () => { allowed = true; });
        assert.equal(allowed, true);
        guard({ user: { role: 'admin', screenPermissions: [] } }, res, () => assert.fail('No grant must be denied'));
        assert.equal(result.status, 403);
    }
});
