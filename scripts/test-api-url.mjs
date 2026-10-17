import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/api/apiUrl.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const module = { exports: {} };
new Function('module', 'exports', outputText)(module, module.exports);
const { resolveApiUrl, LOCAL_API_URL, DEPLOYED_API_URL } = module.exports;

test('development uses local API and respects explicit development configuration', () => {
    assert.equal(resolveApiUrl(true), LOCAL_API_URL);
    assert.equal(resolveApiUrl(true, 'http://localhost:5050/api'), LOCAL_API_URL);
    assert.equal(resolveApiUrl(true, DEPLOYED_API_URL), DEPLOYED_API_URL);
});

test('deployed builds use the hosted API even when hosting variables contain a loopback URL', () => {
    assert.equal(resolveApiUrl(false), DEPLOYED_API_URL);
    for (const url of ['http://localhost:5050/api', 'http://127.0.0.1:5050/api', 'http://127.1:5050/api', 'http://[::1]:5050/api', 'http://0.0.0.0:5050/api', 'http://api.localhost:5050/api']) {
        assert.equal(resolveApiUrl(false, url), DEPLOYED_API_URL);
    }
});

test('valid hosted overrides are retained and malformed URLs use the default', () => {
    assert.equal(resolveApiUrl(false, ' https://api.example.com/api/ '), 'https://api.example.com/api');
    for (const url of ['', 'invalid url', 'javascript:alert(1)']) assert.equal(resolveApiUrl(false, url), DEPLOYED_API_URL);
});
