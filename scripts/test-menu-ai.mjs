import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Compile only the pure menu modules in memory; no browser, database, or emitted files.
const cache = new Map();
function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    if (!['aiMenu', 'menuLayouts', 'menuContent', 'oldMenuImport', 'menuTemplates', 'sectionImages'].includes(name)) throw new Error(`Unexpected module ${name}`);
    const module = { exports: {} }; cache.set(name, module);
    const source = readFileSync(new URL(`../src/pages/DigitalMenus/${name}.ts`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    new Function('require', 'module', 'exports', outputText)(id => load(id.replace('./', '')), module, module.exports);
    return module.exports;
}
const { applyAISections, applyMenuStyle, applyAIMenuStyle, applyAIMenuCopy, menuAIStyleKeys, buildMenuAIRequest, getMenuBrand, assertCompleteAIMenuStyle } = load('aiMenu');
const { createTemplatePage } = load('menuLayouts');
const { newMenuBlock } = load('menuContent');
const { buildImportedMenu, matchImportedItem, prepareImportProducts, reviewImportedMenu, validateReviewedImport } = load('oldMenuImport');
const design = { templateId: 'midnight', accentColor: '#bb99ee', textColor: '#ffffff' };
const section = (name, productIds) => ({ name, productIds, reason: 'AI suggestion' });
const importProducts = [{ id: 'pepsi', name: 'Pepsi', salePrice: 200 }, { id: 'fanta', name: 'Fanta', salePrice: 120 }];
const oldMenu = { name: 'Old cafe', notes: '', sections: [{ name: 'Drinks', page: 1, items: [{ name: 'PEPSI', price: 180 }, { name: 'Fanta', price: 0 }] }] };

test('section photo suggestions use browser image links; old generated-library paths resolve to web photos', () => {
    const { SECTION_PHOTOS, sectionPhoto, sectionImageUrl, isSectionImageLink } = load('sectionImages');
    for (const photo of SECTION_PHOTOS) {
        const suggestion = sectionPhoto(photo.key);
        assert.equal(suggestion.url, photo.url); assert.ok(suggestion.url.startsWith('https://images.pexels.com/'));
        assert.ok(isSectionImageLink(suggestion.url)); assert.equal(sectionImageUrl(`/menu-images/${photo.key}.webp`), photo.url);
    }
    const own = 'https://restaurant.example/images/main.jpg'; assert.equal(sectionImageUrl(own), own); assert.ok(isSectionImageLink(own));
    for (const value of ['javascript:alert(1)', 'http://example.com/photo.jpg', 'https://', 'https://user:pass@example.com/image.jpg', 'data:image/svg+xml;base64,aaaa', 'https://'+'a'.repeat(2050)]) assert.equal(isSectionImageLink(value), false);
    assert.equal(sectionImageUrl('data:image/webp;base64,aGVsbG8='), 'data:image/webp;base64,aGVsbG8=');
});

test('accepted section photos attach to the section, survive moves and rejected replacements preserve the user photo', () => {
    const custom = { ...design, templateId: 'custom', sectionColumns: 2 };
    const own = { url: 'data:image/webp;base64,aGVsbG8=', alt: 'My drinks' };
    const photo = { url: '/menu-images/drinks.webp', alt: 'Illustrative drinks' };
    const content = [{ ...newMenuBlock('section', design.accentColor, 'Drinks'), productIds: ['pepsi'], sectionImage: own }];
    const before = JSON.stringify(content);
    const kept = applyAISections(content, ['pepsi'], {}, 1, [section('Drinks', ['pepsi'])], custom, 'Cafe');
    assert.deepEqual(kept.content[0].sectionImage, own);
    const changed = applyAISections(content, ['pepsi'], {}, 1, [{ ...section('Drinks', ['pepsi']), sectionImage: photo }], custom, 'Cafe');
    assert.deepEqual(changed.content[0].sectionImage, photo); assert.equal(JSON.stringify(content), before);
    const added = applyAISections([], [], {}, 1, [{ ...section('Drinks', ['pepsi']), sectionImage: photo }], custom, 'Cafe');
    assert.deepEqual(added.content[0].sectionImage, photo);
    const { reorderMenuBlock, continueSectionOnPage } = load('menuContent');
    const next = { ...newMenuBlock('section', design.accentColor, 'Meals'), page: 2 };
    const moved = reorderMenuBlock([...added.content, next], added.content[0].id, next.id);
    assert.equal(moved[0].page, 2); assert.deepEqual(moved[0].sectionImage, photo);
    const continued = continueSectionOnPage(added.content, added.content[0].id, 'pepsi', 1);
    assert.deepEqual(continued.content.find(block => block.page === 2).sectionImage, photo);
});

test('custom branding distinguishes untouched app defaults from a saved restaurant theme or logo', () => {
    const settings = { shopName: 'Ozor POS', invoiceLogoUrl: '' };
    const empty = { name: '', theme: '', logo: '', colors: [] };
    assert.deepEqual(getMenuBrand(settings), empty);
    assert.deepEqual(getMenuBrand(settings, { appearance: { themeColor: '#0ea5a5', fontColor: '', logo: '' } }), empty);
    const logo = 'data:image/png;base64,aGVsbG8=';
    assert.deepEqual(getMenuBrand(settings, { appearance: { themeColor: '#0ea5a5', logo } }), { ...empty, logo });
    const user = { businessName: 'Cafe', appearance: { themeColor: '#713922', backgroundColor: '#fff8ed', fontColor: '#222222', headingColor: '#713922', navbarColor: '#713922', logo } };
    const brand = getMenuBrand(settings, user);
    assert.equal(brand.name, 'Cafe'); assert.equal(brand.logo, logo);
    assert.deepEqual(brand.colors, ['#713922', '#fff8ed', '#222222']);
    assert.match(brand.theme, /background #fff8ed/); assert.match(brand.theme, /headings #713922/);
    const withoutLogo = getMenuBrand(settings, { ...user, appearance: { ...user.appearance, logo: '' } });
    assert.equal(withoutLogo.logo, ''); assert.deepEqual(withoutLogo.colors, brand.colors);
    assert.equal(getMenuBrand({ shopName: 'Coffee House', invoiceLogoUrl: logo }, user).name, 'Coffee House');
    assert.equal(getMenuBrand({ ...settings, invoiceLogoUrl: '/favicon.png' }, { appearance: { logo: 'https://example.com/logo.png' } }).logo, '');
});

test('custom AI responses must actually supply a complete palette instead of inheriting blank canvas colors', () => {
    const custom = { ...design, templateId: 'custom' };
    const full = { backgroundColor: '#fff8ed', textColor: '#222222', accentColor: '#713922', headerColor: '#713922', surfaceColor: '#fff8ed', fontStyle: 'sans', decoration: 'glow', visualStyle: 'cards', sectionColumns: 2 };
    assert.doesNotThrow(() => assertCompleteAIMenuStyle(full, custom));
    assert.throws(() => assertCompleteAIMenuStyle(undefined, custom), /complete menu design/);
    for (const key of menuAIStyleKeys(custom)) {
        const missing = { ...full }; delete missing[key];
        assert.throws(() => assertCompleteAIMenuStyle(missing, custom), /complete menu design/);
    }
    const template = Object.fromEntries(Object.entries(full).filter(([key]) => !key.endsWith('Color')));
    assert.doesNotThrow(() => assertCompleteAIMenuStyle(template, design));
    assert.throws(() => assertCompleteAIMenuStyle({ ...full, backgroundColor: 'white' }, custom), /complete menu design/);
});

test('basic AI requests omit new fields for older backends; style requests include only requested branding', () => {
    const input = { productIds: ['pepsi'], menuName: ' Cafe ', brief: ' Drinks ', includeDeals: false, existingSections: [], productPrices: { pepsi: 0, foreign: 100 } };
    const basic = buildMenuAIRequest(input);
    assert.deepEqual(basic, { ...input, menuName: 'Cafe', brief: 'Drinks', productPrices: { pepsi: 0 } });
    assert.equal('includeStyle' in basic, false); assert.equal('brand' in basic, false); assert.equal('currentDesign' in basic, false);
    const brand = { name: 'Cafe', logo: 'data:image/png;base64,aGVsbG8=', colors: ['#222222'], theme: 'Cozy cafe' };
    assert.deepEqual(buildMenuAIRequest(input, { currentDesign: design, brand }), { ...basic, includeStyle: true, currentDesign: design, brand });
    assert.equal(input.productPrices.foreign, 100);
});

test('only accepted style fields apply; individual colors, positions, template and original draft survive', () => {
    const current = { ...design, backgroundColor: '#ffffff', headerColor: '#333333', surfaceColor: '#ffffff', fontStyle: 'sans', decoration: 'none' };
    const content = [newMenuBlock('title', '#ffffff', 'Cafe'), { ...newMenuBlock('section', current.accentColor, 'Drinks'), span: 3, page: 2, productIds: ['pepsi'] }, newMenuBlock('heading', '#123456', 'My custom heading')];
    const original = JSON.stringify(content);
    // No backgroundColor field means the user unchecked that suggestion.
    const result = applyMenuStyle(content, current, { textColor: '#222222', accentColor: '#223344', decoration: 'corners', reason: 'Do not persist this explanation', templateId: 'custom' });
    assert.equal(result.design.backgroundColor, '#ffffff'); assert.equal(result.design.decoration, 'corners');
    assert.equal(result.design.templateId, 'midnight'); assert.equal(result.design.reason, undefined);
    assert.equal(result.content[0].color, '#222222'); assert.equal(result.content[1].color, '#223344');
    assert.equal(result.content[2].color, '#123456'); assert.equal(result.content[1].span, 3); assert.equal(result.content[1].page, 2);
    assert.deepEqual(result.content[1].productIds, ['pepsi']); assert.equal(JSON.stringify(content), original);
    const userEdit = applyMenuStyle(result.content, result.design, { textColor: '#000000', decoration: 'none' });
    assert.equal(userEdit.content[0].color, '#000000'); assert.equal(userEdit.design.decoration, 'none');
});

test('old menu import uses unique name matches and requires review of missing, ambiguous or duplicate inventory items', () => {
    assert.equal(matchImportedItem(' pepsi ', importProducts).id, 'pepsi');
    assert.equal(matchImportedItem('Pepsi', [...importProducts, { id: 'other', name: 'pepsi' }]), undefined);
    const sections = reviewImportedMenu(oldMenu, importProducts, {});
    assert.equal(sections[0].items[1].price, '0'); assert.equal(validateReviewedImport(sections, importProducts), undefined);
    sections[0].items[1].productId = 'pepsi'; assert.match(validateReviewedImport(sections, importProducts), /more than once/);
    sections[0].items[1].productId = ''; assert.match(validateReviewedImport(sections, importProducts), /Match every/);
    sections[0].items[1].selected = false; assert.equal(validateReviewedImport(sections, importProducts), undefined);
});

test('modern designs change section widths only when accepted and preserve manual styles, prices and page placement', () => {
    const current = { ...design, templateId: 'custom', visualStyle: 'classic' };
    const content = [newMenuBlock('title', current.textColor, 'Cafe'), { ...newMenuBlock('section', '#123456', 'Drinks'), fontSize: 19, span: 6, page: 2, productIds: ['pepsi'] }];
    const original = JSON.stringify(content);
    const appearanceOnly = applyMenuStyle(content, current, { visualStyle: 'cards', decoration: 'glow' });
    assert.equal(appearanceOnly.content[1].span, 6);
    const layout = applyMenuStyle(content, current, { visualStyle: 'editorial', sectionColumns: 2 });
    assert.equal(layout.design.visualStyle, 'editorial'); assert.equal(layout.design.sectionColumns, 2);
    assert.equal(layout.content[0].span, content[0].span); assert.equal(layout.content[1].span, 3);
    assert.equal(layout.content[1].page, 2); assert.equal(layout.content[1].fontSize, 19); assert.equal(layout.content[1].color, '#123456');
    assert.deepEqual(layout.content[1].productIds, ['pepsi']); assert.equal(JSON.stringify(content), original);
    const generated = applyAISections([content[0]], [], { pepsi: 0 }, 1, [section('Coffee', ['pepsi'])], layout.design, 'Cafe');
    assert.equal(generated.content[1].span, 3); assert.deepEqual(generated.productPrices, { pepsi: 0 });
});

test('AI modernizes every template without changing any palette or individually chosen text colors', () => {
    for (const templateId of ['classic', 'modern', 'cafe', 'fast-food', 'fine-dining', 'fresh', 'bakery', 'ocean', 'desi', 'midnight']) {
        const current = { ...design, templateId, backgroundColor: '#112233', headerColor: '#445566', surfaceColor: '#778899' };
        const content = createTemplatePage(current, 'My menu', 1);
        const originalColors = content.map(block => block.color);
        const result = applyAIMenuStyle(content, current, { backgroundColor: '#ffffff', textColor: '#000000', accentColor: '#ff0000', headerColor: '#000000', surfaceColor: '#ffffff', visualStyle: 'cards', sectionColumns: 2, decoration: 'glow', fontStyle: 'sans' });
        assert.ok(menuAIStyleKeys(current).every(key => !key.endsWith('Color')));
        for (const key of ['backgroundColor', 'textColor', 'accentColor', 'headerColor', 'surfaceColor']) assert.equal(result.design[key], current[key]);
        assert.deepEqual(result.content.map(block => block.color), originalColors);
        assert.equal(result.design.visualStyle, 'cards'); assert.ok(result.content.filter(block => block.type === 'section').every(block => block.span === 3));
        assert.deepEqual(applyAIMenuCopy(content, current, 'My menu', { menuName: 'Unexpected name', headings: [{ type: 'heading', text: 'Extra' }] }), { content, name: 'My menu' });
    }
});

test('accepted custom name and headings remain editable; rejected copy, existing formatting and size failures preserve the draft', () => {
    const custom = { ...design, templateId: 'custom' };
    const title = { ...newMenuBlock('title', '#123456', 'My menu'), fontSize: 48, align: 'right', span: 3 };
    const content = [title, { ...newMenuBlock('section', custom.accentColor, 'Drinks'), productIds: ['pepsi'], page: 2 }];
    const original = JSON.stringify(content);
    const copy = { menuName: ' Modern Cafe ', headings: [{ type: 'heading', text: 'Explore the menu' }, { type: 'label', text: 'Snacks & sips' }] };
    const result = applyAIMenuCopy(content, custom, 'My menu', copy);
    assert.equal(result.name, 'Modern Cafe'); assert.equal(result.content[0].text, 'Modern Cafe');
    assert.equal(result.content[0].fontSize, 48); assert.equal(result.content[0].align, 'right'); assert.equal(result.content[0].color, '#123456');
    assert.equal(result.content[1].type, 'heading'); assert.equal(result.content[2].type, 'label');
    assert.equal(result.content[3].page, 2); assert.deepEqual(result.content[3].productIds, ['pepsi']); assert.equal(JSON.stringify(content), original);
    assert.equal(applyAIMenuCopy(result.content, custom, result.name, copy).content.length, 4);
    assert.deepEqual(applyAIMenuCopy(content, custom, 'My menu', {}), { content, name: 'My menu' });
    const full = Array.from({ length: 100 }, (_, index) => ({ ...newMenuBlock('label', '#ffffff', 'Note'), id: `note-${index}` }));
    const before = JSON.stringify(full); assert.throws(() => applyAIMenuCopy(full, custom, '', copy), /100-element/); assert.equal(JSON.stringify(full), before);
});

test('reviewed old prices replace only menu prices, and template section styles and original names survive import', () => {
    const sections = reviewImportedMenu(oldMenu, importProducts, {});
    const existing = { name: 'Current menu', content: createTemplatePage(design, 'Current menu', 1), pageCount: 1, productIds: ['pepsi'], productPrices: { pepsi: 200 } };
    const original = JSON.stringify(existing);
    const result = buildImportedMenu({ name: oldMenu.name, sections, mode: 'replace' }, design, existing, importProducts);
    assert.equal(result.name, 'Old cafe'); assert.deepEqual(result.productPrices, { pepsi: 180, fanta: 0 });
    const drinks = result.content.find(block => block.type === 'section'); assert.equal(drinks.text, 'Drinks'); assert.equal(drinks.span, 3);
    assert.deepEqual(drinks.productIds, ['pepsi', 'fanta']); assert.equal(JSON.stringify(existing), original); assert.equal(importProducts[0].salePrice, 200);
    const appended = buildImportedMenu({ name: oldMenu.name, sections, mode: 'append' }, design, existing, importProducts);
    assert.equal(appended.name, 'Current menu'); assert.equal(appended.pageCount, 2); assert.equal(appended.content.find(block => block.type === 'section' && block.productIds.length).page, 2);
});

test('large imported sections continue across pages; unreadable prices use visible inventory defaults; oversized imports are rejected atomically', () => {
    const products = Array.from({ length: 31 }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}`, salePrice: 10 }));
    const source = { name: 'Old', notes: '', sections: [{ name: 'Snacks', page: 1, items: products.map(item => ({ name: item.name, price: null })) }] };
    const sections = reviewImportedMenu(source, products, {}); assert.equal(sections[0].items[0].price, '10'); assert.equal(sections[0].items[0].priceMissing, true);
    const existing = { name: '', content: [], pageCount: 1, productIds: [], productPrices: {} };
    const result = buildImportedMenu({ name: 'Old', sections, mode: 'replace' }, design, existing, products);
    assert.equal(result.pageCount, 3); assert.equal(result.productIds.length, 31); assert.deepEqual(result.content.filter(block => block.type === 'section').map(block => block.productIds.length), [15, 15, 1]);
    sections[0].page = 20; assert.throws(() => buildImportedMenu({ name: 'Old', sections, mode: 'replace' }, design, existing, products), /20 pages/); assert.deepEqual(existing.content, []);
});

test('existing template sections retain placement and styles; items move without duplication or changing inventory prices', () => {
    const content = createTemplatePage(design, '369 Pizza', 1);
    const drinks = content.find(block => block.text === 'Drinks'); drinks.productIds = ['pepsi']; drinks.fontSize = 19; drinks.align = 'right';
    const pizzas = content.find(block => block.text === 'Pizzas'); pizzas.productIds = ['pizza', 'fanta'];
    const original = JSON.stringify(content);
    const result = applyAISections(content, ['pizza', 'pepsi', 'fanta'], { pepsi: 180 }, 1, [section('Drinks', ['fanta', 'pepsi'])], design, '369 Pizza');
    const updated = result.content.find(block => block.id === drinks.id);
    assert.equal(updated.fontSize, 19); assert.equal(updated.align, 'right'); assert.equal(updated.span, drinks.span);
    assert.deepEqual(updated.productIds, ['fanta', 'pepsi']);
    assert.deepEqual(result.content.find(block => block.id === pizzas.id).productIds, ['pizza']);
    assert.deepEqual(result.productPrices, { pepsi: 180 }); assert.equal(result.pageCount, 1);
    assert.equal(JSON.stringify(content), original);
});

test('large AI sections continue on template pages with headings and each item appears exactly once', () => {
    const items = Array.from({ length: 35 }, (_, i) => `drink-${i}`);
    const result = applyAISections(createTemplatePage(design, '369 Pizza', 1), [], {}, 1, [section('Drinks', items)], design, '369 Pizza');
    assert.equal(result.pageCount, 3);
    assert.deepEqual(result.content.filter(block => block.text === 'Drinks').map(block => block.productIds.length), [15, 15, 5]);
    assert.equal(result.content.filter(block => block.type === 'heading' || block.type === 'title').length, 3);
    const assigned = result.content.flatMap(block => block.productIds); assert.equal(new Set(assigned).size, 35);
    assert.deepEqual(result.productIds, items);
});

test('custom layouts get sections and limit failures leave the original draft untouched', () => {
    const custom = { ...design, templateId: 'custom' };
    const title = newMenuBlock('title', '#ffffff', 'Cafe');
    const result = applyAISections([title], [], {}, 1, [section('Coffee', ['coffee'])], custom, 'Cafe');
    assert.equal(result.content[0].id, title.id); assert.equal(result.content[1].text, 'Coffee');
    const full = [title, ...Array.from({ length: 99 }, () => newMenuBlock('label', '#fff', 'Note'))];
    const original = JSON.stringify(full);
    assert.throws(() => applyAISections(full, [], {}, 1, [section('Coffee', ['coffee'])], custom, 'Cafe'), /100-element/);
    assert.equal(JSON.stringify(full), original);
    assert.throws(() => applyAISections([title], [], {}, 1, [section('A', ['coffee']), section('B', ['coffee'])], custom, 'Cafe'), /only belong/);
});

const copiedMenu = () => ({
    name: 'Karachi Grill', notes: '', tagline: 'Since 1998', footer: 'Prices include tax',
    style: { backgroundColor: '#111111', textColor: '#f5f5f5', accentColor: '#e4b965', surfaceColor: '#1c1c1c', fontStyle: 'serif', visualStyle: 'cards', decoration: 'border', titleAlign: 'center' },
    sections: [
        { name: 'Drinks', page: 1, span: 3, items: [{ name: 'PEPSI', price: 180, description: '', image: '' }, { name: 'Mint Margarita', price: 350, description: 'Fresh mint, lemon', image: 'data:image/webp;base64,AAAA' }] },
        { name: 'BBQ', page: 1, span: 3, items: Array.from({ length: 18 }, (_, i) => ({ name: `Tikka ${i}`, price: 500 + i, description: '' })) },
        { name: 'Desserts', page: 2, span: 2, items: [{ name: 'Kheer', price: 250 }] },
    ],
});

test('unmatched old menu items become reviewed new inventory items with their photo, description, section and price', () => {
    const sections = reviewImportedMenu(copiedMenu(), importProducts, {});
    assert.equal(sections[0].span, 3); assert.equal(sections[0].items[0].productId, 'pepsi');
    assert.equal(sections[0].items[1].image, 'data:image/webp;base64,AAAA'); assert.equal(sections[2].items[0].description, '');
    assert.match(validateReviewedImport(sections, importProducts), /Match every/);
    assert.equal(validateReviewedImport(sections, importProducts, true), undefined);
    sections[0].items[1].name = ' '; assert.match(validateReviewedImport(sections, importProducts, true), /name for every new item/);
    sections[0].items[1].name = 'Mint Margarita';
    sections[1].items[17].selected = false; sections[2].selected = false;
    const review = { name: 'Karachi Grill', sections, mode: 'replace' };
    const original = JSON.stringify(review);
    let next = 0;
    const prepared = prepareImportProducts(review, () => `id${next++}-`);
    assert.equal(JSON.stringify(review), original);
    assert.equal(prepared.products.length, 18);
    assert.deepEqual(prepared.products[0], { id: 'id0-0', sku: 'MENU-ID0-0', name: 'Mint Margarita', category: 'Drinks', purchasePrice: 0, salePrice: 350, price: 350, stock: 0, minStock: 0, description: 'Fresh mint, lemon', imageUrl: 'data:image/webp;base64,AAAA' });
    assert.equal(prepared.products[1].category, 'BBQ'); assert.equal('imageUrl' in prepared.products[1], false);
    assert.equal(prepared.review.sections[0].items[0].productId, 'pepsi');
    assert.equal(prepared.review.sections[1].items[17].productId, ''); assert.equal(prepared.review.sections[2].items[0].productId, '');
    assert.equal(validateReviewedImport(prepared.review.sections, [...importProducts, ...prepared.products]), undefined);
});

test('copying the old look recreates its colors, font, section widths, pages, copy, photos and descriptions without splitting sections', () => {
    const source = copiedMenu();
    const prepared = prepareImportProducts({ name: source.name, sections: reviewImportedMenu(source, importProducts, {}), mode: 'replace', copyLook: true, style: source.style, tagline: source.tagline, footer: source.footer });
    const current = { templateId: 'midnight', accentColor: '#bb99ee', textColor: '#ffffff', pageSize: 'a5', orientation: 'portrait', showImages: false };
    const existing = { name: 'Current', content: createTemplatePage(current, 'Current', 1), pageCount: 1, productIds: ['fanta'], productPrices: { fanta: 99 } };
    const result = buildImportedMenu(prepared.review, current, existing, [...importProducts, ...prepared.products]);
    assert.equal(result.design.templateId, 'custom'); assert.equal(result.design.backgroundColor, '#111111'); assert.equal(result.design.accentColor, '#e4b965');
    assert.equal(result.design.fontStyle, 'serif'); assert.equal(result.design.visualStyle, 'cards'); assert.equal(result.design.decoration, 'border'); assert.equal(result.design.sectionColumns, 2);
    assert.equal(result.design.pageSize, 'a5'); assert.equal(result.design.showImages, true); assert.equal(result.design.showDescriptions, true);
    assert.deepEqual(result.content.map(block => [block.type, block.text, block.page, block.span]), [
        ['title', 'Karachi Grill', 1, 6], ['label', 'Since 1998', 1, 6], ['section', 'Drinks', 1, 3], ['section', 'BBQ', 1, 3], ['section', 'Desserts', 2, 2], ['label', 'Prices include tax', 2, 6],
    ]);
    assert.equal(result.content[0].align, 'center'); assert.equal(result.content[2].color, '#e4b965'); assert.equal(result.content[0].color, '#f5f5f5');
    assert.equal(result.content[3].productIds.length, 18); assert.equal(result.pageCount, 2);
    assert.equal(result.productIds.length, 21); assert.equal(result.productIds.includes('fanta'), false); assert.equal(result.productPrices.pepsi, 180);
    const templated = buildImportedMenu({ ...prepared.review, copyLook: false }, current, existing, [...importProducts, ...prepared.products]);
    assert.equal(templated.design.templateId, 'midnight'); assert.equal(templated.design.showImages, true);
    assert.equal(templated.content.some(block => block.text === 'Prices include tax'), false);
    assert.deepEqual(templated.content.filter(block => block.text.startsWith('BBQ')).map(block => block.productIds.length), [15, 3]);
});

test('keeping the original picture opens it as page 1, with read items listed after it or nothing else added', () => {
    const source = copiedMenu();
    const picture = 'data:image/webp;base64,UElDVFVSRQ==';
    const current = { templateId: 'midnight', accentColor: '#bb99ee', textColor: '#ffffff', showImages: false };
    const empty = { name: '', content: [], pageCount: 1, productIds: [], productPrices: {} };
    const base = { name: source.name, sections: reviewImportedMenu(source, importProducts, {}), mode: 'replace', style: source.style, tagline: source.tagline, footer: source.footer, picture, keepPicture: true };
    const listed = prepareImportProducts(base);
    assert.equal(listed.products.length, 20);
    const result = buildImportedMenu(listed.review, current, empty, [...importProducts, ...listed.products]);
    assert.deepEqual(result.content.map(block => [block.type, block.text, block.page]), [
        ['image', 'Karachi Grill', 1], ['title', 'Karachi Grill', 2], ['section', 'Drinks', 2], ['section', 'BBQ', 2], ['section', 'Desserts', 3],
    ]);
    assert.equal(result.content[0].imageUrl, picture); assert.equal(result.content[0].span, 6);
    assert.equal(result.pageCount, 3); assert.equal(result.design.backgroundColor, '#111111'); assert.equal(result.productIds.length, 21);
    const pictureOnly = prepareImportProducts({ ...base, listItems: false });
    assert.equal(pictureOnly.products.length, 0);
    const only = buildImportedMenu(pictureOnly.review, current, empty, importProducts);
    assert.deepEqual(only.content.map(block => [block.type, block.page]), [['image', 1], ['title', 1]]);
    assert.deepEqual(only.productIds, []); assert.deepEqual(only.productPrices, {}); assert.equal(only.pageCount, 1);
    assert.equal(only.design.templateId, 'custom'); assert.equal(only.design.backgroundColor, '#111111'); assert.equal(only.design.showImages, false);
    const existing = { name: 'Current', content: createTemplatePage(current, 'Current', 1), pageCount: 1, productIds: ['fanta'], productPrices: { fanta: 99 } };
    const appended = buildImportedMenu({ ...listed.review, mode: 'append' }, current, existing, [...importProducts, ...listed.products]);
    assert.equal(appended.content.find(block => block.type === 'image').page, 2); assert.equal(appended.design.templateId, 'midnight');
    assert.equal(appended.content.filter(block => block.type === 'title').length, 1);
    assert.equal(Math.min(...appended.content.filter(block => block.type === 'section' && block.productIds.length).map(block => block.page)), 3);
    assert.throws(() => buildImportedMenu({ ...listed.review, mode: 'append' }, current, { ...existing, pageCount: 20 }, [...importProducts, ...listed.products]), /20 pages/);
});

test('AI requests include the old menu picture only when it is used', () => {
    const input = { productIds: ['pepsi'], menuName: 'Cafe', brief: '', includeDeals: false, existingSections: [], productPrices: {} };
    assert.equal('inspiration' in buildMenuAIRequest(input), false);
    assert.equal(buildMenuAIRequest(input, undefined, 'data:image/webp;base64,AAAA').inspiration, 'data:image/webp;base64,AAAA');
});
