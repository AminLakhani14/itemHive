import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { combineReducers, configureStore } = require('@reduxjs/toolkit');
const { persistReducer, REHYDRATE } = require('redux-persist');
const { AxiosError } = require('axios');

function fixture(post = async () => { throw new Error('Unexpected request'); }) {
    const values = new Map();
    const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const load = name => {
        const module = { exports: {} };
        const source = readFileSync(new URL(`../src/features/auth/${name}.ts`, import.meta.url), 'utf8');
        const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
        new Function('require', 'module', 'exports', 'localStorage', outputText)(id => id === '../../api/axios' ? { default: { post } } : require(id), module, module.exports, localStorage);
        return module.exports;
    };
    const auth = load('authSlice');
    const { authPersistence } = load('authPersistence');
    return { auth, authPersistence, localStorage };
}

test('persisting an in-flight login saves only session data; legacy loading/errors cannot disable the form after reload', () => {
    const { auth, authPersistence } = fixture();
    const pending = { user: null, token: null, isAuthenticated: false, loading: true, error: 'Old error' };
    assert.deepEqual(authPersistence.in(pending, 'auth', {}), { user: null, token: null, isAuthenticated: false });
    const restored = authPersistence.out(pending, 'auth', {});
    const reducer = persistReducer({ key: 'root', storage: {}, transforms: [authPersistence] }, combineReducers({ auth: auth.default }));
    const state = reducer(reducer(undefined, { type: '@@INIT' }), { type: REHYDRATE, key: 'root', payload: { auth: restored } });
    assert.equal(state.auth.loading, false);
    assert.equal(state.auth.error, null);
    assert.equal(state.auth.isAuthenticated, false);
});

test('session persistence preserves a signed-in user and unrelated saved settings', () => {
    const { authPersistence } = fixture();
    const session = { user: { id: 'fixture-user', role: 'user' }, token: 'fixture-token', isAuthenticated: true, loading: true, error: 'Expired error' };
    const restored = authPersistence.out(authPersistence.in(session, 'auth', {}), 'auth', {});
    assert.deepEqual(restored, { ...session, loading: false, error: null });
    const settings = { loading: true };
    assert.equal(authPersistence.out(settings, 'settings', {}), settings);
});

test('logout clears a pending spinner and its error', () => {
    const { auth } = fixture();
    const pending = auth.default(undefined, auth.loginUser.pending('fixture-request', {}));
    assert.equal(pending.loading, true);
    const loggedOut = auth.default({ ...pending, error: 'Old error' }, auth.logout());
    assert.equal(loggedOut.loading, false);
    assert.equal(loggedOut.error, null);
});

test('login sets a finite request deadline and restores the form on timeout', async () => {
    const { auth } = fixture(async (url, credentials, config) => {
        assert.equal(url, '/auth/login');
        assert.equal(config.timeout, 30000);
        assert.ok(config.signal instanceof AbortSignal);
        throw new AxiosError('timeout', 'ECONNABORTED');
    });
    const store = configureStore({ reducer: auth.default });
    const result = await store.dispatch(auth.loginUser({ email: 'fixture@example.invalid', password: 'fixture-only' }));
    assert.equal(result.type, 'auth/login/rejected');
    assert.equal(store.getState().loading, false);
    assert.match(store.getState().error, /timed out/);
});

test('unavailable backend restores the form and shows a readable error instead of internal server details', async () => {
    const { auth } = fixture(async () => { throw new AxiosError('failure', 'ERR_BAD_RESPONSE', undefined, undefined, { status: 500, data: { message: 'private database internals' } }); });
    const store = configureStore({ reducer: auth.default });
    await store.dispatch(auth.loginUser({ email: 'fixture@example.invalid', password: 'fixture-only' }));
    assert.equal(store.getState().loading, false);
    assert.match(store.getState().error, /sign-in service/);
    assert.doesNotMatch(store.getState().error, /database internals/);
});

test('successful login still stores the session and clears loading', async () => {
    const user = { id: 'fixture-user', role: 'user', email: 'fixture@example.invalid' };
    const { auth, localStorage } = fixture(async () => ({ data: { token: 'fixture-token', user } }));
    const store = configureStore({ reducer: auth.default });
    await store.dispatch(auth.loginUser({ email: user.email, password: 'fixture-only' }));
    assert.equal(store.getState().loading, false);
    assert.equal(store.getState().isAuthenticated, true);
    assert.equal(localStorage.getItem('token'), 'fixture-token');
});
