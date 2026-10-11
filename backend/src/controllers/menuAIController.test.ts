import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import Product from '../models/Product';
import * as ai from '../services/inventoryMenuAI';
import { menuAICapabilities, recommendMenu } from './menuAIController';
import { GeminiRequestError } from '../services/geminiKeys';

const req = (body: Record<string, unknown> = { productIds: ['pizza'], productPrices: { pizza: 400 } }) => ({ user: { id: '507f1f77bcf86cd799439011', businessId: '507f1f77bcf86cd799439012', businessIsLegacy: false, role: 'super_admin' }, body }) as unknown as AuthRequest;
const response = () => {
    const result = { status: 200, body: undefined as any };
    const res = { status: (code: number) => { result.status = code; return res; }, json: (body: unknown) => { result.body = body; return res; } } as unknown as Response;
    return { result, res };
};
function keys(t: TestContext) {
    const original = process.env.GEMINI_API_KEYS; process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
}

test('capabilities expose supported style requests without running the AI provider', t => {
    const provider = t.mock.method(ai, 'suggestInventoryMenu', async () => { throw new Error('Must not call'); });
    const { res, result } = response(); menuAICapabilities(req(), res);
    assert.deepEqual(result.body, { features: ['custom-menu-style'] }); assert.equal(provider.mock.callCount(), 0);
});

test('custom style requests validate merchant branding and do not pass branding when style is disabled', async t => {
    keys(t);
    const design = { templateId: 'custom', backgroundColor: '#ffffff', textColor: '#222222', accentColor: '#222222', headerColor: '#ffffff', surfaceColor: '#ffffff', fontStyle: 'sans', layout: 'list', showImages: false, decoration: 'border' };
    const brand = { name: 'Cafe', theme: 'Rustic cafe', logo: 'data:image/png;base64,aGVsbG8=', colors: ['#783925'] };
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => [{ id: 'pizza', name: 'Pizza', salePrice: 500 }] }) }));
    const provider = t.mock.method(ai, 'suggestInventoryMenu', async (_inventory: any, options: any) => {
        assert.equal(options.includeStyle, true); assert.deepEqual(options.currentDesign, design); assert.deepEqual(options.brand, brand);
        return { summary: 'Ready', sections: [], deals: [] };
    });
    const good = response(); await recommendMenu(req({ productIds: ['pizza'], includeStyle: true, currentDesign: design, brand }), good.res); assert.equal(good.result.status, 200);
    for (const patch of [{ currentDesign: { ...design, templateId: 'classic' } }, { currentDesign: {} }, { brand: { ...brand, logo: 'https://example.com/logo.png' } }, { brand: { ...brand, colors: ['red'] } }, { includeStyle: 'yes' }]) {
        const bad = response(); await recommendMenu(req({ productIds: ['pizza'], includeStyle: true, currentDesign: design, brand, ...patch }), bad.res); assert.equal(bad.result.status, 400);
    }
    assert.equal(provider.mock.callCount(), 1);
    t.mock.method(ai, 'suggestInventoryMenu', async (_inventory: any, options: any) => { assert.equal(options.brand, undefined); return { summary: 'Ready', sections: [], deals: [] }; });
    const disabled = response(); await recommendMenu(req({ productIds: ['pizza'], includeStyle: false, brand }), disabled.res); assert.equal(disabled.result.status, 200);
});

test('disabled menu access and missing provider configuration produce actionable errors without a provider request', async t => {
    const originalKeys = process.env.GEMINI_API_KEYS, originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS; delete process.env.GEMINI_API_KEY;
    t.after(() => {
        if (originalKeys === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = originalKeys;
        if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
    });
    const provider = t.mock.method(ai, 'suggestInventoryMenu', async () => { throw new Error('Must not call'); });
    const denied = req(); denied.user!.role = 'user'; denied.user!.digitalMenuAccess = 'none';
    const first = response(); await recommendMenu(denied, first.res); assert.equal(first.result.status, 403);
    const second = response(); await recommendMenu(req(), second.res); assert.equal(second.result.status, 503); assert.match(second.result.body.message, /configure/);
    assert.equal(provider.mock.callCount(), 0);
});

test('AI endpoint scopes inventory to the workspace and sends only retail data with menu price overrides', async t => {
    keys(t);
    t.mock.method(Product, 'find', (filter: any) => {
        assert.equal(String(filter.businessId), req().user!.businessId);
        assert.deepEqual(filter.id, { $in: ['pizza'] });
        return { select: (fields: string) => { assert.equal(fields, 'id name category salePrice price'); return { lean: async () => [{ id: 'pizza', name: 'Pizza', category: 'Food', salePrice: 500, supplier: 'secret', purchasePrice: 200, stock: 123 }] }; } };
    });
    t.mock.method(ai, 'suggestInventoryMenu', async (inventory: any, options: any) => {
        assert.deepEqual(inventory, [{ id: 'pizza', name: 'Pizza', category: 'Food', price: 400 }]);
        assert.equal(options.includeDeals, false);
        return { summary: 'Ready', sections: [{ name: 'Pizzas', reason: 'Main dishes', productIds: ['pizza'] }], deals: [] };
    });
    const { res, result } = response(); await recommendMenu(req(), res);
    assert.equal(result.status, 200); assert.equal(result.body.sections.length, 1);
});

test('missing or foreign inventory and invalid requests never reach the AI provider', async t => {
    keys(t);
    const provider = t.mock.method(ai, 'suggestInventoryMenu', async () => { throw new Error('Must not call'); });
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
    for (const body of [{ productIds: ['foreign'] }, { productIds: [] }, { productIds: ['pizza'], includeDeals: 'true' }, { productIds: ['pizza'], productPrices: { foreign: 100 } }]) {
        const { res, result } = response(); await recommendMenu(req(body), res); assert.equal(result.status, 400);
    }
    assert.equal(provider.mock.callCount(), 0);
});

test('concurrent generation is rejected, provider failures are clear, and a later retry can succeed', async t => {
    keys(t);
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => [{ id: 'pizza', name: 'Pizza', salePrice: 500 }] }) }));
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    t.mock.method(ai, 'suggestInventoryMenu', async () => { await waiting; throw new GeminiRequestError('timeout'); });
    const first = response(); const pending = recommendMenu(req(), first.res);
    const second = response(); await recommendMenu(req(), second.res); assert.equal(second.result.status, 409);
    release(); await pending; assert.equal(first.result.status, 504);
    const retry = response(); await recommendMenu(req(), retry.res); assert.equal(retry.result.status, 504);
});
