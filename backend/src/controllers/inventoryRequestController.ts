import { validateSellingProduct } from '../utils/productSelling';
import { Response } from 'express';
import mongoose from 'mongoose';
import InventoryRequest from '../models/InventoryRequest';
import Product from '../models/Product';
import type { AuthRequest } from '../middleware/auth';
import { normalizeRole } from '../utils/accessControl';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';
import InventoryVendors from '../models/InventoryVendors';
import { receiptChanges } from '../utils/inventoryReceiving';
import InventoryRequestReceipt from '../models/InventoryRequestReceipt';
import { validateInventoryProductLink } from '../utils/inventoryProductLink';
import { getRequestCategoryUnits } from '../services/requestCategoryUnits';

export const getInventoryVendors = async (req: AuthRequest, res: Response) => {
    try {
        const directory = await InventoryVendors.findOne({ businessId: getTenantObjectId(req.user!) }).lean();
        return res.json({ vendors: directory?.vendors.filter(vendor => !vendor.archived) || [], version: directory?.__v || 0 });
    } catch { return res.status(500).json({ message: 'Unable to load vendors.' }); }
};

export const saveInventoryVendors = async (req: AuthRequest, res: Response) => {
    // Old open forms must not replace the whole directory after vendor editing moved.
    return res.status(409).json({ message: 'Vendor editing has moved to the Vendors screen. Reload the page and save vendors there.' });
};

const buildProductPayload = (body: Record<string, any>) => ({
    unitSizeEnabled: body.unitSizeEnabled === true,
    sellingType: String(body.sellingType || ''),
    sizes: Array.isArray(body.sizes) ? body.sizes : [],
    id: String(body.id),
    sku: String(body.sku).toUpperCase(),
    name: String(body.name),
    category: String(body.category),
    purchasePrice: Number(body.purchasePrice),
    salePrice: Number(body.salePrice),
    price: Number(body.salePrice ?? body.price ?? 0),
    stock: Number(body.stock),
    minStock: Number(body.minStock),
    productUnitCode: String(body.productUnitCode || (body.unitSizeEnabled ? '' : 'piece')),
    productUnit: String(body.productUnit || (body.unitSizeEnabled ? '' : 'Piece')),
    productUnitUrdu: String(body.productUnitUrdu || 'عدد'),
    description: String(body.description || ''),
    imageUrl: String(body.imageUrl || ''),
    batchNumber: String(body.batchNumber || ''),
    expiryDate: String(body.expiryDate || ''),
    supplier: String(body.supplier || ''),
});

export const getInventoryRequests = async (req: AuthRequest, res: Response) => {
    try {
        const actorRole = normalizeRole(req.user?.role);
        const query = actorRole === 'user'
            ? { requestedBy: req.user?.id, ...buildTenantFilter(req.user!) }
            : buildTenantFilter(req.user!);

        const requests = await InventoryRequest.find(query).sort({ createdAt: -1 }).lean();
        return res.json(requests);
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to fetch inventory requests' });
    }
};

export const createInventoryRequest = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const duplicatePending = await InventoryRequest.findOne({
            requestedBy: req.user.id,
            'productData.sku': String(req.body.sku).toUpperCase(),
            status: 'pending',
            ...buildTenantFilter(req.user),
        });

        if (duplicatePending) {
            return res.status(400).json({ message: 'There is already a pending approval request for this SKU' });
        }

        const productData = buildProductPayload(req.body);
        validateSellingProduct(productData);
        const request = new InventoryRequest({
            requestedBy: req.user.id,
            requestedByName: req.user.name,
            requestedByEmail: req.user.email,
            productData,
            businessId: getTenantObjectId(req.user),
        });

        await request.save();

        return res.status(201).json({
            message: 'Inventory request submitted for admin approval',
            request,
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to create inventory request' });
    }
};

export const createRestockRequest = async (req: AuthRequest, res: Response) => {
    try {
        const { vendors, items } = req.body;
        const vendorIds = new Set(vendors.map((vendor: { id: string }) => vendor.id));
        if (items.some((item: { vendorId: string }) => !vendorIds.has(item.vendorId))) {
            return res.status(400).json({ message: 'Select a vendor from this request for every item.' });
        }
        const directory = await InventoryVendors.findOne({ businessId: getTenantObjectId(req.user!) }).lean();
        const savedVendors = directory?.vendors.filter(vendor => !vendor.archived && vendorIds.has(vendor.id)) || [];
        if (savedVendors.length !== vendorIds.size) return res.status(400).json({ message: 'Save vendor details before saving the stock request.' });
        const linkedIds = items.filter((item: { productId?: string }) => item.productId).map((item: { productId: string }) => item.productId);
        const products = linkedIds.length ? await Product.find({
            ...buildTenantFilter(req.user!),
            id: { $in: linkedIds },
        }).lean() : [];
        const productMap = new Map(products.map(product => [product.id, product]));
        const categoryUnits = items.some((item: { category?: string }) => item.category) ? await getRequestCategoryUnits(req.user!) : [];
        if (items.some((item: { productId?: string }) => item.productId && !productMap.has(item.productId))) {
            return res.status(400).json({ message: 'One or more items are unavailable in this workspace.' });
        }
        const request = new InventoryRequest({
            requestType: 'restock', vendors: savedVendors,
            items: items.map((item: { productId?: string; name?: string; category?: string; unit?: string; quantity: number; vendorId: string; remarks: string; sizeId?: string }) => {
                if (!item.productId) {
                    if (!item.name?.trim() || !item.unit?.trim()) throw new Error('Enter an item name and unit for every material.');
                    const category = item.category ? categoryUnits.find(category => category.name === item.category) : undefined;
                    if (item.category && (!category || !category.units.includes(item.unit))) throw new Error('Choose an allowed unit for the selected category. Reload category units if they have changed.');
                    return { name: item.name.trim(), category: category?.name, unit: item.unit.trim(), quantity: item.quantity, vendorId: item.vendorId, remarks: item.remarks };
                }
                const product = productMap.get(item.productId)!;
                const { size, unit, productName } = validateInventoryProductLink(product, item);
                const category = item.category ? categoryUnits.find(category => category.name === item.category) : undefined;
                if (item.category && (!category || !category.units.includes(item.unit || unit))) throw new Error('Choose an allowed unit for the selected category.');
                return { ...item, productName, category: category?.name, sizeId: size?.id, name: item.name?.trim() || productName, sku: product.sku, unit: item.unit || unit };
            }),
            requestedBy: req.user!.id, requestedByName: req.user!.name,
            requestedByEmail: req.user!.email, businessId: getTenantObjectId(req.user!),
        });
        await request.save();
        return res.status(201).json({ message: 'Stock request submitted for approval.', request });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to create stock request' });
    }
};

export const getInventoryRequestHistory = async (req: AuthRequest, res: Response) => {
    try {
        const filter = { _id: req.params.id, requestType: 'restock', ...buildTenantFilter(req.user!), ...(normalizeRole(req.user!.role) === 'user' ? { requestedBy: req.user!.id } : {}) };
        const request = await InventoryRequest.findOne(filter).lean();
        if (!request) return res.status(404).json({ message: 'Stock request not found.' });
        const receipts = await InventoryRequestReceipt.find({ requestId: request._id, businessId: getTenantObjectId(req.user!) }).sort({ createdAt: 1, _id: 1 }).lean();
        return res.json({ request, receipts });
    } catch { return res.status(400).json({ message: 'Unable to load request history.' }); }
};

export const receiveInventoryRequest = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    try {
        let updated;
        await session.withTransaction(async () => {
            const filter = { _id: req.params.id, requestType: 'restock', ...buildTenantFilter(req.user!), ...(normalizeRole(req.user!.role) === 'user' ? { requestedBy: req.user!.id } : {}) };
            const request = await InventoryRequest.findOne(filter).session(session);
            if (!request) throw new Error('Stock request not found.');
            if (request.status === 'rejected') throw new Error('Rejected requests cannot receive stock.');
            if ((request.__v || 0) !== req.body.version) throw new Error('This request changed. Reload it before saving delivery.');
            const received: number[] = req.body.receivedQuantities;
            const { deltas, deliveryStatus } = receiptChanges(request.items, received);
            const previousItems = request.toObject().items;
            const links: { productId?: string; sizeId?: string }[] | undefined = req.body.links;
            if (links && links.length !== previousItems.length) throw new Error('Provide a product link choice for every item.');
            const nextItems = previousItems.map((item, index) => ({ ...item, ...(links ? { productId: links[index].productId || undefined, sizeId: links[index].sizeId || undefined, productName: undefined, sku: undefined } : {}), receivedQuantity: received[index] }));
            for (let index = 0; index < nextItems.length; index++) {
                const item = nextItems[index];
                if (!item.productId || (!deltas[index] && !links)) continue;
                const product = await Product.findOne({ id: item.productId, ...buildTenantFilter(req.user!) }).session(session);
                if (!product) throw new Error(`Inventory item ${item.name} is unavailable.`);
                const { fixed, productName } = validateInventoryProductLink(product, { ...item, quantity: deltas[index] || item.quantity });
                item.productName = productName; item.sku = product.sku;
                if (!deltas[index]) continue;
                const result = await Product.updateOne(
                    { _id: product._id, ...buildTenantFilter(req.user!), ...(fixed ? { 'sizes.id': item.sizeId } : {}) },
                    { $inc: { stock: deltas[index], ...(fixed ? { 'sizes.$.stock': deltas[index] } : {}) }, $set: { lastUpdated: new Date() } },
                    { session },
                );
                if (result.modifiedCount !== 1) throw new Error(`Unable to receive ${item.name}. Please retry.`);
            }
            const hasDelivery = deltas.some(delta => delta > 0);
            const now = new Date();
            if (hasDelivery) {
                const receiptItems = (quantities: number[], source: typeof previousItems, opening = false) => source.flatMap((item, index) => quantities[index] > 0 ? [{
                    itemIndex: index, name: item.name, vendorId: item.vendorId, vendorName: request.vendors.find(vendor => vendor.id === item.vendorId)?.name || '',
                    unit: item.unit, orderedQuantity: item.quantity, quantity: quantities[index], totalReceived: opening ? item.receivedQuantity || 0 : received[index],
                    remaining: Number((item.quantity - (opening ? item.receivedQuantity || 0 : received[index])).toPrecision(15)),
                    productId: item.productId, productName: item.productName, sku: item.sku, sizeId: item.sizeId,
                    stockAction: opening ? 'previously_recorded' : item.productId ? 'product_updated' : 'record_only',
                }] : []);
                const events = [];
                if (!request.receiptHistoryStarted && previousItems.some(item => (item.receivedQuantity || 0) > 0)) {
                    events.push({ requestId: request._id, businessId: getTenantObjectId(req.user!), kind: 'opening_balance', occurredAt: request.receivedAt, receivedByName: request.receivedByName || '', note: 'Previously received balance. Individual earlier deliveries were not recorded.', items: receiptItems(previousItems.map(item => item.receivedQuantity || 0), previousItems, true) });
                }
                events.push({ requestId: request._id, businessId: getTenantObjectId(req.user!), kind: 'delivery', occurredAt: now, receivedBy: req.user!.id, receivedByName: req.user!.name, reference: req.body.reference || '', note: req.body.note || '', deliveryStatus, items: receiptItems(deltas, nextItems) });
                await InventoryRequestReceipt.create(events, { session });
            }
            updated = await InventoryRequest.findOneAndUpdate(
                { ...filter, __v: req.body.version },
                { $set: { items: nextItems, deliveryStatus, ...(hasDelivery ? { receiptHistoryStarted: true, receivedAt: now, receivedByName: req.user!.name } : {}) }, $inc: { __v: 1 } },
                { session, new: true, runValidators: true },
            );
            if (!updated) throw new Error('This request changed. Reload it before saving delivery.');
        });
        return res.json({ message: 'Delivery and receiving record saved.', request: updated });
    } catch (error: any) {
        return res.status(error.message?.includes('changed. Reload') ? 409 : 400).json({ message: error.message || 'Unable to save delivery.' });
    } finally { await session.endSession(); }
};

export const reviewInventoryRequest = async (req: AuthRequest, res: Response) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const request = await InventoryRequest.findOne({ _id: req.params.id, ...buildTenantFilter(req.user!) }).session(session);

        if (!request) {
            throw new Error('Inventory request not found');
        }

        if (request.status !== 'pending') {
            throw new Error('This inventory request has already been reviewed');
        }
        if (req.body.status === 'rejected' && request.items?.some(item => (item.receivedQuantity || 0) > 0)) throw new Error('A request with received stock cannot be rejected.');

        request.reviewedBy = new mongoose.Types.ObjectId(req.user?.id);
        request.reviewedByName = req.user?.name || '';
        request.decisionNote = String(req.body.decisionNote || '');
        request.status = req.body.status;

        if (req.body.status === 'approved' && request.requestType !== 'restock') {
            const skuExists = await Product.findOne({ sku: request.productData.sku, ...buildTenantFilter(req.user!) }).session(session);
            if (skuExists) {
                throw new Error('A product with this SKU already exists');
            }

            const productIdExists = await Product.findOne({ id: request.productData.id, ...buildTenantFilter(req.user!) }).session(session);
            if (productIdExists) {
                throw new Error('A product with this ID already exists');
            }

            const product = new Product({
                ...request.toObject().productData,
                price: request.productData.salePrice ?? request.productData.price,
                businessId: getTenantObjectId(req.user!),
                businessName: req.user?.businessName || '',
            });

            await product.save({ session });
            request.approvedProductId = product.id;
        }

        await request.save({ session });
        await session.commitTransaction();
        session.endSession();

        return res.json({
            message: `Inventory request ${request.status} successfully`,
            request,
        });
    } catch (error: any) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: error.message || 'Failed to review inventory request' });
    }
};
