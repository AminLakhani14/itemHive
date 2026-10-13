import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const cache = new Map();
function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const source = readFileSync(new URL(`../src/pages/DigitalMenus/${name}.ts`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    new Function('require', 'module', 'exports', outputText)(id => load(id.replace('./', '')), module, module.exports);
    return module.exports;
}
const { buildImportedMenu, reviewImportedMenu } = load('oldMenuImport');
const { pictureMenuLayout, addPictureSection, movePictureSection, movePictureItem } = load('pictureMenu');
const { continueSectionOnPage } = load('menuContent');
const { PLAIN_MENU_DESIGN } = load('menuTemplates');
const picture = 'data:image/jpeg;base64,aGVsbG8=';
const products = [{ id: 'rice', name: 'Fried Rice', price: 10 }, { id: 'juice', name: 'Fresh Juice', price: 12 }, { id: 'extra', name: 'Extra Meal', price: 20 }];
const source = { name: 'Food Menu', pricePrefix: '$', sections: [
    { name: 'Main Course', page: 1, itemsBox: [240, 55, 365, 470], headingBox: [175, 55, 225, 470], items: [{ name: 'Fried Rice', price: 10 }] },
    { name: 'Drinks', page: 1, itemsBox: [700, 55, 825, 470], items: [{ name: 'Fresh Juice', price: 12 }] },
] };
const empty = { name: '', content: [], productIds: [], productPrices: {}, pageCount: 1 };
const review = () => ({ name: source.name, sections: reviewImportedMenu(source, products, {}), mode: 'replace', picture, keepPicture: true, listItems: true, editPicture: true, pricePrefix: '$' });

test('a section photo expands only its original text column and stays attached when that section moves', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    const sections = menu.content.filter(block => block.type === 'section');
    const before = pictureMenuLayout(sections, products);
    sections[0].sectionImage = { url: '/menu-images/main-course.webp', alt: 'Main course' };
    const after = pictureMenuLayout(sections, products);
    assert.ok(after.entries[0].photoHeight > 0);
    assert.equal(after.entries[0].height, before.entries[0].height + after.entries[0].photoHeight);
    assert.ok(after.entries[1].top > before.entries[1].top);
    const moved = movePictureSection(menu.content, sections[0].id, sections[1].id, true);
    assert.deepEqual(moved.find(block => block.id === sections[0].id).sectionImage, sections[0].sectionImage);
    assert.equal(menu.content.find(block => block.type === 'image').imageUrl, picture);
});

test('original picture and linked sections open together on page 1 without rebuilding the artwork or duplicating pages', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    assert.equal(menu.pageCount, 1); assert.equal(menu.content.find(block => block.type === 'image').imageUrl, picture);
    const sections = menu.content.filter(block => block.type === 'section');
    assert.deepEqual(sections.map(block => [block.text, block.page, block.source.box]), [['Main Course', 1, [240, 55, 365, 470]], ['Drinks', 1, [700, 55, 825, 470]]]);
    const layout = pictureMenuLayout(sections, products);
    assert.equal(layout.height, 1000); assert.ok(layout.entries.every(entry => !entry.edited));
    assert.deepEqual(menu.productPrices, { rice: 10, juice: 12 });
});

test('adding items expands their own column and shifts lower content without changing the original image or another column', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    const sections = menu.content.filter(block => block.type === 'section');
    const original = JSON.stringify(sections[0].source);
    sections[0].productIds.push('extra');
    sections.push({ ...sections[1], id: 'right', source: { ...sections[1].source, box: [700, 600, 825, 950] } });
    const layout = pictureMenuLayout(sections, products);
    assert.equal(layout.entries.find(entry => entry.section.text === 'Main Course').height, 250);
    assert.equal(layout.entries.find(entry => entry.section.id === sections[1].id).top, 825);
    assert.equal(layout.entries.find(entry => entry.section.id === 'right').top, 700);
    assert.equal(layout.height, 1125);
    assert.equal(JSON.stringify(sections[0].source), original);
    assert.equal(menu.content.find(block => block.type === 'image').imageUrl, picture);
});

test('price edits and removals replace the printed item area, while unchanged sections keep their original pixels', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    const sections = menu.content.filter(block => block.type === 'section');
    const changed = products.map(product => product.id === 'rice' ? { ...product, salePrice: 15 } : product);
    const layout = pictureMenuLayout(sections, changed);
    assert.equal(layout.entries[0].edited, true); assert.equal(layout.entries[1].edited, false);
    sections[0].productIds = [];
    assert.equal(pictureMenuLayout(sections, changed).entries[0].items.length, 0);
});

test('a continued section on a new page detaches its picture coordinates, and appended imports preserve the earlier page', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    const section = menu.content.find(block => block.type === 'section');
    const next = continueSectionOnPage(menu.content, section.id, 'rice', 1);
    assert.equal(next.pageCount, 2); assert.equal(next.content.find(block => block.type === 'section' && block.page === 2).source, undefined);
    const appended = buildImportedMenu({ ...review(), mode: 'append' }, PLAIN_MENU_DESIGN, { ...empty, name: 'Original', content: [{ id: 'title', type: 'title', text: 'Original', productIds: [], page: 1 }], pageCount: 1 }, products);
    assert.equal(appended.name, 'Original'); assert.equal(appended.pageCount, 2);
    assert.equal(appended.content[0].id, 'title'); assert.equal(appended.content.find(block => block.type === 'image').page, 2);
});

test('missing section coordinates require review instead of silently placing items on a different page', () => {
    const input = review(); input.sections[0].itemsBox = undefined;
    assert.throws(() => buildImportedMenu(input, PLAIN_MENU_DESIGN, empty, products), /Mark the item area/);
});

test('moving sections changes their visual order while retaining original heading pixels, products, prices and poster', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    const sections = menu.content.filter(block => block.type === 'section');
    const original = JSON.stringify(menu.content);
    const moved = movePictureSection(menu.content, sections[1].id, sections[0].id);
    const layout = pictureMenuLayout(moved.filter(block => block.type === 'section'), products);
    assert.deepEqual(layout.entries.map(entry => entry.section.text), ['Drinks', 'Main Course']);
    assert.ok(layout.entries[0].headingTop < layout.entries[1].headingTop);
    assert.equal(layout.height, 1000);
    assert.equal(layout.entries[0].edited, false);
    assert.equal(moved.find(block => block.type === 'image').imageUrl, picture);
    assert.deepEqual(moved.find(block => block.id === sections[1].id).source, sections[1].source);
    assert.equal(JSON.stringify(menu.content), original);
});

test('a new section borrows the original header and row styling and is inserted before the existing footer', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    const sections = menu.content.filter(block => block.type === 'section');
    const headingStyle = { backgroundColor: '#ffffff', color: '#000000', align: 'center' };
    const added = addPictureSection(menu.content, sections[0], 'Desserts', headingStyle);
    assert.equal(added.section.source.templateOnly, true);
    assert.deepEqual(added.section.source.headingBox, sections[0].source.headingBox);
    assert.deepEqual(added.section.headingStyle, headingStyle);
    const layout = pictureMenuLayout(added.content.filter(block => block.type === 'section'), products);
    assert.deepEqual(layout.entries.map(entry => entry.section.text), ['Main Course', 'Desserts', 'Drinks']);
    assert.equal(layout.entries[1].row, layout.entries[0].row);
    assert.equal(layout.entries[1].edited, true);
    assert.ok(layout.groups[0].extra > 0);
    assert.equal(layout.entries[2].headingTop + layout.entries[2].unitHeight, layout.groups[0].end + layout.groups[0].extra);
    assert.deepEqual(added.section.productIds, []);
    assert.equal(menu.content.find(block => block.type === 'image').imageUrl, picture);
});

test('moving items reorders or transfers one item without duplicates, losing prices, or changing printed style snapshots', () => {
    const menu = buildImportedMenu(review(), PLAIN_MENU_DESIGN, empty, products);
    const sections = menu.content.filter(block => block.type === 'section');
    let moved = movePictureItem(menu.content, 'rice', sections[1].id, 'juice', true);
    assert.deepEqual(moved.find(block => block.id === sections[0].id).productIds, []);
    assert.deepEqual(moved.find(block => block.id === sections[1].id).productIds, ['juice', 'rice']);
    moved = movePictureItem(moved, 'rice', sections[1].id, 'juice', false);
    assert.deepEqual(moved.find(block => block.id === sections[1].id).productIds, ['rice', 'juice']);
    assert.deepEqual(moved.find(block => block.id === sections[1].id).source, sections[1].source);
    assert.equal(moved.flatMap(block => block.productIds).filter(id => id === 'rice').length, 1);
    assert.deepEqual(menu.productPrices, { rice: 10, juice: 12 });
    const added = addPictureSection(moved, sections[1]);
    const transferred = movePictureItem(added.content, 'rice', added.section.id);
    assert.deepEqual(transferred.find(block => block.id === added.section.id).productIds, ['rice']);
});
