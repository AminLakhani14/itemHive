import { Router } from 'express';
import mongoose from 'mongoose';
import { protect, authorize, AuthRequest, requireScreenAccess } from '../middleware/auth';
import Category from '../models/Category';
import Product from '../models/Product';
import InventoryRequest from '../models/InventoryRequest';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';

const defaults = ['Snacks & Candy', 'Gum & Mints', 'Health & Personal', 'Accessories', 'Rolling Supplies', 'Groceries', 'General'];
const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const router = Router();
router.use(protect);
router.get('/', requireScreenAccess('inventory', 'inventory_categories', 'inventory_add', 'inventory_import', 'pos', 'orders', 'digital_menus'), async (req: AuthRequest, res) => {
    try {
        const [saved, existing] = await Promise.all([
            Category.find({ businessId: getTenantObjectId(req.user!) }).lean(),
            Product.distinct('category', buildTenantFilter(req.user!)),
        ]);
        const names = new Map([...defaults, ...existing].map(name => [name.toLowerCase(), name]));
        saved.forEach(category => {
            if (category.archived) names.delete(category.normalizedName);
            else names.set(category.normalizedName, category.name);
        });
        res.json([...names.values()]);
    } catch { res.status(500).json({ message: 'Unable to load categories.' }); }
});
router.post('/', authorize('super_admin', 'admin'), requireScreenAccess('inventory_categories'), async (req: AuthRequest, res) => {
    const name = clean(req.body.name);
    if (!name || name.length > 100) return res.status(400).json({ message: 'Enter a category name of up to 100 characters.' });
    try {
        await Category.findOneAndUpdate(
            { businessId: getTenantObjectId(req.user!), normalizedName: name.toLowerCase() },
            { $set: { name, archived: false } }, { upsert: true, runValidators: true }
        );
        res.status(201).json({ name });
    } catch { res.status(400).json({ message: 'Unable to save category. Please retry.' }); }
});
router.put('/', authorize('super_admin', 'admin'), requireScreenAccess('inventory_categories'), async (req: AuthRequest, res) => {
    const oldName = clean(req.body.oldName), name = clean(req.body.name);
    if (!oldName || !name || name.length > 100) return res.status(400).json({ message: 'Enter a category name of up to 100 characters.' });
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const businessId = getTenantObjectId(req.user!);
            const key = { businessId, normalizedName: name.toLowerCase() };
            const existing = await Category.findOne(key).session(session);
            if (name.toLowerCase() !== oldName.toLowerCase()) {
                const productNames = await Product.distinct('category', buildTenantFilter(req.user!)).session(session);
                if ((existing && !existing.archived) || (!existing && defaults.some(item => item.toLowerCase() === name.toLowerCase())) || productNames.some(item => item.toLowerCase() === name.toLowerCase())) throw new Error('This category already exists.');
                await Category.findOneAndUpdate({ businessId, normalizedName: oldName.toLowerCase() }, { $set: { name: oldName, archived: true } }, { upsert: true, session });
            }
            await Category.findOneAndUpdate(key, { $set: { name, archived: false } }, { upsert: true, session, runValidators: true });
            await Product.updateMany({ ...buildTenantFilter(req.user!), category: oldName }, { $set: { category: name } }, { session });
            await InventoryRequest.updateMany({ ...buildTenantFilter(req.user!), status: 'pending', 'productData.category': oldName }, { $set: { 'productData.category': name } }, { session });
        });
        res.json({ name });
    } catch (error) { res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to edit category.' }); }
    finally { await session.endSession(); }
});
router.delete('/', authorize('super_admin', 'admin'), requireScreenAccess('inventory_categories'), async (req: AuthRequest, res) => {
    const name = clean(req.body.name);
    if (!name) return res.status(400).json({ message: 'Choose a category.' });
    try {
        const [product, pending] = await Promise.all([
            Product.exists({ ...buildTenantFilter(req.user!), category: name }),
            InventoryRequest.exists({ ...buildTenantFilter(req.user!), status: 'pending', 'productData.category': name }),
        ]);
        if (product || pending) return res.status(409).json({ message: 'This category is used by inventory items or pending requests. Reassign them before deleting it.' });
        await Category.findOneAndUpdate({ businessId: getTenantObjectId(req.user!), normalizedName: name.toLowerCase() }, { $set: { name, archived: true } }, { upsert: true });
        res.json({ message: 'Category deleted.' });
    } catch { res.status(400).json({ message: 'Unable to delete category.' }); }
});
export default router;
