import { resolveSellingLine } from '../utils/productSelling';
import { Response } from 'express';
import Product from '../models/Product';
import Employee from '../models/Employee';
import OrderDraft from '../models/OrderDraft';
import type { AuthRequest } from '../middleware/auth';
import { normalizeRole } from '../utils/accessControl';
import { buildTenantFilter, getCachedAppSettingsForTenant, getTenantObjectId } from '../utils/tenancy';

type DraftItemInput = {
    sizeId?: unknown;
    productId?: unknown;
    quantity?: unknown;
    unitPrice?: unknown;
};

const buildDraftPayload = async (req: AuthRequest) => {
    const requestedItems = Array.isArray(req.body.items) ? req.body.items as DraftItemInput[] : [];
    if (requestedItems.length === 0) throw new Error('Add at least one product before saving a draft');
    if (requestedItems.length > 100) throw new Error('A draft cannot contain more than 100 products');

    const normalizedItems = requestedItems.map((item) => ({
        productId: String(item.productId || '').trim(),
        sizeId: String(item.sizeId || ''),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
    }));

    if (normalizedItems.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        throw new Error('Every draft product must have a valid quantity');
    }

    const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)));
    if (new Set(normalizedItems.map(item => `${item.productId}::${item.sizeId}`)).size !== normalizedItems.length) throw new Error('Duplicate product sizes are not allowed in a draft');

    // These two reads are independent. Running them together removes a remote
    // database round trip from every Save as Draft request while preserving
    // server-authoritative product, price, and discount validation.
    const [products, appSettings] = await Promise.all([
        Product.find({
            id: { $in: productIds },
            ...buildTenantFilter(req.user!),
        })
            // Draft validation has no need for product images or inventory
            // metadata; avoid transferring those large fields on Save as Draft.
            .select('id name stock salePrice price purchasePrice unitSizeEnabled sellingType productUnitCode productUnit sizes')
            .lean(),
        getCachedAppSettingsForTenant(req.user!),
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));
    if (productsById.size !== productIds.length) throw new Error('One or more draft products no longer exist');

    const actorRole = normalizeRole(req.user?.role);
    const qrDraft = actorRole === 'user' && req.user?.digitalMenuAccess === 'pos' && req.params.id
        ? await OrderDraft.findOne({ _id: req.params.id, ...buildTenantFilter(req.user!), digitalMenuTable: { $exists: true, $ne: '' } }).lean()
        : null;
    const items = normalizedItems.map((item) => {
        const product = productsById.get(item.productId)!;
        const sellingLine = resolveSellingLine(product, item.quantity, item.sizeId);
        const currentPrice = sellingLine.unitPrice;
        const requestedPrice = Number.isFinite(item.unitPrice) && item.unitPrice >= 0 ? item.unitPrice : currentPrice;
        const savedLine = qrDraft?.items.find(line => line.productId === item.productId && (line.sizeId || '') === item.sizeId);
        const matchesQrPrice = savedLine?.quantity === item.quantity && savedLine?.unitPrice === requestedPrice;
        return {
            productId: item.productId,
            productName: sellingLine.name,
            sizeId: item.sizeId,
            selectedSize: sellingLine.size?.size,
            productUnit: product.unitSizeEnabled ? product.productUnit : undefined,
            quantity: item.quantity,
            unitPrice: actorRole === 'user' && !matchesQrPrice ? currentPrice : requestedPrice,
        };
    });

    const requestedDiscount = Number(req.body.discountPercent || 0);
    const allowedDiscountOptions = (appSettings?.discountOptions || []).map(Number);
    const discountPercent = appSettings?.discountsEnabled
        && Number.isFinite(requestedDiscount)
        && allowedDiscountOptions.includes(requestedDiscount)
        ? Math.min(100, Math.max(0, requestedDiscount))
        : 0;
    const requestedOrderType = String(req.body.orderType || '').trim();
    const orderType = (appSettings.orderTypeOptions || [])
        .map((option) => String(option || '').trim())
        .includes(requestedOrderType)
        ? requestedOrderType
        : undefined;

    return {
        salespersonEmployeeId: await (async () => {
            if (!req.body.salespersonEmployeeId) return undefined;
            const e = await Employee.findOne({ _id: req.body.salespersonEmployeeId, status: 'active', businessId: getTenantObjectId(req.user!) }).select('_id');
            if (!e) throw new Error('Salesperson not found in this business');
            return e._id;
        })(),
        items,
        discountPercent,
        orderType,
        otherOrderType: orderType === 'other' ? String(req.body.otherOrderType || '').trim() : '',
        deliveryNumber: String(req.body.deliveryNumber || '').trim(),
    };
};

export const getOrderDrafts = async (req: AuthRequest, res: Response) => {
    try {
        const drafts = await OrderDraft.find(buildTenantFilter(req.user!)).sort({ updatedAt: -1 }).lean();
        return res.json(drafts);
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to fetch order drafts' });
    }
};

export const getOrderDraft = async (req: AuthRequest, res: Response) => {
    try {
        const draft = await OrderDraft.findOne({ _id: req.params.id, ...buildTenantFilter(req.user!) }).lean();
        if (!draft) return res.status(404).json({ message: 'Order draft not found' });
        return res.json(draft);
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to fetch order draft' });
    }
};

export const createOrderDraft = async (req: AuthRequest, res: Response) => {
    try {
        const payload = await buildDraftPayload(req);
        const draft = await OrderDraft.create({
            ...payload,
            draftCode: `DR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            createdBy: req.user!.id,
            createdByName: req.user!.name || 'Staff',
            businessId: getTenantObjectId(req.user!),
        });
        return res.status(201).json(draft);
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to save order draft' });
    }
};

export const updateOrderDraft = async (req: AuthRequest, res: Response) => {
    try {
        const payload = await buildDraftPayload(req);
        // Avoid hydrating a draft only to save it again. This is one atomic
        // update, scoped to the current tenant, and still runs schema checks.
        const draft = await OrderDraft.findOneAndUpdate(
            { _id: req.params.id, ...buildTenantFilter(req.user!) },
            payload,
            { new: true, runValidators: true },
        );
        if (!draft) return res.status(404).json({ message: 'Order draft not found' });
        return res.json(draft);
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update order draft' });
    }
};

export const deleteOrderDraft = async (req: AuthRequest, res: Response) => {
    try {
        const draft = await OrderDraft.findOneAndDelete({ _id: req.params.id, ...buildTenantFilter(req.user!) });
        if (!draft) return res.status(404).json({ message: 'Order draft not found' });
        return res.json({ message: 'Order draft removed' });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to remove order draft' });
    }
};
