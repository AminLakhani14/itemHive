import DigitalMenu from '../models/DigitalMenu';
import MenuPublication, { type PublishedMenu } from '../models/MenuPublication';
import type { MenuBlock } from '../utils/menuContent';
import type { MenuDesign } from '../utils/menuDesign';
import type { MenuPrices } from '../utils/menuPrices';

type MenuDefinition = { _id: unknown; name: string; productIds: string[]; design?: MenuDesign; content?: MenuBlock[]; pageCount?: number; productPrices?: MenuPrices };
// Each branch publishes its own menu. The main branch keeps the business key, so menus published before
// branches existed stay live. `branchId` is set only for other branches.
export const publicationKey = (businessId: unknown, branchId?: string | null) =>
    `${businessId ? String(businessId) : 'legacy'}${branchId ? `:${branchId}` : ''}`;
export const menuSnapshot = (menu: MenuDefinition, deals: PublishedMenu['deals'] = []): PublishedMenu => ({
    _id: String(menu._id), name: menu.name, productIds: [...menu.productIds], design: menu.design,
    content: menu.content, pageCount: menu.pageCount, deals: [...deals].sort((a, b) => a._id.localeCompare(b._id)),
    ...(menu.productPrices && Object.keys(menu.productPrices).length ? { productPrices: Object.fromEntries(Object.entries(menu.productPrices).sort(([a], [b]) => a.localeCompare(b))) } : {}),
});
export const hasMenuChanges = (menu: MenuDefinition, published: PublishedMenu, deals = published.deals) =>
    JSON.stringify(menuSnapshot(menu, deals)) !== JSON.stringify(published);

export const getPublication = async (businessId: unknown, branchId?: string | null) => {
    const key = publicationKey(businessId, branchId);
    let publication = await MenuPublication.findById(key).lean();
    // Only the main branch can have a menu that was live before publications existed.
    if (publication || branchId) return publication;
    // Preserve one existing live menu when upgrading older workspaces. New
    // draft records have an explicit status and cannot enter this fallback.
    const legacy = await DigitalMenu.findOne({ businessId: businessId || { $exists: false }, status: { $exists: false }, sourceMenuId: null, tableName: { $in: ['', null] }, menuType: { $ne: 'deal' }, isActive: true }).sort({ createdAt: -1, _id: -1 }).lean();
    if (!legacy) return null;
    const deals = await DigitalMenu.find({ sourceMenuId: legacy._id, businessId: legacy.businessId, menuType: 'deal', isActive: true }).lean();
    const menu = menuSnapshot(legacy, deals.map(deal => ({ _id: String(deal._id), name: deal.name, productIds: deal.productIds, dealPrice: deal.dealPrice })));
    try {
        publication = await MenuPublication.findOneAndUpdate({ _id: key }, { $setOnInsert: { menu, publishedAt: new Date() } }, { upsert: true, new: true }).lean();
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        publication = await MenuPublication.findById(key).lean();
    }
    return publication;
};

export const publishSnapshot = async (businessId: unknown, menu: PublishedMenu, branchId?: string | null) => {
    const key = publicationKey(businessId, branchId);
    const update = { $set: { menu, publishedAt: new Date() } };
    try {
        await MenuPublication.findOneAndUpdate({ _id: key }, update, { upsert: true, new: true });
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        await MenuPublication.findOneAndUpdate({ _id: key }, update, { new: true });
    }
};
