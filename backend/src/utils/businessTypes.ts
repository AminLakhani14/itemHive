import AppSetting from '../models/AppSetting';
import Business from '../models/Business';
import BusinessTypeCatalog, { DEFAULT_BUSINESS_TYPES } from '../models/BusinessTypeCatalog';

// Initialize only once. Deleted defaults must not reappear on the next request.
export const getBusinessTypeCatalog = async () => {
    const catalog = await BusinessTypeCatalog.findOneAndUpdate(
        { key: 'global' },
        { $setOnInsert: { key: 'global', types: DEFAULT_BUSINESS_TYPES } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    ).orFail();
    // Add the new client categories once, while respecting later catalog deletions.
    if (!catalog.clientTypesInitialized) {
        const additions = DEFAULT_BUSINESS_TYPES.filter((type) => ['pharmacy', 'other'].includes(type.id)
            && !catalog.types.some((existing) => existing.id === type.id || existing.name.toLowerCase() === type.name.toLowerCase()));
        await BusinessTypeCatalog.updateOne({ _id: catalog._id, clientTypesInitialized: { $ne: true } }, {
            $set: { clientTypesInitialized: true }, ...(additions.length ? { $push: { types: { $each: additions } } } : {}),
        });
        return BusinessTypeCatalog.findById(catalog._id).orFail();
    }
    return catalog;
};

export const effectiveBusinessTypeId = (settings?: { businessTypeId?: string; restaurantEnabled?: boolean } | null) =>
    settings?.businessTypeId || (settings?.restaurantEnabled ? 'restaurant' : '');

export const getBusinessTypeAssignments = async () => {
    const businesses = await Business.find().select('_id isLegacy').lean();
    const businessIds = businesses.map((business) => String(business._id));
    const settings = await AppSetting.find({ $or: [
        { businessId: { $in: businessIds } },
        { key: { $in: [...businessIds.map((id) => `business:${id}`), 'global'] } },
    ] }).select('key businessId businessTypeId restaurantEnabled').lean();
    const legacyId = String(businesses.find((business) => business.isLegacy)?._id || '');
    const assignments = new Map<string, string>();
    // Match POS precedence: the tenant record wins over any legacy global record.
    for (const setting of [...settings.filter((item) => !item.key.startsWith('business:')), ...settings.filter((item) => item.key.startsWith('business:'))]) {
        const id = setting.key.startsWith('business:') ? setting.key.slice('business:'.length)
            : setting.key === 'global' ? legacyId : String(setting.businessId || '');
        if (businessIds.includes(id)) assignments.set(id, effectiveBusinessTypeId(setting));
    }
    return assignments;
};
