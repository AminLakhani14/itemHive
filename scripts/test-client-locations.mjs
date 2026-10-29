import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api/clientLocations.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
function load(fetch) {
    const exports = {};
    new Function('exports', 'fetch', 'AbortSignal', outputText)(exports, fetch, AbortSignal);
    return exports;
}
const response = (data) => ({ ok: true, json: async () => ({ error: false, data }) });

test('countries load directly from the public API without Ozor credentials or backend routes', async () => {
    const locations = load(async (url, options) => {
        assert.equal(url, 'https://countriesnow.space/api/v0.1/countries/iso');
        assert.equal(options.credentials, 'omit');
        assert.equal(options.headers, undefined);
        return response([{ name: 'United States', Iso2: 'US' }, { name: 'Pakistan', Iso2: 'PK' }, { name: 'Invalid' }]);
    });
    assert.deepEqual(await locations.loadCountries(new AbortController().signal), [
        { code: 'PK', name: 'Pakistan' }, { code: 'US', name: 'United States' },
    ]);
});

test('city queries use the selected country name and keep Pakistan and US results separate', async () => {
    const locations = load(async (url) => {
        const country = new URL(url).searchParams.get('country');
        assert.ok(['Pakistan', 'United States'].includes(country));
        return response(country === 'Pakistan' ? ['Lahore', 'Karachi', 'Karachi'] : ['New York', 'Boston']);
    });
    const signal = new AbortController().signal;
    assert.deepEqual(await locations.loadCities({ code: 'PK', name: 'Pakistan' }, signal), ['Karachi', 'Lahore']);
    assert.deepEqual(await locations.loadCities({ code: 'US', name: 'United States' }, signal), ['Boston', 'New York']);
});

test('HTTP errors and malformed location responses reject so the form can offer Retry', async () => {
    for (const result of [
        { ok: false },
        { ok: true, json: async () => ({ error: true, data: [] }) },
        response(null), response([]),
    ]) {
        const locations = load(async () => result);
        await assert.rejects(locations.loadCountries(new AbortController().signal));
    }
    const locations = load(async () => response(['Karachi', 42]));
    await assert.rejects(locations.loadCities({ code: 'PK', name: 'Pakistan' }, new AbortController().signal));
});

test('changing country aborts its pending city request', async () => {
    const controller = new AbortController();
    const locations = load((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = locations.loadCities({ code: 'PK', name: 'Pakistan' }, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
});
