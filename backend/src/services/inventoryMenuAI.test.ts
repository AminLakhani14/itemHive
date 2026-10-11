import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestInventoryMenu, validateMenuSuggestion } from './inventoryMenuAI';
import { contrast } from './logoTheme';

const inventory = [{ id: 'pizza', name: 'Pizza', category: 'Food', price: 500 }, { id: 'drink', name: 'Pepsi', category: 'Drinks', price: 100 }];
const suggestion = () => ({ summary: 'Food and drinks.', sections: [{ name: 'Pizzas', reason: 'Main dishes', productIds: ['pizza'] }, { name: 'Drinks', reason: 'Refreshing sides', productIds: ['drink'] }], deals: [{ name: 'Pizza + Pepsi', reason: 'Lunch combo', productIds: ['pizza', 'drink'], dealPrice: 550.556 }] });
const style = { backgroundColor: '#fff8ed', textColor: '#222222', accentColor: '#783925', headerColor: '#783925', surfaceColor: '#fff8ed', fontStyle: 'serif' as const, decoration: 'corners' as const, reason: 'Warm restaurant colors with subtle corners.' };

test('style is opt-in, validated for readability and restricted to supported editable fields', () => {
    const input = { ...suggestion(), style };
    assert.deepEqual(validateMenuSuggestion(input, inventory, false, true).style, style);
    assert.equal(validateMenuSuggestion(input, inventory, false, false).style, undefined);
    assert.deepEqual(input.style, style);
    assert.throws(() => validateMenuSuggestion(suggestion(), inventory, false, true), /Missing/);
    for (const patch of [{ backgroundColor: 'red' }, { decoration: 'arbitrary-art' }, { fontStyle: 'unknown' }, { templateId: 'modern' }]) {
        assert.throws(() => validateMenuSuggestion({ ...input, style: { ...style, ...patch } }, inventory, false, true));
    }
});

test('bright logo accents and low-contrast text become readable suggestions without discarding the menu or mutating input', () => {
    const input = { ...suggestion(), style: { ...style, backgroundColor: '#ffffff', surfaceColor: '#fdfdfd', textColor: '#ffffff', accentColor: '#ff9900', headerColor: '#ff9900' } };
    const before = JSON.stringify(input);
    const result = validateMenuSuggestion(input, inventory, true, true);
    assert.equal(result.sections.length, 2); assert.equal(result.deals.length, 1);
    assert.equal(result.style!.headerColor, '#ff9900'); assert.notEqual(result.style!.accentColor, '#ff9900');
    assert.match(result.style!.reason, /adjusted for readable/);
    for (const background of [result.style!.backgroundColor, result.style!.surfaceColor]) {
        assert.ok(contrast(result.style!.textColor, background) >= 4.5); assert.ok(contrast(result.style!.accentColor, background) >= 4.5);
    }
    assert.equal(JSON.stringify(input), before);
    const incompatible = validateMenuSuggestion({ ...input, style: { ...input.style, backgroundColor: '#595959', surfaceColor: '#dadada' } }, inventory, false, true).style!;
    assert.equal(incompatible.surfaceColor, incompatible.backgroundColor);
    assert.ok(contrast(incompatible.textColor, incompatible.backgroundColor) >= 4.5);
});

test('style prompt sends restaurant logo as an image, prioritizes user preferences and does not expose its base64 as text', async t => {
    const original = process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    const logo = 'data:image/png;base64,aGVsbG8=';
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body)); const parts = body.contents[0].parts;
        assert.deepEqual(parts[1], { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } });
        assert.match(parts[0].text, /take priority over logo colors/);
        assert.match(parts[0].text, /Use cream with corner accents/);
        assert.match(parts[0].text, /Rustic Italian cafe/);
        assert.ok(!parts[0].text.includes('aGVsbG8='));
        assert.ok(body.generationConfig.responseSchema.required.includes('style'));
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Style ready', sections: [], deals: [], style }) }] } }] }));
    });
    const result = await suggestInventoryMenu(inventory, { menuName: 'Cafe', brief: 'Use cream with corner accents', includeDeals: false, includeStyle: true, existingSections: [], brand: { name: 'Cafe', theme: 'Rustic Italian cafe', logo, colors: ['#783925'] } });
    assert.deepEqual(result.style, style);
    await assert.rejects(() => suggestInventoryMenu(inventory, { menuName: '', brief: '', includeDeals: false, includeStyle: true, existingSections: [], brand: { name: '', theme: '', logo: 'https://example.com/logo.png', colors: [] } }), /Invalid menu logo/);
});

test('AI combos validate inventory, calculate regular price, round edited currency and honor the disabled checkbox', () => {
    assert.deepEqual(validateMenuSuggestion(suggestion(), inventory, true).deals[0], { ...suggestion().deals[0], dealPrice: 550.56, regularPrice: 600 });
    assert.deepEqual(validateMenuSuggestion(suggestion(), inventory, false).deals, []);
    assert.equal(inventory[0].price, 500);
});

test('untrusted AI cannot invent products, double-assign products or offer invalid combos/prices', () => {
    const invalid: unknown[] = [null, { ...suggestion(), sections: [{ name: 'Fake', reason: 'bad', productIds: ['foreign'] }] }];
    const duplicate = suggestion(); duplicate.sections[1].productIds = ['pizza']; invalid.push(duplicate);
    const duplicateNames = suggestion(); duplicateNames.sections[1].name = 'pizzas'; invalid.push(duplicateNames);
    const duplicateIngredient = suggestion(); duplicateIngredient.deals[0].productIds = ['pizza', 'pizza']; invalid.push(duplicateIngredient);
    const foreign = suggestion(); foreign.deals[0].productIds = ['pizza', 'foreign']; invalid.push(foreign);
    const omitted = suggestion(); omitted.sections.pop(); invalid.push(omitted);
    const repeated = suggestion(); repeated.deals.push({ ...repeated.deals[0] }); invalid.push(repeated);
    for (const price of [-1, 601, NaN, Infinity, Number.MAX_VALUE, '550']) { const result = suggestion(); result.deals[0].dealPrice = price as number; invalid.push(result); }
    for (const input of invalid) assert.throws(() => validateMenuSuggestion(input, inventory, true));
});

test('provider receives a structured inventory request and results use validated IDs, without writing inventory', async t => {
    const original = process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        assert.equal(body.generationConfig.responseMimeType, 'application/json');
        assert.ok(body.contents[0].parts[0].text.includes(JSON.stringify(inventory.map((item, index) => ({ ...item, id: `p${index + 1}` })))));
        assert.ok(body.contents[0].parts[0].text.includes('Deals are disabled'));
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...suggestion(), sections: [{ name: 'Pizzas', reason: 'Main dishes', productIds: ['p1'] }, { name: 'Drinks', reason: 'Refreshing sides', productIds: ['p2'] }], deals: [] }) }] } }] }));
    });
    const result = await suggestInventoryMenu(inventory, { menuName: '369 Pizza', brief: 'Takeaway', includeDeals: false, existingSections: ['Pizzas'] });
    assert.equal(result.sections[0].productIds[0], 'pizza');
    assert.deepEqual(result.deals, []);
});

test('request-local item IDs map back to inventory IDs for sections and authoritative combo prices', async t => {
    const original = process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    const selected = inventory.map((item, index) => ({ ...item, id: `original-long-id-${index}` }));
    const output = { summary: 'Lunch menu', sections: [{ name: 'Lunch', reason: 'Food and drinks', productIds: ['p1', 'p2'] }], deals: [{ name: 'Lunch combo', reason: 'Pairs a meal and drink', productIds: ['p1', 'p2'], dealPrice: 550 }] };
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        assert.ok(!String(init.body).includes('original-long-id'));
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }));
    });
    const options = { menuName: '', brief: '', includeDeals: true, existingSections: [] };
    const result = await suggestInventoryMenu(selected, options);
    assert.deepEqual(result.sections[0].productIds, selected.map(item => item.id));
    assert.deepEqual(result.deals[0].productIds, selected.map(item => item.id));
    assert.equal(result.deals[0].regularPrice, 600);
    output.sections[0].productIds[0] = selected[0].id;
    await assert.rejects(() => suggestInventoryMenu(selected, options), /unavailable/);
});

test('malformed or empty provider responses never become fake menu suggestions', async t => {
    const original = process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ candidates: [] })));
    await assert.rejects(() => suggestInventoryMenu(inventory, { menuName: '', brief: '', includeDeals: true, existingSections: [] }));
});
