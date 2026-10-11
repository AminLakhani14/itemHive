import { test } from 'node:test';
import assert from 'node:assert/strict';
import DigitalMenu from '../models/DigitalMenu';
import Product from '../models/Product';
import OrderDraft from '../models/OrderDraft';
import { createDigitalMenu, getDigitalMenus, getPublicMenu, previewDigitalMenu, publishDigitalMenu, submitPublicOrder, updateDigitalMenu } from './digitalMenuController';
import * as publications from '../services/menuPublication';
import MenuPublication from '../models/MenuPublication';
import { MENU_TEMPLATE_IDS, parseMenuDesign, type MenuDesign } from '../utils/menuDesign';
import { parseMenuContent, parseMenuPageCount, type MenuBlock } from '../utils/menuContent';
import { menuItemPrice, parseMenuPrices } from '../utils/menuPrices';
import type { AuthRequest } from '../middleware/auth';
import type { Response } from 'express';

const design: MenuDesign = {
    templateId: 'custom', accentColor: '#c1a0ef', headerColor: '#28203e',
    backgroundColor: '#191625', surfaceColor: '#2b253b', textColor: '#f5efff',
    layout: 'grid', fontStyle: 'sans', showImages: true,
};
const content: MenuBlock[] = [
    { id: 'welcome', type: 'heading', text: 'Welcome', fontSize: 40, color: '#c1a0ef', align: 'center', productIds: [] },
    { id: 'drinks', type: 'section', text: 'Drinks', fontSize: 28, color: '#c1a0ef', align: 'left', productIds: ['coffee'] },
    { id: 'note', type: 'label', text: 'Freshly prepared every day', fontSize: 16, color: '#f5efff', align: 'right', productIds: [] },
];
const staffRequest = (body: Record<string, unknown> = {}) => ({
    user: { id: '507f1f77bcf86cd799439011', businessId: '507f1f77bcf86cd799439012', businessIsLegacy: false, role: 'super_admin' },
    body, params: { id: '507f1f77bcf86cd799439013', token: 'table-qr' },
}) as unknown as AuthRequest;
const response = () => {
    const result = { status: 200, body: undefined as any };
    const res = { status: (code: number) => { result.status = code; return res; }, json: (body: unknown) => { result.body = body; return res; } } as unknown as Response;
    return { result, res };
};

test('accepted AI combos save as tenant-owned deals and retries publish only one copy', async t => {
    const parentId = '507f1f77bcf86cd799439013';
    const clientRequestId = '42d74142-9f3a-4c3f-9b4b-3bf84c43539f';
    const parent = { _id: parentId, name: 'Cafe', productIds: ['coffee', 'cake'], businessId: staffRequest().user!.businessId, content, pageCount: 1, isActive: true };
    let saved: any;
    let live: any;
    t.mock.method(DigitalMenu, 'findOne', () => ({ lean: async () => parent }));
    t.mock.method(Product, 'countDocuments', async (filter: any) => { assert.equal(String(filter.businessId), String(parent.businessId)); return 2; });
    t.mock.method(DigitalMenu, 'findOneAndUpdate', async (filter: any, update: any) => {
        assert.equal(filter.clientRequestId, clientRequestId); assert.equal(String(filter.businessId), String(parent.businessId)); assert.equal(String(filter.sourceMenuId), parentId);
        if (!saved) {
            const model = new DigitalMenu(update.$setOnInsert); await model.validate(); saved = model.toObject();
        }
        return saved;
    });
    t.mock.method(DigitalMenu, 'find', () => ({ lean: async () => [saved] }));
    t.mock.method(publications, 'publishSnapshot', async (_: unknown, snapshot: unknown) => { live = snapshot; });
    const body = { name: 'Coffee + Cake', menuType: 'deal', sourceMenuId: parentId, clientRequestId, productIds: ['coffee', 'cake'], dealPrice: 350 };
    const first = response(); await createDigitalMenu(staffRequest(body), first.res); assert.equal(first.result.status, 201);
    const second = response(); await createDigitalMenu(staffRequest(body), second.res); assert.equal(String(first.result.body._id), String(second.result.body._id));
    assert.equal(saved.dealPrice, 350); assert.equal(saved.menuType, 'deal'); assert.equal(String(saved.sourceMenuId), parentId);
    const published = response(); await publishDigitalMenu(staffRequest(), published.res); assert.equal(published.result.status, 200);
    assert.equal(live.deals.length, 1); assert.equal(live.deals[0].name, 'Coffee + Cake'); assert.equal(live.deals[0].dealPrice, 350);
});

test('menu prices accept zero and round to paisa, reject invalid or unrelated prices, and fall back to Inventory', () => {
    assert.deepEqual(parseMenuPrices({ coffee: 175.555, cake: 0 }, ['coffee', 'cake']), { coffee: 175.56, cake: 0 });
    assert.equal(parseMenuPrices(undefined, []), undefined);
    for (const value of [null, [], { coffee: -1 }, { coffee: '100' }, { coffee: NaN }, { coffee: Infinity }, { coffee: Number.MAX_VALUE }, { foreign: 10 }]) assert.equal(parseMenuPrices(value, ['coffee']), null);
    assert.equal(menuItemPrice({ id: 'coffee', salePrice: 400 }, { coffee: 0 }), 0);
    assert.equal(menuItemPrice({ id: 'coffee', salePrice: 400 }), 400);
    assert.equal(menuItemPrice({ id: 'toString', price: 25 }, {}), 25);
});

test('item prices survive model saving and publication; draft edits stay private and QR orders use the published price', async (t) => {
    let root: any;
    let live: any;
    const businessId = '507f1f77bcf86cd799439012';
    const inventory = [{ id: 'coffee', name: 'Coffee', salePrice: 400 }];
    const table = { tableName: 'Table 1', sourceMenuId: 'root', businessId, orderingEnabled: true };
    const draft = { items: [] as Array<{ productId: string; unitPrice: number; quantity: number }>, save: async () => {} };
    t.mock.method(DigitalMenu, 'create', async (data: any) => {
        const model = new DigitalMenu(data);
        await model.validate();
        root = { ...model.toObject(), save: async () => {} };
        return root;
    });
    t.mock.method(DigitalMenu, 'findOne', (filter: any) => filter.token ? { lean: async () => table } : Object.assign(root, { lean: async () => root }));
    t.mock.method(DigitalMenu, 'find', () => ({ lean: async () => [] }));
    t.mock.method(DigitalMenu, 'updateMany', async () => ({}));
    t.mock.method(Product, 'countDocuments', async () => 1);
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => inventory }) }));
    t.mock.method(publications, 'publishSnapshot', async (_: unknown, snapshot: unknown) => { live = { menu: JSON.parse(JSON.stringify(snapshot)) }; });
    t.mock.method(publications, 'getPublication', async () => live);
    t.mock.method(OrderDraft, 'findOne', async () => draft);
    const { result, res } = response();
    await createDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee', 'cake'], productPrices: { coffee: 175.555, cake: 0 }, content, design: { ...design, pageSize: 'a4', orientation: 'portrait', decoration: 'corners', visualStyle: 'cards', sectionColumns: 2 } }), res);
    assert.equal(result.status, 201);
    assert.deepEqual(root.productPrices, { coffee: 175.56, cake: 0 });
    assert.equal(root.design.pageSize, 'a4');
    assert.equal(root.design.orientation, 'portrait');
    assert.equal(root.design.decoration, 'corners');
    assert.equal(root.design.visualStyle, 'cards'); assert.equal(root.design.sectionColumns, 2);
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], status: 'draft' }), res);
    assert.deepEqual(root.productPrices, { coffee: 175.56 });
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], productPrices: { coffee: 225 }, status: 'draft' }), res);
    await publishDigitalMenu(staffRequest(), res);
    assert.deepEqual(live.menu.productPrices, { coffee: 225 });
    assert.equal(live.menu.design.pageSize, 'a4');
    assert.equal(live.menu.design.decoration, 'corners');
    assert.equal(live.menu.design.visualStyle, 'cards'); assert.equal(live.menu.design.sectionColumns, 2);
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], productPrices: { coffee: 300 }, design: { ...design, pageSize: 'a5', orientation: 'landscape', decoration: 'dots' }, status: 'draft' }), res);
    assert.equal(publications.hasMenuChanges(root, live.menu), true);
    await getPublicMenu(staffRequest(), res);
    assert.equal(result.body.products[0].salePrice, 225);
    assert.equal(result.body.menu.design.pageSize, 'a4');
    assert.equal(result.body.menu.design.orientation, 'portrait');
    assert.equal(result.body.menu.design.decoration, 'corners');
    assert.equal(result.body.menu.design.visualStyle, 'cards'); assert.equal(result.body.menu.design.sectionColumns, 2);
    await previewDigitalMenu(staffRequest(), res);
    assert.equal(result.body.products[0].salePrice, 300);
    assert.equal(result.body.menu.design.pageSize, 'a5');
    assert.equal(result.body.menu.design.orientation, 'landscape');
    assert.equal(result.body.menu.design.decoration, 'dots');
    await submitPublicOrder(staffRequest({ items: [{ productId: 'coffee', quantity: 2, unitPrice: 1 }] }), res);
    assert.deepEqual(draft.items, [{ productId: 'coffee', productName: 'Coffee', quantity: 2, unitPrice: 225 }]);
    assert.equal(inventory[0].salePrice, 400);
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], productPrices: { coffee: -1 }, status: 'draft' }), res);
    assert.equal(result.status, 400);
    assert.equal(root.productPrices.coffee, 300);
    await createDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], productPrices: { foreign: 10 } }), res);
    assert.equal(result.status, 400);
});

test('all ten templates and custom designs are accepted, while unsafe or incomplete design values are rejected', () => {
    assert.equal(MENU_TEMPLATE_IDS.filter(id => id !== 'custom').length, 10);
    for (const templateId of MENU_TEMPLATE_IDS) assert.deepEqual(parseMenuDesign({ ...design, templateId }), { ...design, templateId });
    for (const decoration of ['none', 'border', 'corners', 'dots', 'glow'] as const) assert.deepEqual(parseMenuDesign({ ...design, decoration }), { ...design, decoration });
    for (const visualStyle of ['classic', 'cards', 'minimal', 'editorial']) for (const sectionColumns of [1, 2, 3]) assert.deepEqual(parseMenuDesign({ ...design, visualStyle, sectionColumns }), { ...design, visualStyle, sectionColumns });
    for (const patch of [{ visualStyle: 'missing' }, { sectionColumns: 0 }, { sectionColumns: 4 }, { sectionColumns: '2' }]) assert.equal(parseMenuDesign({ ...design, ...patch }), null);
    assert.equal(parseMenuDesign({ ...design, decoration: 'url(https://example.com)' }), null);
    for (const pageSize of ['a4', 'a5', 'letter']) for (const orientation of ['portrait', 'landscape']) assert.deepEqual(parseMenuDesign({ ...design, pageSize, orientation }), { ...design, pageSize, orientation });
    for (const invalid of [null, [], {}, { ...design, templateId: 'missing' }, { ...design, accentColor: 'url(https://example.com)' }, { ...design, layout: 'unknown' }, { ...design, showImages: 'true' }, { ...design, pageSize: 'poster' }, { ...design, orientation: 'diagonal' }]) {
        assert.equal(parseMenuDesign(invalid), null);
    }
});

test('layout preserves text formatting and ordering and rejects invalid or duplicate section items', () => {
    assert.deepEqual(parseMenuContent(content, ['coffee']), content);
    assert.deepEqual(parseMenuContent([...content].reverse(), ['coffee']), [...content].reverse());
    assert.deepEqual(parseMenuContent([], ['coffee']), []);
    const invalid = [
        null, {}, [...content, content[0]],
        [{ ...content[1], productIds: ['foreign-product'] }],
        [{ ...content[1], productIds: ['coffee', 'coffee'] }],
        [content[1], { ...content[1], id: 'other-section' }],
        [{ ...content[0], productIds: ['coffee'] }],
        [{ ...content[0], text: ' ' }], [{ ...content[0], fontSize: 300 }],
        [{ ...content[0], color: 'url(https://example.com)' }], [{ ...content[0], align: 'invalid' }],
        Array.from({ length: 101 }, (_, i) => ({ ...content[0], id: `heading-${i}` })),
    ];
    for (const value of invalid) assert.equal(parseMenuContent(value, ['coffee']), null);
});

test('creating a menu stores sections and labels in the database model and rejects invalid layouts before saving', async (t) => {
    let saves = 0;
    t.mock.method(DigitalMenu, 'create', async (data: any) => {
        const menu = new DigitalMenu(data);
        await menu.validate();
        saves++;
        return menu.toObject();
    });
    const { result, res } = response();
    await createDigitalMenu(staffRequest({ name: 'My cafe', productIds: ['coffee'], design, content }), res);
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.content, content);
    await createDigitalMenu(staffRequest({ name: 'My cafe', productIds: ['coffee'], design, content: [{ ...content[1], productIds: ['foreign'] }] }), res);
    assert.equal(result.status, 400);
    assert.equal(saves, 1);
});

test('movable titles, column widths and multiple pages survive create, edit and public table QR responses', async (t) => {
    const layout: MenuBlock[] = [
        { ...content[1], page: 1, span: 2 },
        { ...content[0], id: 'title', type: 'title', text: 'Cafe', page: 2, span: 3 },
        { ...content[2], page: 2, span: 6 },
    ];
    assert.deepEqual(parseMenuContent(layout, ['coffee']), layout);
    for (const value of [0, 21, 1.5, '2', null]) assert.equal(parseMenuPageCount(value), null);
    for (const update of [{ page: 0 }, { page: 21 }, { page: 1.5 }, { span: 4 }, { span: '2' }]) assert.equal(parseMenuContent([{ ...layout[0], ...update }], ['coffee']), null);
    assert.equal(parseMenuContent([layout[1], { ...layout[1], id: 'second-title' }], ['coffee']), null);
    let root: any;
    let saves = 0;
    t.mock.method(DigitalMenu, 'create', async (data: any) => {
        const model = new DigitalMenu(data);
        await model.validate();
        root = { ...model.toObject(), save: async () => { saves++; } };
        return root;
    });
    const { result, res } = response();
    await createDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], content: layout, pageCount: 3 }), res);
    assert.equal(result.status, 201);
    assert.deepEqual(result.body.content, layout);
    assert.equal(result.body.pageCount, 3);
    await createDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], content: layout, pageCount: 1 }), res);
    assert.equal(result.status, 400);
    t.mock.method(DigitalMenu, 'findOne', async () => root);
    t.mock.method(DigitalMenu, 'updateMany', async () => ({}));
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], content: [...layout].reverse(), pageCount: 2 }), res);
    assert.equal(root.pageCount, 2);
    assert.deepEqual(root.content, [...layout].reverse());
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee'], pageCount: 1 }), res);
    assert.equal(result.status, 400);
    assert.equal(saves, 1);
    const table = { ...root, sourceMenuId: root._id, tableName: 'Table 1' };
    t.mock.method(publications, 'getPublication', async () => ({ menu: publications.menuSnapshot(root) }));
    t.mock.method(DigitalMenu, 'findOne', (filter: { token?: string }) => ({ lean: async () => filter.token ? table : root }));
    t.mock.method(DigitalMenu, 'find', () => ({ lean: async () => [] }));
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
    await getPublicMenu(staffRequest(), res);
    assert.equal(result.body.menu.pageCount, 2);
    assert.deepEqual(result.body.menu.content, [...layout].reverse());
});

test('editing layouts persists block order, while product-only edits preserve text and remove stale section references', async (t) => {
    let saves = 0;
    const menu = { _id: 'root', businessId: 'business', menuType: 'menu', name: 'Cafe', productIds: ['coffee', 'cake'], content: content.map(block => ({ ...block, productIds: [...block.productIds] })), save: async () => { saves++; } };
    t.mock.method(DigitalMenu, 'findOne', async () => menu);
    t.mock.method(DigitalMenu, 'updateMany', async () => ({}));
    const { result, res } = response();
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['coffee', 'cake'], content: [...content].reverse() }), res);
    assert.deepEqual(menu.content, [...content].reverse());
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['cake'] }), res);
    assert.equal(menu.content.find(block => block.type === 'section')?.productIds.length, 0);
    assert.equal(menu.content.find(block => block.type === 'heading')?.text, 'Welcome');
    assert.equal(menu.content.find(block => block.type === 'heading')?.fontSize, 40);
    await updateDigitalMenu(staffRequest({ name: 'Cafe', productIds: ['cake'], content: [{ ...content[0], color: 'bad' }] }), res);
    assert.equal(result.status, 400);
    assert.equal(saves, 2);
});

test('users can create multiple menus with persisted designs and legacy clients can omit design', async (t) => {
    const created: any[] = [];
    t.mock.method(DigitalMenu, 'create', async (data: any) => { created.push(data); return data; });
    t.mock.method(DigitalMenu, 'exists', async () => { throw new Error('Root menu creation must allow additional menus'); });
    const { result, res } = response();
    for (const templateId of ['custom', 'cafe'] as const) {
        await createDigitalMenu(staffRequest({ name: 'My menu', productIds: ['coffee'], design: { ...design, templateId } }), res);
        assert.equal(result.status, 201);
        assert.equal(result.body.design.templateId, templateId);
    }
    await createDigitalMenu(staffRequest({ name: 'Legacy menu', productIds: ['coffee'] }), res);
    assert.equal(result.status, 201);
    assert.equal(result.body.design, undefined);
    assert.equal(created.length, 3);
    await createDigitalMenu(staffRequest({ name: 'Invalid', productIds: ['coffee'], design: { ...design, headerColor: 'red' } }), res);
    assert.equal(result.status, 400);
    assert.equal(created.length, 3);
});

test('editing menu products preserves the design unless a valid replacement is supplied', async (t) => {
    let saves = 0;
    const menu = { _id: 'root', businessId: 'business', menuType: 'menu', name: 'Original', productIds: ['coffee'], design: { ...design }, save: async () => { saves++; } };
    t.mock.method(DigitalMenu, 'findOne', async () => menu);
    t.mock.method(DigitalMenu, 'updateMany', async () => ({}));
    const { result, res } = response();
    await updateDigitalMenu(staffRequest({ name: 'Updated', productIds: ['coffee', 'cake'] }), res);
    assert.deepEqual(menu.design, design);
    await updateDigitalMenu(staffRequest({ name: 'Updated', productIds: ['cake'], design: { ...design, templateId: 'bakery', layout: 'list' } }), res);
    assert.equal(menu.design.templateId, 'bakery');
    assert.equal(menu.design.layout, 'list');
    await updateDigitalMenu(staffRequest({ name: 'Updated', productIds: ['cake'], design: {} }), res);
    assert.equal(result.status, 400);
    assert.equal(saves, 2);
});

test('table QR responses use the current root design, and root previews are view-only', async (t) => {
    const root = { _id: 'root', businessId: 'business', name: 'Cafe', productIds: ['coffee'], design, content, orderingEnabled: true, tableName: '' };
    const table = { ...root, _id: 'table', sourceMenuId: 'root', token: 'table-qr', tableName: 'Table 1', design: { ...design, templateId: 'classic' } };
    t.mock.method(publications, 'getPublication', async () => ({ menu: publications.menuSnapshot(root) }));
    t.mock.method(DigitalMenu, 'findOne', (filter: { token?: string }) => ({ lean: async () => filter.token === 'table-qr' ? table : root }));
    t.mock.method(DigitalMenu, 'find', () => ({ lean: async () => [] }));
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => [{ id: 'coffee', name: 'Coffee', price: 400 }] }) }));
    const { result, res } = response();
    const req = staffRequest();
    await getPublicMenu(req, res);
    assert.deepEqual(result.body.menu.design, design);
    assert.deepEqual(result.body.menu.content, content);
    assert.equal(result.body.menu.orderingEnabled, true);
    req.params.token = 'root-token';
    await getPublicMenu(req, res);
    assert.deepEqual(result.body.menu.design, design);
    assert.equal(result.body.menu.orderingEnabled, false);
});

test('drafts can save unfinished menus but publication rejects empty menus and foreign or missing products', async (t) => {
    let root: any;
    let publishes = 0;
    t.mock.method(DigitalMenu, 'create', async (data: any) => {
        const model = new DigitalMenu(data);
        await model.validate();
        root = model.toObject();
        return root;
    });
    t.mock.method(DigitalMenu, 'findOne', () => ({ lean: async () => root }));
    t.mock.method(Product, 'countDocuments', async () => 0);
    t.mock.method(publications, 'publishSnapshot', async () => { publishes++; });
    const { result, res } = response();
    await createDigitalMenu(staffRequest({ status: 'draft', name: '', productIds: [], content: [{ ...content[0], text: '' }] }), res);
    assert.equal(result.status, 201);
    assert.equal(root.name, 'Untitled menu');
    assert.equal(root.content[0].text, '');
    assert.equal(root.status, 'draft');
    await publishDigitalMenu(staffRequest(), res);
    assert.equal(result.status, 400);
    root.productIds = ['missing']; root.content = [];
    await publishDigitalMenu(staffRequest(), res);
    assert.equal(result.status, 400);
    assert.equal(publishes, 0);
});

test('draft saves preserve the live snapshot, publishing switches one workspace menu and existing table QRs, and previews remain private', async (t) => {
    const businessId = '507f1f77bcf86cd799439012';
    const roots: any[] = ['first', 'second'].map(_id => ({ _id, name: _id, businessId, menuType: 'menu', status: 'draft', productIds: ['coffee'], content, design, isActive: true, save: async () => {} }));
    const table = { _id: 'table', token: 'table-qr', sourceMenuId: 'first', businessId, tableName: 'Table 1', orderingEnabled: true };
    let live: any = { menu: null };
    t.mock.method(publications, 'getPublication', async () => live);
    t.mock.method(publications, 'publishSnapshot', async (workspace: unknown, snapshot: unknown) => {
        assert.equal(String(workspace), businessId);
        live = { menu: JSON.parse(JSON.stringify(snapshot)) };
    });
    t.mock.method(DigitalMenu, 'findOne', (filter: any) => {
        const root = filter.token === 'table-qr' ? table : roots.find(menu => filter.token ? menu._id === filter.token : menu._id === filter._id);
        assert.equal(String(filter.businessId || businessId), businessId);
        return root ? Object.assign(root, { lean: async () => root }) : { lean: async () => null };
    });
    t.mock.method(DigitalMenu, 'find', () => ({ sort: () => Object.assign(Promise.resolve(roots), { lean: async () => roots }), lean: async () => [] }));
    t.mock.method(DigitalMenu, 'updateMany', async () => ({}));
    t.mock.method(Product, 'countDocuments', async () => 1);
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => [{ id: 'coffee', price: 400 }] }) }));
    const { result, res } = response();
    const req = staffRequest(); req.params.id = 'first';
    await publishDigitalMenu(req, res);
    assert.equal(live.menu._id, 'first');
    req.body = { name: 'Edited draft', productIds: [], content: [], status: 'draft' };
    await updateDigitalMenu(req, res);
    assert.equal(roots[0].name, 'Edited draft');
    assert.deepEqual(roots[0].productIds, []);
    await getPublicMenu(req, res);
    assert.equal(result.body.menu.name, 'first');
    assert.deepEqual(result.body.menu.productIds, ['coffee']);
    await previewDigitalMenu(req, res);
    assert.equal(result.body.menu.name, 'Edited draft');
    assert.equal(result.body.menu.orderingEnabled, false);
    req.params.id = 'second';
    await publishDigitalMenu(req, res);
    assert.equal(live.menu._id, 'second');
    await getPublicMenu(req, res);
    assert.equal(result.body.menu.name, 'second');
    await getDigitalMenus(req, res);
    assert.equal(result.body.filter((menu: any) => menu.status === 'published').length, 1);
    assert.equal(result.body.find((menu: any) => menu._id === 'second').status, 'published');
    req.params.token = 'first';
    await getPublicMenu(req, res);
    assert.equal(result.status, 404);
});

test('simultaneous publications use one atomic workspace document and recover a concurrent insert conflict', async (t) => {
    const writes: any[] = [];
    let duplicate = true;
    t.mock.method(MenuPublication, 'findOneAndUpdate', async (filter: unknown, update: unknown, options: any) => {
        if (duplicate && options.upsert) { duplicate = false; throw { code: 11000 }; }
        writes.push({ filter, update, options });
        return {};
    });
    const menu = publications.menuSnapshot({ _id: 'first', name: 'First', productIds: ['coffee'] });
    await Promise.all([publications.publishSnapshot('workspace', menu), publications.publishSnapshot('workspace', { ...menu, _id: 'second' })]);
    assert.equal(writes.length, 2);
    assert.ok(writes.every(write => write.filter._id === 'workspace'));
    assert.ok(writes.every(write => write.update.$set.menu._id));
    assert.ok(writes.some(write => !write.options.upsert));
});

test('legacy upgrade preserves one existing menu and a cleared publication never reactivates an older menu', async (t) => {
    let record: any = null;
    let legacyReads = 0;
    t.mock.method(MenuPublication, 'findById', () => ({ lean: async () => record }));
    const root = { _id: 'existing', name: 'Existing menu', productIds: ['coffee'], businessId: 'workspace' };
    t.mock.method(DigitalMenu, 'findOne', (filter: any) => {
        legacyReads++;
        assert.equal(filter.businessId, 'workspace');
        assert.deepEqual(filter.status, { $exists: false });
        assert.equal(filter.sourceMenuId, null);
        return { sort: () => ({ lean: async () => root }) };
    });
    t.mock.method(DigitalMenu, 'find', () => ({ lean: async () => [] }));
    t.mock.method(MenuPublication, 'findOneAndUpdate', (filter: any, update: any, options: any) => {
        assert.equal(filter._id, 'workspace');
        assert.equal(options.upsert, true);
        record = { menu: update.$setOnInsert.menu };
        return { lean: async () => record };
    });
    const publication = await publications.getPublication('workspace');
    assert.equal(publication?.menu?._id, 'existing');
    record.menu = null;
    assert.equal((await publications.getPublication('workspace'))?.menu, null);
    assert.equal(legacyReads, 1);
});

test('bundle orders use server prices, preserve quantities and totals when merged, and reject unavailable deals', async (t) => {
    const root = { _id: 'root', name: 'Menu', productIds: ['sugar'] };
    const table = { tableName: 'Table 1', sourceMenuId: 'root', businessId: 'business', orderingEnabled: true };
    const deals = [{ _id: 'lunch', productIds: ['sugar', 'jelly'], dealPrice: 120 }];
    t.mock.method(publications, 'getPublication', async () => ({ menu: publications.menuSnapshot(root, deals.map(deal => ({ ...deal, name: 'Lunch' }))) }));
    const products = [{ id: 'sugar', name: 'Sugar', price: 145 }, { id: 'jelly', name: 'Jelly', price: 15 }];
    const existing = { items: [{ productId: 'sugar', productName: 'Sugar', quantity: 1, unitPrice: 145 }], save: async () => {} };
    t.mock.method(DigitalMenu, 'findOne', (filter: { token?: string }) => ({ lean: async () => filter.token ? table : root }));
    t.mock.method(DigitalMenu, 'find', () => ({ lean: async () => deals }));
    t.mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => products }) }));
    t.mock.method(OrderDraft, 'findOne', async () => existing);
    let status = 200;
    const res = { status: (value: number) => { status = value; return res; }, json: (value: unknown) => value } as unknown as Response;
    const req = { params: { token: 'qr' }, body: { items: [], deals: [{ dealId: 'lunch', quantity: 2, dealPrice: 1 }] } } as unknown as AuthRequest;
    await submitPublicOrder(req, res);
    assert.equal(status, 200);
    assert.equal(existing.items.find(item => item.productId === 'sugar')?.quantity, 3);
    assert.equal(existing.items.find(item => item.productId === 'jelly')?.quantity, 2);
    const total = () => existing.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    assert.ok(Math.abs(total() - 385) < 1e-8);
    await submitPublicOrder(req, res);
    assert.ok(Math.abs(total() - 625) < 1e-8);
    req.body.deals = [{ dealId: 'foreign-deal', quantity: 1 }];
    await submitPublicOrder(req, res);
    assert.equal(status, 400);
    assert.ok(Math.abs(total() - 625) < 1e-8);
    req.body.deals = [{ dealId: 'lunch', quantity: 0.5 }];
    await submitPublicOrder(req, res);
    assert.equal(status, 400);
});
