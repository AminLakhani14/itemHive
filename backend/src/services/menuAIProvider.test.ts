import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMenuAI, getMenuAIModels } from './menuAIProvider';

test('menu models default to Flash-Lite independently of theme models, and respect explicit overrides', t => {
    const keys = ['GEMINI_MENU_MODEL', 'GEMINI_MENU_FALLBACK_MODELS', 'GEMINI_THEME_MODEL'];
    const previous = keys.map(key => process.env[key]);
    t.after(() => keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }));
    delete process.env.GEMINI_MENU_MODEL; delete process.env.GEMINI_MENU_FALLBACK_MODELS;
    process.env.GEMINI_THEME_MODEL = 'slow-theme-model';
    assert.deepEqual(getMenuAIModels(), ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash']);
    process.env.GEMINI_MENU_MODEL = ' primary '; process.env.GEMINI_MENU_FALLBACK_MODELS = 'backup,primary,backup';
    assert.deepEqual(getMenuAIModels(), ['primary', 'backup']);
    process.env.GEMINI_MENU_FALLBACK_MODELS = '';
    assert.deepEqual(getMenuAIModels(), ['primary']);
});

test('model fallback uses compatible low-latency thinking options and identical menu inputs', async t => {
    const keys = ['GEMINI_API_KEYS', 'GEMINI_MENU_MODEL', 'GEMINI_MENU_FALLBACK_MODELS'];
    const previous = keys.map(key => process.env[key]);
    t.after(() => keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }));
    process.env.GEMINI_API_KEYS = 'fixture-key';
    process.env.GEMINI_MENU_MODEL = 'gemini-3.8-flash'; process.env.GEMINI_MENU_FALLBACK_MODELS = 'gemini-3.5-flash-lite,gemini-2.5-flash';
    const thinking: unknown[] = [];
    const request = { contents: [{ parts: [{ text: 'Synthetic menu only' }] }], generationConfig: { responseMimeType: 'application/json' } };
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        assert.deepEqual(body.contents, request.contents);
        assert.equal(body.generationConfig.responseMimeType, 'application/json');
        thinking.push(body.generationConfig.thinkingConfig);
        return new Response('{}', { status: thinking.length < 3 ? 404 : 200 });
    });
    assert.equal((await fetchMenuAI(request)).status, 200);
    assert.deepEqual(thinking, [{ thinkingLevel: 'low' }, { thinkingLevel: 'minimal' }, { thinkingBudget: 0 }]);
});
