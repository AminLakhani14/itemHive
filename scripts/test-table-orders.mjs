import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/hooks/useTableOrders.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const flush = () => new Promise(resolve => setImmediate(resolve));

// Exercise async refreshes with controlled requests and events, without a live workspace.
function mount(enabled = true, userId = 'staff', allDrafts = false) {
    const states = []; const effects = []; const requests = []; const timers = new Map();
    const window = new EventTarget(); const document = new EventTarget();
    document.visibilityState = 'visible';
    window.setInterval = callback => { timers.set(1, callback); return 1; };
    window.clearInterval = id => timers.delete(id);
    const modules = {
        react: {
            useState: initial => { const index = states.length; states.push(initial); return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
            useEffect: effect => effects.push(effect),
        },
        'react-redux': { useSelector: selector => selector({ auth: { user: userId ? { id: userId } : null } }) },
        '../api/axios': { default: { get: (url, { signal }) => new Promise((resolve, reject) => requests.push({ url, signal, resolve, reject })) }, __esModule: true },
    };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'window', 'document', outputText)(id => {
        if (!(id in modules)) throw new Error(`Unexpected import ${id}`);
        return modules[id];
    }, module, module.exports, window, document);
    const hook = allDrafts ? module.exports.useOrderDrafts(enabled) : module.exports.default(enabled);
    const cleanup = effects[0]();
    return {
        states, requests, document, timers, cleanup, hook,
        event: name => window.dispatchEvent(new Event(name)),
        tick: () => timers.get(1)?.(),
        resolve: async (index, data) => { requests[index].resolve({ data }); await flush(); },
    };
}
const tableOrder = (table, quantity = 1) => ({ _id: table, digitalMenuTable: table, items: [{ productId: 'burger', productName: 'Burger', quantity, unitPrice: 100 }] });

test('Order Drafts loads manual POS drafts and incoming table drafts together and refreshes new table orders', async () => {
    const app = mount(true, 'staff', true);
    const manual = { _id: 'manual', items: [] };
    await app.resolve(0, [manual, tableOrder('Table 1')]);
    assert.deepEqual(app.states[0], [manual, tableOrder('Table 1')]);
    app.tick(); await app.resolve(1, [tableOrder('Table 2'), tableOrder('Table 1', 3), manual]);
    assert.deepEqual(app.states[0], [tableOrder('Table 2'), tableOrder('Table 1', 3), manual]);
    app.cleanup();
});

test('deleting a draft refreshes both screens and a stale in-flight response cannot restore it', async () => {
    const app = mount(true, 'staff', true);
    const old = [tableOrder('Table 1'), tableOrder('Table 2')];
    await app.resolve(0, old);
    app.tick();
    app.hook.removeLocalDraft('Table 1');
    assert.deepEqual(app.states[0], [tableOrder('Table 2')]);
    app.event('itemhive-order-drafts-changed');
    assert.equal(app.requests[1].signal.aborted, true);
    await app.resolve(2, [tableOrder('Table 2')]);
    await app.resolve(1, old);
    assert.deepEqual(app.states[0], [tableOrder('Table 2')]);
    app.cleanup();
});

test('staff see only table QR orders; refresh picks up added items and removes paid drafts', async () => {
    const app = mount();
    assert.equal(app.requests[0].url, '/order-drafts');
    await app.resolve(0, [tableOrder('Table 1'), { _id: 'manual', digitalMenuTable: '' }, { _id: 'blank', digitalMenuTable: '  ' }]);
    assert.deepEqual(app.states[0], [tableOrder('Table 1')]);
    assert.equal(app.states[1], false);
    app.tick(); await app.resolve(1, [tableOrder('Table 1', 3), tableOrder('Table 2')]);
    assert.equal(app.states[0][0].items[0].quantity, 3);
    assert.equal(app.states[0].length, 2);
    app.event('itemhive-order-drafts-changed'); await app.resolve(2, [tableOrder('Table 2')]);
    assert.deepEqual(app.states[0], [tableOrder('Table 2')]);
    app.cleanup();
});

test('workspace switches clear previous orders and ignore delayed responses from the old workspace', async () => {
    const app = mount(); await app.resolve(0, [tableOrder('Old table')]);
    app.tick();
    app.event('itemhive-workspace-changed');
    assert.equal(app.requests[1].signal.aborted, true);
    assert.deepEqual(app.states[0], []);
    await app.resolve(2, [tableOrder('New table')]);
    await app.resolve(1, [tableOrder('Old table')]);
    assert.deepEqual(app.states[0], [tableOrder('New table')]);
    app.cleanup();
});

test('refresh avoids overlapping requests and hidden tabs, then checks orders when staff return', async () => {
    const app = mount(); app.tick(); app.event('focus'); assert.equal(app.requests.length, 1);
    await app.resolve(0, []);
    app.document.visibilityState = 'hidden'; app.tick(); assert.equal(app.requests.length, 1);
    app.document.visibilityState = 'visible'; app.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(app.requests.length, 2);
    app.cleanup();
    assert.equal(app.requests[1].signal.aborted, true);
    assert.equal(app.timers.size, 0);
    await app.resolve(1, [tableOrder('Too late')]);
    assert.deepEqual(app.states[0], []);
    app.event('focus'); assert.equal(app.requests.length, 2);
});

test('failed requests show a warning and retry successfully without losing known orders', async () => {
    const app = mount(); await app.resolve(0, [tableOrder('Table 1')]);
    app.tick(); app.requests[1].reject(new Error('Offline')); await flush();
    assert.match(app.states[2], /Unable to check table orders/);
    assert.deepEqual(app.states[0], [tableOrder('Table 1')]);
    app.tick(); await app.resolve(2, []);
    assert.equal(app.states[2], ''); assert.deepEqual(app.states[0], []);
    app.cleanup();
});

test('non-restaurant screens and signed-out users never fetch orders', () => {
    const disabled = mount(false); assert.equal(disabled.requests.length, 0); assert.equal(disabled.timers.size, 0); disabled.cleanup();
    const signedOut = mount(true, ''); assert.equal(signedOut.requests.length, 0); signedOut.cleanup();
});
