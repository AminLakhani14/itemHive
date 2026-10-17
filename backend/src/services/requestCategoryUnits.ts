import Category from '../models/Category';
import Product from '../models/Product';
import { buildTenantFilter, getTenantObjectId, type TenantContext } from '../utils/tenancy';
import { mergeRequestCategories } from '../utils/requestCategoryUnits';

export async function getRequestCategoryUnits(tenant: TenantContext) {
    const [saved, existing] = await Promise.all([
        Category.find({ businessId: getTenantObjectId(tenant) }).lean(),
        Product.distinct('category', buildTenantFilter(tenant)),
    ]);
    return mergeRequestCategories(saved, existing);
}
