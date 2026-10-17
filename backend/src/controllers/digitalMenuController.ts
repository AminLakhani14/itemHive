import crypto from 'crypto';
import { Response } from 'express';
import type { Types } from 'mongoose';
import DigitalMenu from '../models/DigitalMenu';
import Product from '../models/Product';
import OrderDraft from '../models/OrderDraft';
import User from '../models/User';
import Business from '../models/Business';
import type { AuthRequest } from '../middleware/auth';
import { branchMatch } from '../utils/branchScope';
import { isSuperAdminEmail, normalizeRole } from '../utils/accessControl';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';
import { allocateDealPrice } from '../utils/dealPricing';
import { parseMenuDesign } from '../utils/menuDesign';
import { parseMenuContent, parseMenuPageCount } from '../utils/menuContent';
import { menuItemPrice, parseMenuPrices } from '../utils/menuPrices';
import MenuPublication from '../models/MenuPublication';
import { getPublication, hasMenuChanges, menuSnapshot, publicationKey, publishSnapshot } from '../services/menuPublication';

// The main branch publishes under the business key; other branches under their own.
const publicationBranch = (req: AuthRequest) => req.user!.branchId && req.user!.branchId !== req.user!.mainBranchId ? req.user!.branchId : null;

// Public QR pages have no signed-in user, so the menu's own branch decides which products and drafts are used.
// A menu without a branch belongs to a business that has none, since branches adopt older records.
const publicMenuBranch = async (menu: { businessId?: Types.ObjectId; branchId?: Types.ObjectId | null }) => {
    if (!menu.branchId) return { filter: {}, publication: null };
    const business = await Business.findById(menu.businessId).select('branches._id').lean<{ branches?: Array<{ _id: Types.ObjectId }> }>();
    const mainBranchId = business?.branches?.[0] ? String(business.branches[0]._id) : '';
    const branchId = String(menu.branchId);
    return {
        filter: { branchId: branchMatch(branchId, mainBranchId) },
        publication: branchId !== mainBranchId ? branchId : null,
    };
};

const canUseMenus = (req: AuthRequest) => req.user?.role === 'super_admin' || req.user?.digitalMenuAccess !== 'none';
const canSendToPos = (req: AuthRequest) => req.user?.role === 'super_admin' || req.user?.digitalMenuAccess === 'pos';
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Menus created before this flag existed have no value saved. Preserve the
// intended super-admin behaviour for only those legacy menus; other accounts
// must still receive an explicit POS-level access assignment.
const isOrderingEnabled = async (menu: any) => {
    if (menu.orderingEnabled !== undefined) return menu.orderingEnabled !== false;
    if (!menu.createdBy) return false;

    const creator = await User.findById(menu.createdBy).select('role email').lean();
    return normalizeRole(creator?.role) === 'super_admin' || isSuperAdminEmail(creator?.email);
};

// The first version stored every table QR as a standalone menu. Convert those
// records into children of one reusable menu while preserving their tokens, so
// existing printed QR codes continue to work.
const normalizeLegacyTableMenus = async (req: AuthRequest) => {
    const tenantFilter = buildTenantFilter(req.user!);
    const records = await DigitalMenu.find({ ...tenantFilter, menuType: { $ne: 'deal' } }).sort({ createdAt: 1 });
    const modernRoots = records.filter(menu => !menu.sourceMenuId && !menu.tableName);
    const legacyTables = records.filter(menu => !menu.sourceMenuId && Boolean(menu.tableName));
    const signature = (menu: { name: string; productIds: string[] }) =>
        `${menu.name.trim().toLocaleLowerCase()}\u0000${[...menu.productIds].sort().join('\u0000')}`;
    const grouped = new Map<string, typeof legacyTables>();

    legacyTables.forEach(menu => {
        const key = signature(menu);
        grouped.set(key, [...(grouped.get(key) || []), menu]);
    });

    for (const [key, tableMenus] of grouped) {
        let root = modernRoots.find(menu => signature(menu) === key);
        if (!root) {
            const first = tableMenus[0];
            root = await DigitalMenu.create({
                name: first.name,
                tableName: '',
                menuType: 'menu',
                token: crypto.randomBytes(12).toString('hex'),
                productIds: first.productIds,
                productPrices: first.productPrices,
                design: first.design,
                content: first.content,
                pageCount: first.pageCount,
                isActive: first.isActive,
                orderingEnabled: first.orderingEnabled,
                createdBy: first.createdBy,
                businessId: first.businessId || getTenantObjectId(req.user!),
            });
            modernRoots.push(root);
        }
        await DigitalMenu.updateMany(
            { _id: { $in: tableMenus.map(menu => menu._id) } },
            { $set: { sourceMenuId: root._id, menuType: 'menu', name: root.name } },
        );
    }
};

export const getDigitalMenus = async (req: AuthRequest, res: Response) => {
    if (!canUseMenus(req)) return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    if (req.user!.businessIsLegacy) await DigitalMenu.updateMany({ businessId: { $exists: false } }, { $set: { businessId: getTenantObjectId(req.user!) } });
    await normalizeLegacyTableMenus(req);
    const menus = await DigitalMenu.find(buildTenantFilter(req.user!)).sort({ createdAt: -1 }).lean();
    const publication = await getPublication(getTenantObjectId(req.user!), publicationBranch(req));
    return res.json(menus.map(menu => {
        if (menu.sourceMenuId || menu.menuType === 'deal') return menu;
        const published = publication?.menu && publication.menu._id === String(menu._id);
        const deals = menus.filter(deal => deal.menuType === 'deal' && String(deal.sourceMenuId) === String(menu._id) && deal.isActive).map(deal => ({ _id: String(deal._id), name: deal.name, productIds: deal.productIds, dealPrice: deal.dealPrice }));
        return { ...menu, status: published ? 'published' : 'draft', hasUnpublishedChanges: Boolean(published && hasMenuChanges(menu, publication!.menu!, deals)) };
    }));
};

export const createDigitalMenu = async (req: AuthRequest, res: Response) => {
    if (!canUseMenus(req)) return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    let name = String(req.body.name || '').trim();
    const tableName = String(req.body.tableName || '').trim();
    const menuType = req.body.menuType === 'deal' ? 'deal' : 'menu';
    const dealPrice = req.body.dealPrice;
    if (menuType === 'deal' && (typeof dealPrice !== 'number' || !Number.isFinite(dealPrice * 100) || dealPrice < 0)) {
        return res.status(400).json({ message: 'Enter a valid combined deal price' });
    }
    const sourceMenuId = String(req.body.sourceMenuId || '').trim();
    const clientRequestId = req.body.clientRequestId;
    if (clientRequestId !== undefined && (menuType !== 'deal' || typeof clientRequestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientRequestId))) return res.status(400).json({ message: 'Invalid deal save request' });
    const design = req.body.design === undefined ? undefined : parseMenuDesign(req.body.design);
    if (design === null) return res.status(400).json({ message: 'Choose a valid menu template or custom design' });
    let productIds: string[] = [...new Set<string>((Array.isArray(req.body.productIds) ? req.body.productIds : []).map((value: unknown) => String(value)).filter(Boolean))];
    let sourceMenu: any = null;
    if (menuType === 'deal' && !sourceMenuId) return res.status(400).json({ message: 'Choose the main menu for this deal' });
    if (sourceMenuId) {
        sourceMenu = await DigitalMenu.findOne({ _id: sourceMenuId, ...buildTenantFilter(req.user!), menuType: 'menu', sourceMenuId: null }).lean();
        if (!sourceMenu) return res.status(400).json({ message: 'The selected menu is unavailable' });
        // A table QR reuses the menu. A deal keeps its own name and items.
        if (req.body.menuType !== 'deal') {
            name = sourceMenu.name;
            productIds = sourceMenu.productIds;
        }
    }
    const isTableQr = Boolean(sourceMenuId && req.body.menuType !== 'deal');
    const savingDraft = req.body.status === 'draft' && !sourceMenuId && menuType === 'menu';
    if (savingDraft && !name) name = 'Untitled menu';
    const productPrices = parseMenuPrices(req.body.productPrices, productIds);
    if (productPrices === null) return res.status(400).json({ message: 'Enter valid prices for the selected menu items' });
    const content = req.body.content === undefined ? undefined : parseMenuContent(req.body.content, productIds, savingDraft);
    if (content === null) return res.status(400).json({ message: 'Check your menu sections, text styles, and selected items' });
    const pageCount = parseMenuPageCount(req.body.pageCount);
    if (pageCount === null || (pageCount !== undefined && content?.some(block => (block.page ?? 1) > pageCount))) return res.status(400).json({ message: 'Choose valid menu pages (1 to 20)' });
    if (!name || (!savingDraft && !productIds.length) || (isTableQr && !tableName)) return res.status(400).json({ message: 'A name, at least one item, and a table name for each QR are required' });
    if (isTableQr) {
        const tableAlreadyExists = await DigitalMenu.exists({ ...buildTenantFilter(req.user!), tableName: new RegExp(`^${escapeRegExp(tableName)}$`, 'i') });
        if (tableAlreadyExists) return res.status(409).json({ message: `Table name "${tableName}" already exists. Please use a different table name.` });
    }
    const menuData = {
        name, tableName: isTableQr ? tableName : '', productIds, menuType, sourceMenuId: sourceMenu?._id || null,
        dealPrice: menuType === 'deal' ? Math.round(dealPrice * 100) / 100 : undefined,
        design: !sourceMenuId && menuType === 'menu' ? design : undefined,
        content: !sourceMenuId && menuType === 'menu' ? content : undefined,
        productPrices: !sourceMenuId && menuType === 'menu' ? productPrices : undefined,
        pageCount: !sourceMenuId && menuType === 'menu' ? pageCount : undefined,
        status: !sourceMenuId && menuType === 'menu' ? 'draft' : undefined,
        token: crypto.randomBytes(12).toString('hex'),
        orderingEnabled: req.user?.role === 'super_admin' || req.user?.digitalMenuAccess === 'pos',
        createdBy: req.user!.id,
        businessId: getTenantObjectId(req.user!),
    };
    if (clientRequestId) {
        const available = await Product.countDocuments({ ...buildTenantFilter(req.user!), id: { $in: productIds } });
        if (available !== productIds.length) return res.status(400).json({ message: 'Remove unavailable items from the suggested deal' });
        const filter = { businessId: getTenantObjectId(req.user!), sourceMenuId: sourceMenu._id, clientRequestId };
        // Retries after a lost response must not create the same accepted combo twice.
        try {
            const menu = await DigitalMenu.findOneAndUpdate(filter, { $setOnInsert: { ...menuData, clientRequestId } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
            return res.status(201).json(menu);
        } catch (err) {
            if ((err as { code?: number }).code !== 11000) throw err;
            const menu = await DigitalMenu.findOne(filter);
            if (!menu) throw err;
            return res.status(201).json(menu);
        }
    }
    const menu = await DigitalMenu.create(menuData);
    return res.status(201).json(menu);
};

export const updateDigitalMenu = async (req: AuthRequest, res: Response) => {
    if (!canUseMenus(req)) return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    const menu = await DigitalMenu.findOne({ _id: req.params.id, $and: [buildTenantFilter(req.user!), { $or: [{ sourceMenuId: null, menuType: 'menu' }, { menuType: 'deal' }] }] });
    if (!menu) return res.status(404).json({ message: 'Digital Menu not found' });
    const savingDraft = req.body.status === 'draft' && menu.menuType === 'menu';
    const name = String(req.body.name || '').trim() || (savingDraft ? 'Untitled menu' : '');
    const productIds = [...new Set<string>((Array.isArray(req.body.productIds) ? req.body.productIds : []).map((value: unknown) => String(value)).filter(Boolean))];
    if (!name || (!savingDraft && !productIds.length)) return res.status(400).json({ message: 'Menu name and at least one item are required' });
    const productPrices = parseMenuPrices(req.body.productPrices, productIds);
    if (productPrices === null) return res.status(400).json({ message: 'Enter valid prices for the selected menu items' });
    const pageCount = parseMenuPageCount(req.body.pageCount);
    if (pageCount === null) return res.status(400).json({ message: 'Choose valid menu pages (1 to 20)' });
    if (menu.menuType === 'menu' && req.body.content !== undefined) {
        const content = parseMenuContent(req.body.content, productIds, savingDraft);
        if (!content) return res.status(400).json({ message: 'Check your menu sections, text styles, and selected items' });
        if (content.some(block => (block.page ?? 1) > (pageCount ?? menu.pageCount ?? 20))) return res.status(400).json({ message: 'Move elements to an existing menu page' });
        menu.content = content;
    } else if (menu.content) {
        // Older editors only update products. Keep their headings and order,
        // removing references to products that were taken off the menu.
        menu.content.forEach(block => { block.productIds = block.productIds.filter(id => productIds.includes(id)); });
    }
    if (menu.menuType === 'menu' && pageCount !== undefined) {
        if (menu.content?.some(block => (block.page ?? 1) > pageCount)) return res.status(400).json({ message: 'Move elements before removing their menu page' });
        menu.pageCount = pageCount;
    }
    if (menu.menuType === 'menu' && req.body.design !== undefined) {
        const design = parseMenuDesign(req.body.design);
        if (!design) return res.status(400).json({ message: 'Choose a valid menu template or custom design' });
        menu.design = design;
    }
    if (menu.menuType === 'deal') {
        const price = req.body.dealPrice;
        if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Enter a valid combined deal price' });
        menu.dealPrice = Math.round(price * 100) / 100;
    }
    menu.name = name;
    menu.productIds = productIds;
    if (menu.menuType === 'menu') menu.productPrices = productPrices ?? (menu.productPrices ? Object.fromEntries(Object.entries(menu.productPrices).filter(([id]) => productIds.includes(id))) : undefined);
    if (menu.menuType === 'menu') menu.status = 'draft';
    await menu.save();
    // QR records reference this menu dynamically; keeping their title in sync
    // makes legacy/admin data consistent as well.
    await DigitalMenu.updateMany({ sourceMenuId: menu._id, businessId: menu.businessId, menuType: 'menu' }, { $set: { name } });
    return res.json(menu);
};

export const publishDigitalMenu = async (req: AuthRequest, res: Response) => {
    if (!canUseMenus(req)) return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    const menu = await DigitalMenu.findOne({ _id: req.params.id, ...buildTenantFilter(req.user!), sourceMenuId: null, menuType: 'menu', isActive: true }).lean();
    if (!menu) return res.status(404).json({ message: 'Digital Menu not found' });
    if (!menu.name.trim() || !menu.productIds.length || (menu.content && !parseMenuContent(menu.content, menu.productIds)) || menu.content?.some(block => (block.page ?? 1) > (menu.pageCount ?? 20))) return res.status(400).json({ message: 'Add a menu name, at least one product, and complete all menu text before publishing' });
    if (parseMenuPrices(menu.productPrices, menu.productIds) === null) return res.status(400).json({ message: 'Enter valid prices before publishing' });
    const available = await Product.countDocuments({ id: { $in: menu.productIds }, ...buildTenantFilter(req.user!) });
    if (available !== menu.productIds.length) return res.status(400).json({ message: 'Remove unavailable products before publishing' });
    const deals = await DigitalMenu.find({ sourceMenuId: menu._id, ...buildTenantFilter(req.user!), menuType: 'deal', isActive: true }).lean();
    const snapshot = menuSnapshot(menu, deals.map(deal => ({ _id: String(deal._id), name: deal.name, productIds: deal.productIds, dealPrice: deal.dealPrice })));
    await publishSnapshot(getTenantObjectId(req.user!), snapshot, publicationBranch(req));
    return res.json({ message: 'Menu published', menuId: String(menu._id), status: 'published' });
};

export const previewDigitalMenu = async (req: AuthRequest, res: Response) => {
    if (!canUseMenus(req)) return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    const menu = await DigitalMenu.findOne({ _id: req.params.id, ...buildTenantFilter(req.user!), sourceMenuId: null, menuType: 'menu' }).lean();
    if (!menu) return res.status(404).json({ message: 'Digital Menu not found' });
    const deals = await DigitalMenu.find({ sourceMenuId: menu._id, ...buildTenantFilter(req.user!), menuType: 'deal', isActive: true }).lean();
    return sendMenuResponse(res, { ...menu, tableName: '' }, menuSnapshot(menu, deals.map(deal => ({ _id: String(deal._id), name: deal.name, productIds: deal.productIds, dealPrice: deal.dealPrice }))), false);
};

export const deleteDigitalMenu = async (req: AuthRequest, res: Response) => {
    if (!canUseMenus(req)) return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    const menu = await DigitalMenu.findOneAndDelete({ _id: req.params.id, ...buildTenantFilter(req.user!) });
    if (!menu) return res.status(404).json({ message: 'Digital Menu not found' });
    // Removing a root menu must also remove its deals and table QR records;
    // otherwise those QR links would point to an unavailable menu.
    if (!menu.sourceMenuId && menu.menuType === 'menu') {
        await MenuPublication.updateOne({ _id: publicationKey(getTenantObjectId(req.user!), publicationBranch(req)), 'menu._id': String(menu._id) }, { $set: { menu: null } });
        await DigitalMenu.deleteMany({ sourceMenuId: menu._id, ...buildTenantFilter(req.user!) });
    }
    return res.json({ message: 'Digital Menu removed' });
};

export const getTableDrafts = async (req: AuthRequest, res: Response) => {
    if (!canUseMenus(req)) return res.status(403).json({ message: 'Digital Menu access has not been enabled for this account' });
    const drafts = await OrderDraft.find({ ...buildTenantFilter(req.user!), digitalMenuTable: { $exists: true, $ne: '' } }).sort({ updatedAt: -1 }).lean();
    return res.json(drafts);
};

export const getPublicMenu = async (req: AuthRequest, res: Response) => {
    const menu = await DigitalMenu.findOne({ token: req.params.token, isActive: true }).lean();
    if (!menu) return res.status(404).json({ message: 'This QR menu is unavailable' });
    const branch = await publicMenuBranch(menu);
    const publication = await getPublication(menu.businessId, branch.publication);
    const rootMenu = publication?.menu && (menu.sourceMenuId || publication.menu._id === String(menu._id)) ? publication.menu : null;
    if (!rootMenu) return res.status(404).json({ message: 'This QR menu is unavailable' });
    return sendMenuResponse(res, menu, rootMenu, Boolean(menu.tableName) && await isOrderingEnabled(menu), branch.filter);
};

const sendMenuResponse = async (res: Response, menu: { tableName?: string; token: string; businessId?: Types.ObjectId }, rootMenu: ReturnType<typeof menuSnapshot>, orderingEnabled: boolean, branchFilter: object = {}) => {
    const deals = rootMenu.deals;
    const productIds = [...new Set([...rootMenu.productIds, ...deals.flatMap(deal => deal.productIds)])];
    // Inventory descriptions stay private unless the published design shows them.
    const products = await Product.find({ id: { $in: productIds }, businessId: menu.businessId, ...branchFilter }).select(`id name salePrice price imageUrl category${rootMenu.design?.showDescriptions ? ' description' : ''}`).lean();
    const ordered = productIds.flatMap(id => {
        const product = products.find(value => value.id === id);
        return product ? [{ ...product, salePrice: menuItemPrice(product, rootMenu.productPrices) }] : [];
    });
    return res.json({
        menu: { name: rootMenu.name, tableName: menu.tableName, token: menu.token, menuType: 'menu', productIds: rootMenu.productIds, design: rootMenu.design, content: rootMenu.content, pageCount: rootMenu.pageCount, orderingEnabled },
        deals: deals.map((deal) => ({ id: String(deal._id), name: deal.name, productIds: deal.productIds, dealPrice: deal.dealPrice ?? deal.productIds.reduce((sum, id) => { const product = products.find(product => product.id === id); return sum + Number(product?.salePrice ?? product?.price ?? 0); }, 0) })),
        products: ordered,
    });
};

export const submitPublicOrder = async (req: AuthRequest, res: Response) => {
    const menu = await DigitalMenu.findOne({ token: req.params.token, isActive: true }).lean();
    if (!menu) return res.status(404).json({ message: 'This QR menu is unavailable' });
    if (!menu.tableName) return res.status(400).json({ message: 'Orders can only be placed through a table QR code' });
    if (!(await isOrderingEnabled(menu))) return res.status(403).json({ message: 'This menu is view-only. Please call a waiter to order.' });
    const requested = Array.isArray(req.body.items) ? req.body.items : [];
    const requestedDeals = Array.isArray(req.body.deals) ? req.body.deals : [];
    const quantities = new Map<string, number>();
    const branch = await publicMenuBranch(menu);
    const publication = await getPublication(menu.businessId, branch.publication);
    const rootMenu = publication?.menu;
    if (!rootMenu) return res.status(404).json({ message: 'This QR menu is unavailable' });
    const deals = rootMenu.deals;
    const allowedProductIds = new Set(rootMenu.productIds);
    requested.forEach((item: any) => {
        const id = String(item.productId || ''); const quantity = Number(item.quantity);
        if (allowedProductIds.has(id) && Number.isInteger(quantity) && quantity > 0) quantities.set(id, quantity);
    });
    const dealQuantities = new Map<string, number>();
    for (const item of requestedDeals) {
        const id = String(item.dealId || '');
        const quantity = Number(item.quantity);
        if (!deals.some(deal => String(deal._id) === id) || !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({ message: 'One or more selected deals are unavailable or have an invalid quantity' });
        }
        dealQuantities.set(id, (dealQuantities.get(id) || 0) + quantity);
    }
    if (!quantities.size && !dealQuantities.size) return res.status(400).json({ message: 'Choose at least one menu item or deal' });
    const selectedDeals = deals.filter(deal => dealQuantities.has(String(deal._id)));
    const productIds = [...new Set([...quantities.keys(), ...selectedDeals.flatMap(deal => deal.productIds)])];
    const products = await Product.find({ id: { $in: productIds }, businessId: menu.businessId, ...branch.filter }).select('id name salePrice price').lean();
    if (products.length !== productIds.length) return res.status(400).json({ message: 'One or more selected items are unavailable' });
    const newItems = products.filter(product => quantities.has(product.id)).map((product) => ({ productId: product.id, productName: product.name, quantity: quantities.get(product.id)!, unitPrice: menuItemPrice(product, rootMenu.productPrices) }));
    const mergeItem = (target: typeof newItems, item: typeof newItems[number]) => {
        const found = target.find(current => current.productId === item.productId);
        if (found) {
            const quantity = found.quantity + item.quantity;
            found.unitPrice = (found.unitPrice * found.quantity + item.unitPrice * item.quantity) / quantity;
            found.quantity = quantity;
        } else target.push(item);
    };
    selectedDeals.forEach(deal => {
        const components = deal.productIds.map(id => products.find(product => product.id === id)!);
        const weights = components.map(product => Number(product.salePrice ?? product.price ?? 0));
        // Legacy deals use their combined item price until staff set a deal price.
        const prices = allocateDealPrice(deal.dealPrice ?? weights.reduce((sum, price) => sum + price, 0), weights);
        components.forEach((product, index) => mergeItem(newItems, { productId: product.id, productName: product.name, quantity: dealQuantities.get(String(deal._id))!, unitPrice: prices[index] }));
    });
    const filter = { businessId: menu.businessId, digitalMenuTable: menu.tableName, ...branch.filter };
    const existing = await OrderDraft.findOne(filter);
    if (existing) {
        newItems.forEach(item => mergeItem(existing.items, item));
        await existing.save();
        return res.json({ message: 'Added to the existing table order', draft: existing });
    }
    // Drafts retain a valid staff owner for existing POS/history tooling, while
    // the display name makes it clear the selection came from a customer QR.
    const owner = await User.findOne({ businessId: menu.businessId }).select('_id').lean();
    if (!owner) return res.status(400).json({ message: 'This menu workspace has no staff account' });
    const draft = await OrderDraft.create({ draftCode: `TB-${Date.now().toString(36).toUpperCase()}`, items: newItems, discountPercent: 0, orderType: 'dine_in', digitalMenuTable: menu.tableName, createdByName: 'QR Customer', createdBy: owner._id, businessId: menu.businessId, branchId: menu.branchId ?? null });
    return res.status(201).json({ message: 'Order sent to the table draft', draft });
};

export const requireDigitalPosAccess = (req: AuthRequest, res: Response) => {
    if (!canSendToPos(req)) return res.status(403).json({ message: 'Your Digital Menu access is menu-only. Ask the super admin to enable Add to POS.' });
    return res.status(204).end();
};
