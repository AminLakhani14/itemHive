import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestInventoryMenu, validateMenuSuggestion } from './inventoryMenuAI';
import { contrast } from './logoTheme';
import type { MenuDesign } from '../utils/menuDesign';

const inventory = [{ id: 'pizza', name: 'Pizza', category: 'Food', price: 500 }, { id: 'drink', name: 'Pepsi', category: 'Drinks', price: 100 }];
const suggestion = () => ({ summary: 'Food and drinks.', sections: [{ name: 'Pizzas', reason: 'Main dishes', productIds: ['pizza'] }, { name: 'Drinks', reason: 'Refreshing sides', productIds: ['drink'] }], deals: [{ name: 'Pizza + Pepsi', reason: 'Lunch combo', productIds: ['pizza', 'drink'], dealPrice: 550.556 }] });
const style = { backgroundColor: '#fff8ed', textColor: '#222222', accentColor: '#783925', headerColor: '#783925', surfaceColor: '#fff8ed', fontStyle: 'serif' as const, decoration: 'corners' as const, visualStyle: 'cards' as const, sectionColumns: 2 as const, reason: 'Warm restaurant colors with subtle corners.' };

test('AI selects section photos from the supplied library, honors opt-out and rejects invented or missing choices', async t => {
    const original = process.env.GEMINI_API_KEYS; process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    let imageKey: string | undefined = 'main-course'; let enabled = true;
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body)); const schema = body.generationConfig.responseSchema.properties.sections.items;
        assert.equal(schema.required.includes('imageKey'), enabled);
        if (enabled) { assert.match(body.contents[0].parts[0].text, /illustrative AI-created library photos/); assert.ok(schema.properties.imageKey.enum.includes('none')); }
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Photo menu', sections: [{ name: 'Main course', reason: 'Meals', productIds: ['p1'], imageKey }], deals: [] }) }] } }] }));
    });
    const options = { menuName: '', brief: '', includeDeals: false, existingSections: [], includeSectionImages: true };
    assert.equal((await suggestInventoryMenu(inventory, options)).sections[0].imageKey, 'main-course');
    imageKey = 'none'; assert.equal((await suggestInventoryMenu(inventory, options)).sections[0].imageKey, 'none');
    imageKey = 'https://fake.example/image.jpg'; await assert.rejects(() => suggestInventoryMenu(inventory, options), /Invalid AI/);
    imageKey = undefined; await assert.rejects(() => suggestInventoryMenu(inventory, options), /Missing AI section image/);
    enabled = false; imageKey = 'drinks'; assert.equal((await suggestInventoryMenu(inventory, { ...options, includeSectionImages: false })).sections[0].imageKey, undefined);
});

test('custom menus request a complete modern palette with no branding, theme only, logo only or both', async t => {
    const original = process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    const currentDesign: MenuDesign = { ...style, templateId: 'custom', backgroundColor: '#ffffff', textColor: '#20221f', layout: 'grid', showImages: false };
    const brands = [undefined, { name: '', theme: 'Warm cafe', colors: ['#783925'], logo: '' }, { name: '', theme: '', colors: [], logo: 'data:image/png;base64,aGVsbG8=' }, { name: 'Cafe', theme: 'Warm cafe', colors: ['#783925'], logo: 'data:image/png;base64,aGVsbG8=' }];
    let expectedLogo = false;
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const { required } = body.generationConfig.responseSchema.properties.style;
        for (const key of ['backgroundColor', 'textColor', 'accentColor', 'headerColor', 'surfaceColor', 'fontStyle', 'visualStyle', 'decoration', 'sectionColumns']) assert.ok(required.includes(key));
        assert.ok(body.generationConfig.responseSchema.required.includes('menuName'));
        assert.ok(body.generationConfig.responseSchema.required.includes('headings'));
        assert.match(body.contents[0].parts[0].text, /blank canvas colors in currentDesign are placeholders/);
        assert.match(body.contents[0].parts[0].text, /choose a fresh, cohesive modern palette/);
        assert.equal(body.contents[0].parts.length, expectedLogo ? 2 : 1);
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Complete design', sections: [{ name: 'Meals', reason: 'Main dishes', productIds: ['p1'] }], deals: [], style, menuName: 'Cafe favorites', headings: [{ type: 'label', text: 'Meals & sips' }] }) }] } }] }));
    });
    for (const brand of brands) {
        expectedLogo = Boolean(brand?.logo);
        const result = await suggestInventoryMenu(inventory, { menuName: '', brief: '', includeDeals: false, existingSections: [], includeStyle: true, currentDesign, brand });
        assert.deepEqual(result.style, style); assert.equal(result.menuName, 'Cafe favorites'); assert.equal(result.headings?.length, 1);
    }
    for (const key of ['backgroundColor', 'textColor', 'accentColor', 'headerColor', 'surfaceColor'] as const) {
        const incomplete: Partial<typeof style> = { ...style }; delete incomplete[key];
        assert.throws(() => validateMenuSuggestion({ ...suggestion(), style: incomplete }, inventory, false, true, currentDesign), /Missing AI menu colors/);
    }
});

test('style is opt-in, validated for readability and restricted to supported editable fields', () => {
    const input = { ...suggestion(), style };
    assert.deepEqual(validateMenuSuggestion(input, inventory, false, true).style, style);
    assert.equal(validateMenuSuggestion(input, inventory, false, false).style, undefined);
    assert.deepEqual(input.style, style);
    assert.throws(() => validateMenuSuggestion(suggestion(), inventory, false, true), /Missing/);
    for (const patch of [{ backgroundColor: 'red' }, { decoration: 'arbitrary-art' }, { fontStyle: 'unknown' }, { templateId: 'modern' }, { visualStyle: 'unsupported' }, { sectionColumns: 4 }, { sectionColumns: '2' }, { visualStyle: undefined }]) {
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
        assert.ok(contrast(result.style!.textColor!, background!) >= 4.5); assert.ok(contrast(result.style!.accentColor!, background!) >= 4.5);
    }
    assert.equal(JSON.stringify(input), before);
    const incompatible = validateMenuSuggestion({ ...input, style: { ...input.style, backgroundColor: '#595959', surfaceColor: '#dadada' } }, inventory, false, true).style!;
    assert.equal(incompatible.surfaceColor, incompatible.backgroundColor);
    assert.ok(contrast(incompatible.textColor!, incompatible.backgroundColor!) >= 4.5);
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
        assert.match(parts[0].text, /Default to a contemporary restaurant menu/);
        assert.match(parts[0].text, /Respect explicit requests for classic\/serif\/single-column designs/);
        assert.ok(body.generationConfig.responseSchema.properties.style.required.includes('visualStyle'));
        assert.ok(body.generationConfig.responseSchema.properties.style.required.includes('sectionColumns'));
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

test('template styles discard all AI color and copy overrides without normalizing the selected palette', async t => {
    const currentDesign: MenuDesign = { ...style, templateId: 'midnight', layout: 'grid', showImages: false, accentColor: '#ff9900', backgroundColor: '#ffffff', surfaceColor: '#ffffff' };
    const before = JSON.stringify(currentDesign);
    const result = validateMenuSuggestion({ ...suggestion(), style, menuName: 'Unexpected rename', headings: [{ type: 'heading', text: 'Unexpected heading' }] }, inventory, false, true, currentDesign);
    assert.equal(result.menuName, undefined); assert.equal(result.headings, undefined);
    assert.equal(result.style!.visualStyle, 'cards'); assert.equal(result.style!.sectionColumns, 2);
    assert.ok(Object.keys(result.style!).every(key => !key.endsWith('Color'))); assert.equal(JSON.stringify(currentDesign), before);
    const original = process.env.GEMINI_API_KEYS; process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        assert.match(body.contents[0].parts[0].text, /ALL five colors from currentDesign exactly unchanged/);
        assert.ok(!('backgroundColor' in body.generationConfig.responseSchema.properties.style.properties));
        assert.ok(!('menuName' in body.generationConfig.responseSchema.properties));
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Modern template', sections: [], deals: [], style: result.style }) }] } }] }));
    });
    const generated = await suggestInventoryMenu(inventory, { menuName: 'My menu', brief: 'Make it fancy and modern', includeDeals: false, includeStyle: true, existingSections: [], currentDesign });
    assert.deepEqual(generated.style, result.style);
});

test('custom menus validate name and heading suggestions and strip them when suggestions are disabled', () => {
    const input = { ...suggestion(), style, menuName: 'Cafe favorites', headings: [{ type: 'heading', text: 'Explore the menu' }, { type: 'label', text: 'Snacks & sips' }] };
    const result = validateMenuSuggestion(input, inventory, false, true);
    assert.equal(result.menuName, input.menuName); assert.deepEqual(result.headings, input.headings);
    const disabled = validateMenuSuggestion(input, inventory, false, false); assert.equal(disabled.menuName, undefined); assert.equal(disabled.headings, undefined);
    for (const patch of [{ menuName: '' }, { menuName: 'x'.repeat(101) }, { headings: [{ type: 'title', text: 'Bad' }] }, { headings: [{ type: 'heading', text: '' }] }, { headings: Array(4).fill(input.headings[0]) }]) assert.throws(() => validateMenuSuggestion({ ...input, ...patch }, inventory, false, true));
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

test('a previous menu picture is sent as a labelled image after the logo and never as prompt text', async t => {
    const original = process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
    const calls: unknown[][] = [];
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const parts = JSON.parse(String(init.body)).contents[0].parts;
        calls.push(parts);
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'Like your old menu', sections: [{ name: 'Pizzas', reason: 'As before', productIds: ['p1'] }], deals: [] }) }] } }] }));
    });
    await suggestInventoryMenu(inventory, { menuName: '', brief: '', includeDeals: true, existingSections: [], inspiration: 'data:image/webp;base64,bWVudQ==' });
    const [parts] = calls as Array<Array<{ text?: string; inlineData?: unknown }>>;
    assert.match(parts[0].text!, /previous menu is attached/); assert.match(parts[0].text!, /missing from the selected inventory/);
    assert.ok(!parts[0].text!.includes('bWVudQ==')); assert.ok(!parts[0].text!.includes('"inspiration"'));
    assert.deepEqual(parts.slice(1), [{ text: 'Previous menu:' }, { inlineData: { mimeType: 'image/webp', data: 'bWVudQ==' } }]);
    await suggestInventoryMenu(inventory, { menuName: '', brief: '', includeDeals: true, existingSections: [] });
    assert.equal(calls[1].length, 1); assert.doesNotMatch((calls[1][0] as { text: string }).text, /previous menu is attached/);
    await assert.rejects(() => suggestInventoryMenu(inventory, { menuName: '', brief: '', includeDeals: true, existingSections: [], inspiration: 'https://example.com/menu.png' }));
});
