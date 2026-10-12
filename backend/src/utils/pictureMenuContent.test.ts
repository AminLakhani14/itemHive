import test from 'node:test';
import assert from 'node:assert/strict';
import DigitalMenu from '../models/DigitalMenu';
import { parseMenuContent, type MenuBlock } from './menuContent';
import { validateExtractedMenu } from '../services/oldMenuImport';

const image: MenuBlock = { id: 'picture', type: 'image', imageUrl: 'data:image/jpeg;base64,aGVsbG8=', text: 'Food Menu', fontSize: 16, color: '#222222', align: 'left', productIds: [], page: 1 };
const section: MenuBlock = { id: 'main', type: 'section', text: 'Main Course', fontSize: 26, color: '#ffaa00', align: 'left', productIds: ['rice', 'extra'], page: 1, source: { imageId: 'picture', box: [240, 55, 365, 470], headingBox: [175, 55, 225, 470], originalText: 'Main Course', originalProductIds: ['rice'], originalPrices: [10], pricePrefix: '$' } };

test('picture section positions and price snapshots survive validation and model serialization', async () => {
    assert.deepEqual(parseMenuContent([image, section], ['rice', 'extra']), [image, section]);
    const model = new DigitalMenu({ name: 'Food Menu', token: 'picture-test', productIds: ['rice', 'extra'], content: [image, section] });
    await model.validate();
    assert.deepEqual(model.toObject().content?.[1].source, section.source);
});

test('picture coordinates cannot reference a missing picture, another page, invalid boxes or malformed prices', () => {
    for (const source of [
        { ...section.source!, imageId: 'missing' }, { ...section.source!, box: [-1, 0, 100, 100] },
        { ...section.source!, box: [400, 0, 100, 100] }, { ...section.source!, originalPrices: [Infinity] },
        { ...section.source!, originalProductIds: ['rice', 'rice'], originalPrices: [10, 10] },
        { ...section.source!, originalPrices: [] },
    ]) assert.equal(parseMenuContent([image, { ...section, source } as MenuBlock], ['rice', 'extra']), null);
    assert.equal(parseMenuContent([image, { ...section, page: 2 }], ['rice', 'extra']), null);
    assert.equal(parseMenuContent([{ ...image, source: section.source }], []), null);
});

test('AI import retains valid section regions and discards inverted boxes for manual review', () => {
    const source = { name: 'Menu', notes: '', pricePrefix: '$', sections: [{ name: 'Main Course', page: 1, itemsBox: [240, 55, 365, 470], headingBox: [175, 55, 225, 470], items: [{ name: 'Rice', price: 10 }] }] };
    const menu = validateExtractedMenu(source);
    assert.deepEqual(menu.sections[0].itemsBox, source.sections[0].itemsBox); assert.equal(menu.pricePrefix, '$');
    const invalid = validateExtractedMenu({ ...source, sections: [{ ...source.sections[0], itemsBox: [300, 55, 200, 470] }] });
    assert.equal(invalid.sections[0].itemsBox, undefined);
});

test('matched new section headings and borrowed picture styles survive saving; invalid style metadata is rejected', async () => {
    const added: MenuBlock = { ...section, id: 'desserts', text: 'DESSERTS', productIds: [], source: { ...section.source!, templateOnly: true }, headingStyle: { backgroundColor: '#ffffff', color: '#000000', align: 'center' } };
    assert.deepEqual(parseMenuContent([image, section, added], ['rice', 'extra']), [image, section, added]);
    const model = new DigitalMenu({ name: 'Menu', token: 'test-new-section', productIds: ['rice', 'extra'], content: [image, section, added] });
    await model.validate();
    assert.deepEqual(model.toObject().content?.[2].headingStyle, added.headingStyle);
    assert.equal(model.toObject().content?.[2].source?.templateOnly, true);
    assert.equal(parseMenuContent([image, { ...added, source: { ...added.source, templateOnly: 'true' } }], ['rice', 'extra']), null);
    assert.equal(parseMenuContent([image, { ...added, headingStyle: { ...added.headingStyle, backgroundColor: 'url(bad)' } }], ['rice', 'extra']), null);
});
