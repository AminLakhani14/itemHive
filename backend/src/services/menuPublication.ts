import DigitalMenu from '../models/DigitalMenu';
import MenuPublication, { type PublishedMenu } from '../models/MenuPublication';
import type { MenuBlock } from '../utils/menuContent';
import type { MenuDesign } from '../utils/menuDesign';
import type { MenuPrices } from '../utils/menuPrices';

type MenuDefinition = { _id: unknown; name: string; productIds: string[]; design?: MenuDesign; content?: MenuBlock[]; pageCount?: number; productPrices?: MenuPrices };
export const publicationKey = (businessId: unknown) => businessId ? String(businessId) : 'legacy';
export const menuSnapshot = (menu: MenuDefinition, deals: PublishedMenu['deals'] = []): PublishedMenu => ({
    _id: String(menu._id), name: menu.name, productIds: [...menu.productIds], design: menu.design,
    content: menu.content, pageCount: menu.pageCount, deals: [...deals].sort((a, b) => a._id.localeCompare(b._id)),
    ...(menu.productPrices && Object.keys(menu.productPrices).length ? { productPrices: Object.fromEntries(Object.entries(menu.productPrices).sort(([a], [b]) => a.localeCompare(b))) } : {}),
});
export const hasMenuChanges = (menu: MenuDefinition, published: PublishedMenu, deals = published.deals) =>
    JSON.stringify(menuSnapshot(menu, deals)) !== JSON.stringify(published);

export const getPublication = async (businessId: unknown) => {
    const key = publicationKey(businessId);
    let publication = await MenuPublication.findById(key).lean();
    if (publication) return publication;
    // Preserve one existing live menu when upgrading older workspaces. New
    // draft records have an explicit status and cannot enter this fallback.
    const legacy = await DigitalMenu.findOne({ businessId: businessId || { $exists: false }, status: { $exists: false }, sourceMenuId: null, tableName: { $in: ['', null] }, menuType: { $ne: 'deal' }, isActive: true }).sort({ createdAt: -1, _id: -1 }).lean();
    if (!legacy) return null;
    const deals = await DigitalMenu.find({ sourceMenuId: legacy._id, businessId: legacy.businessId, menuType: 'deal', isActive: true }).lean();
    const menu = menuSnapshot(legacy, deals.map(deal => ({ _id: String(deal._id), name: deal.name, productIds: deal.productIds, dealPrice: deal.dealPrice })));
    try {
        publication = await MenuPublication.findOneAndUpdate({ _id: key }, { $setOnInsert: { menu, publishedAt: new Date() } }, { upsert: true, returnDocument: 'after' }).lean();
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        publication = await MenuPublication.findById(key).lean();
    }
    return publication;
};

export const publishSnapshot = async (businessId: unknown, menu: PublishedMenu) => {
    const key = publicationKey(businessId);
    const update = { $set: { menu, publishedAt: new Date() } };
    try {
        await MenuPublication.findOneAndUpdate({ _id: key }, update, { upsert: true, returnDocument: 'after' });
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        await MenuPublication.findOneAndUpdate({ _id: key }, update, { returnDocument: 'after' });
    }
};
