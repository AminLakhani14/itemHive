import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import * as importer from '../services/oldMenuImport';
import { importOldMenu } from './menuImportController';

const request = (body: Record<string, unknown>) => ({ user: { id: 'staff', businessId: 'workspace', role: 'admin', digitalMenuAccess: 'view' }, body }) as unknown as AuthRequest;
const response = () => {
    const result = { status: 200, body: undefined as any };
    const res = { status: (code: number) => { result.status = code; return res; }, json: (body: unknown) => { result.body = body; return res; } } as unknown as Response;
    return { result, res };
};
test('import endpoint validates sources and access before AI; failures keep the current menu unchanged', async t => {
    const original = process.env.GEMINI_API_KEYS; process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    const mock = t.mock.method(importer, 'extractOldMenu', async () => { throw new importer.InvalidMenuFileError('Choose a valid photo.'); });
    for (const body of [{}, { file: 'x', text: 'Pepsi 180' }, { text: 'x'.repeat(20001) }, { file: 'x'.repeat(2800001) }]) { const { res, result } = response(); await importOldMenu(request(body), res); assert.equal(result.status, 400); }
    assert.equal(mock.mock.callCount(), 0);
    const denied = request({ text: 'Pepsi 180' }); denied.user!.digitalMenuAccess = 'none';
    const first = response(); await importOldMenu(denied, first.res); assert.equal(first.result.status, 403);
    const second = response(); await importOldMenu(request({ file: 'invalid' }), second.res); assert.equal(second.result.status, 400); assert.match(second.result.body.message, /valid photo/);
});
test('import endpoint returns extracted review data and clears the busy guard after completion', async t => {
    const original = process.env.GEMINI_API_KEYS; process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    t.mock.method(importer, 'extractOldMenu', async () => { await pending; return { name: 'Cafe', notes: '', sections: [{ name: 'Drinks', page: 1, items: [{ name: 'Pepsi', price: 180 }] }] }; });
    const first = response(); const job = importOldMenu(request({ text: 'Pepsi 180' }), first.res);
    const concurrent = response(); await importOldMenu(request({ text: 'Fanta 100' }), concurrent.res); assert.equal(concurrent.result.status, 409);
    release(); await job; assert.equal(first.result.status, 200); assert.equal(first.result.body.sections[0].items[0].price, 180);
    const retry = response(); await importOldMenu(request({ text: 'Pepsi 180' }), retry.res); assert.equal(retry.result.status, 200);
});
