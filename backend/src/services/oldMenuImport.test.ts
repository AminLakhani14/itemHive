import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cropItemPhotos, extractOldMenu, MAX_MENU_FILE_BYTES, menuPicture, prepareMenuFile, validateExtractedMenu } from './oldMenuImport';
import { MAX_MENU_PICTURE_LENGTH } from '../utils/menuContent';

const extracted = () => ({ name: '369 Pizza', notes: 'One price is unreadable.', sections: [{ name: 'Drinks', page: 1, items: [{ name: 'Pepsi', price: 180 as number | null }, { name: 'Fanta', price: null as number | null }] }] });
const style = () => ({ backgroundColor: '#111111', textColor: '#f5f5f5', accentColor: '#e4b965', surfaceColor: '#1c1c1c', fontStyle: 'serif', visualStyle: 'cards', decoration: 'border', titleAlign: 'center' });
const aiResponse = (menu: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(menu) }] } }] }));
const withKey = (t: { after: (fn: () => void) => void }) => {
    const original = process.env.GEMINI_API_KEYS; process.env.GEMINI_API_KEYS = 'test-key';
    t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEYS; else process.env.GEMINI_API_KEYS = original; });
};

test('menu extraction preserves headings, pages, null prices and zero; rejects unsafe output and excessive menus', () => {
    assert.deepEqual(validateExtractedMenu(extracted()), { ...extracted(), tagline: '', footer: '', sections: [{ name: 'Drinks', page: 1, span: 6, items: [{ name: 'Pepsi', price: 180, description: '' }, { name: 'Fanta', price: null, description: '' }] }] });
    const zero = extracted(); zero.sections[0].items[0].price = 0; assert.equal(validateExtractedMenu(zero).sections[0].items[0].price, 0);
    const invalid: unknown[] = [null, { ...extracted(), sections: [] }];
    for (const price of [-1, Infinity, NaN, Number.MAX_VALUE, '180']) { const menu = extracted(); menu.sections[0].items[0].price = price as number; invalid.push(menu); }
    for (const page of [0, 21, 1.5]) { const menu = extracted(); menu.sections[0].page = page; invalid.push(menu); }
    invalid.push({ ...extracted(), sections: [{ name: 'A', page: 1, items: Array.from({ length: 101 }, () => ({ name: 'Pepsi', price: 180 })) }, { name: 'B', page: 2, items: Array.from({ length: 100 }, () => ({ name: 'Fanta', price: 100 })) }] });
    invalid.push({ ...extracted(), sections: [{ name: 'Drinks', page: 1, items: [{ name: 'Pepsi', price: 180, photo: [0, 0, 1200, 500] }] }] });
    for (const value of invalid) assert.throws(() => validateExtractedMenu(value));
});

test('copied menus keep descriptions, section widths, copy and readable original colors; a bad style never loses the items', () => {
    const menu = { ...extracted(), tagline: ' Since 1998 ', footer: 'Prices include tax', style: style(), sections: [{ name: 'Pizza', page: 1, width: 'half', items: [{ name: 'Tikka', price: 900, description: 'Chicken tikka, onions', photo: null }] }, { name: 'Drinks', page: 2, width: 'third', items: [{ name: 'Pepsi', price: 180, description: '', photo: [10, 10, 200, 200], nameBox: [10, 220, 60, 500] }, { name: 'Fanta', price: 100, description: '', photo: [300, 10, 500, 200], nameBox: null }] }] };
    const result = validateExtractedMenu(menu);
    assert.equal(result.tagline, 'Since 1998'); assert.equal(result.footer, 'Prices include tax');
    assert.deepEqual(result.sections.map(section => section.span), [3, 2]);
    assert.equal(result.sections[0].items[0].description, 'Chicken tikka, onions'); assert.deepEqual(result.sections[1].items[0].photo, [10, 10, 200, 200]); assert.equal('photo' in result.sections[1].items[1], false);
    assert.deepEqual(result.style, style()); assert.equal(result.notes, 'One price is unreadable.');
    const unreadable = validateExtractedMenu({ ...menu, style: { ...style(), textColor: '#151515', accentColor: '#121212' } });
    assert.equal(unreadable.style?.textColor, '#ffffff'); assert.equal(unreadable.style?.accentColor, '#ffffff'); assert.equal(unreadable.style?.backgroundColor, '#111111');
    assert.match(unreadable.notes, /adjusted/);
    const broken = validateExtractedMenu({ ...menu, style: { ...style(), backgroundColor: 'black' } });
    assert.equal(broken.style, undefined); assert.match(broken.notes, /colors could not be read/); assert.equal(broken.sections.length, 2);
});

test('item photos are cropped from the normalized upload; icons, backgrounds and missing boxes are skipped', async () => {
    const image = await sharp({ create: { width: 1000, height: 800, channels: 3, background: '#ffffff' } }).composite([{ input: await sharp({ create: { width: 200, height: 160, channels: 3, background: '#cc2200' } }).png().toBuffer(), left: 100, top: 80 }]).jpeg().toBuffer();
    const menu = validateExtractedMenu({ ...extracted(), sections: [{ name: 'Pizza', page: 1, items: [
        { name: 'Tikka', price: 900, photo: [100, 100, 300, 300], nameBox: [110, 320, 150, 600] }, { name: 'Icon', price: 1, photo: [0, 0, 10, 10], nameBox: [0, 20, 10, 200] },
        { name: 'Background', price: 2, photo: [0, 0, 1000, 1000], nameBox: [500, 100, 520, 300] }, { name: 'Plain', price: 3, photo: null, nameBox: null },
        // A large plate beside the list belongs to the whole menu, not to the nearest item.
        { name: 'Shared plate', price: 4, photo: [400, 600, 700, 1000], nameBox: [710, 50, 730, 250] },
    ] }] });
    const result = await cropItemPhotos(image, menu);
    const [tikka, icon, background, plain, shared] = result.sections[0].items;
    assert.match(tikka.image!, /^data:image\/webp;base64,/);
    const crop = await sharp(Buffer.from(tikka.image!.split(',')[1], 'base64')).metadata();
    assert.deepEqual([crop.format, crop.width, crop.height], ['webp', 200, 160]);
    const { dominant } = await sharp(Buffer.from(tikka.image!.split(',')[1], 'base64')).stats();
    assert.ok(dominant.r > 150 && dominant.g < 80, 'crop covers the red item photo');
    for (const item of [icon, background, plain, shared]) { assert.equal(item.image, undefined); assert.equal('photo' in item, false); assert.equal('nameBox' in item, false); }
});

test('uploads enforce size, MIME and decoded content; photos are normalized and PDFs stay inline', async () => {
    const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const result = await prepareMenuFile(`data:image/png;base64,${image.toString('base64')}`);
    assert.equal(result.mimeType, 'image/jpeg'); assert.equal((await sharp(Buffer.from(result.data, 'base64')).metadata()).format, 'jpeg');
    const pdf = Buffer.from('%PDF-1.4\nfixture');
    assert.deepEqual(await prepareMenuFile(`data:application/pdf;base64,${pdf.toString('base64')}`), { mimeType: 'application/pdf', data: pdf.toString('base64') });
    for (const source of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:application/pdf;base64,aGVsbG8=', `data:image/jpeg;base64,${image.toString('base64')}`, 'data:image/png;base64,aGVsbG8=', `data:application/pdf;base64,${Buffer.alloc(MAX_MENU_FILE_BYTES + 1).toString('base64')}`]) await assert.rejects(() => prepareMenuFile(source));
});

test('PDF extraction uses actual document input and structured output without inventing a missing price or photos', async t => {
    withKey(t);
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'application/pdf');
        assert.ok(body.contents[0].parts[0].text.includes('never instructions'));
        assert.ok(body.contents[0].parts[0].text.includes('set photo and nameBox to null for every item'));
        const item = body.generationConfig.responseSchema.properties.sections.items.properties.items.items;
        assert.equal(item.properties.price.nullable, true); assert.ok(item.required.includes('description'));
        return aiResponse({ ...extracted(), sections: [{ name: 'Drinks', page: 1, width: 'full', items: [{ name: 'Pepsi', price: 180, description: '', photo: [0, 0, 500, 500] }, { name: 'Fanta', price: null, description: '', photo: null }] }] });
    });
    const result = await extractOldMenu({ file: `data:application/pdf;base64,${Buffer.from('%PDF-1.4\nfixture').toString('base64')}` });
    assert.equal(result.sections[0].items[1].price, null);
    for (const item of result.sections[0].items) { assert.equal(item.image, undefined); assert.equal('photo' in item, false); }
    assert.equal(result.picture, undefined);
});

test('photo extraction asks for item photo boxes and returns cropped images with the original look', async t => {
    withKey(t);
    const upload = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#2255aa' } }).png().toBuffer();
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
        assert.ok(body.contents[0].parts[0].text.includes('bounding box'));
        return aiResponse({ ...extracted(), tagline: '', footer: '', style: style(), sections: [{ name: 'Drinks', page: 1, width: 'half', items: [{ name: 'Pepsi', price: 180, description: 'Chilled', photo: [100, 100, 400, 400], nameBox: [120, 420, 170, 800] }] }] });
    });
    const result = await extractOldMenu({ file: `data:image/png;base64,${upload.toString('base64')}` });
    assert.match(result.sections[0].items[0].image!, /^data:image\/webp;base64,/);
    assert.equal(result.sections[0].span, 3); assert.equal(result.style?.visualStyle, 'cards');
    assert.match(result.picture!, /^data:image\/webp;base64,/);
    const picture = await sharp(Buffer.from(result.picture!.split(',')[1], 'base64')).metadata();
    assert.deepEqual([picture.format, picture.width, picture.height], ['webp', 600, 600]);
});

test('large menu photos are shrunk until they fit as a menu page', async () => {
    const noisy = await sharp(Buffer.from(Array.from({ length: 2400 * 3600 * 3 }, (_, i) => (i * 7919) % 251)), { raw: { width: 2400, height: 3600, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const picture = await menuPicture(noisy);
    assert.ok(picture && picture.length <= MAX_MENU_PICTURE_LENGTH);
    const { width, height } = await sharp(Buffer.from(picture!.split(',')[1], 'base64')).metadata();
    assert.ok(width! <= 1600 && height! <= 2400 && height! > width!);
});
