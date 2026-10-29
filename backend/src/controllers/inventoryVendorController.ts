import { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import InventoryVendors from '../models/InventoryVendors';
import InventoryRequest from '../models/InventoryRequest';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';
import { normalizeRole } from '../utils/accessControl';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageOptions = (query: AuthRequest['query']) => ({
    page: Number.isFinite(Number(query.page)) ? Math.min(1_000_000, Math.max(0, Math.floor(Number(query.page)))) : 0,
    pageSize: Number.isFinite(Number(query.pageSize)) ? Math.min(100, Math.max(1, Math.floor(Number(query.pageSize)))) : 25,
    q: String(query.q || '').trim().slice(0, 120),
});

export const listVendors = async (req: AuthRequest, res: Response) => {
    try {
        const { page, pageSize, q } = pageOptions(req.query);
        const includeArchived = req.query.includeArchived === 'true';
        const filters: Record<string, unknown> = {
            ...(!includeArchived ? { 'vendors.archived': { $ne: true } } : {}),
            ...(q ? { $or: ['name', 'phone', 'cnic', 'address'].map(field => ({ [`vendors.${field}`]: { $regex: escapeRegex(q), $options: 'i' } })) } : {}),
        };
        const result = await InventoryVendors.aggregate([
            { $match: { businessId: getTenantObjectId(req.user!) } },
            { $unwind: '$vendors' }, { $match: filters }, { $sort: { 'vendors.name': 1, 'vendors.id': 1 } },
            { $facet: { vendors: [{ $skip: page * pageSize }, { $limit: pageSize }, { $replaceRoot: { newRoot: '$vendors' } }], count: [{ $count: 'total' }] } },
        ]);
        return res.json({ vendors: result[0]?.vendors || [], total: result[0]?.count[0]?.total || 0, page, pageSize });
    } catch { return res.status(500).json({ message: 'Unable to load vendors.' }); }
};

export const createVendor = async (req: AuthRequest, res: Response) => {
    try {
        const businessId = getTenantObjectId(req.user!);
        const vendor = { id: new mongoose.Types.ObjectId().toHexString(), name: req.body.name, phone: req.body.phone || '', cnic: req.body.cnic || '', address: req.body.address || '', version: 0, archived: false };
        await InventoryVendors.findOneAndUpdate({ businessId }, { $setOnInsert: { vendors: [] } }, { upsert: true });
        await InventoryVendors.updateOne({ businessId }, { $push: { vendors: vendor }, $inc: { __v: 1 } }, { runValidators: true });
        return res.status(201).json({ vendor });
    } catch { return res.status(400).json({ message: 'Unable to save vendor. Please retry.' }); }
};

export const updateVendor = async (req: AuthRequest, res: Response) => {
    try {
        const version = req.body.version || 0;
        const vendor = { id: String(req.params.vendorId), name: req.body.name, phone: req.body.phone || '', cnic: req.body.cnic || '', address: req.body.address || '', version: version + 1, archived: req.body.archived === true };
        const updated = await InventoryVendors.updateOne({
            businessId: getTenantObjectId(req.user!),
            vendors: { $elemMatch: { id: vendor.id, ...(version === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version }) } },
        }, { $set: { 'vendors.$': vendor }, $inc: { __v: 1 } }, { runValidators: true });
        if (!updated.modifiedCount) return res.status(409).json({ message: 'This vendor changed in another session. Reload the vendor list before editing.' });
        return res.json({ vendor });
    } catch { return res.status(400).json({ message: 'Unable to update vendor. Please retry.' }); }
};

export const getVendorHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { page, pageSize, q } = pageOptions(req.query);
        const vendorId = String(req.query.vendorId || '').slice(0, 100);
        const delivery = String(req.query.deliveryStatus || '');
        const clauses: Record<string, unknown>[] = [buildTenantFilter(req.user!), { requestType: 'restock' }];
        if (normalizeRole(req.user!.role) === 'user') clauses.push({ requestedBy: req.user!.id });
        if (vendorId) clauses.push({ 'items.vendorId': vendorId });
        if (['complete', 'partial'].includes(delivery)) clauses.push({ deliveryStatus: delivery });
        if (delivery === 'not_received') clauses.push({ $or: [{ deliveryStatus: 'not_received' }, { deliveryStatus: { $exists: false } }] });
        if (q) clauses.push({ $or: ['items.name', 'vendors.name', 'vendors.phone', 'vendors.cnic'].map(field => ({ [field]: { $regex: escapeRegex(q), $options: 'i' } })) });
        const filter = { $and: clauses };
        const [requests, total] = await Promise.all([
            InventoryRequest.find(filter).sort({ createdAt: -1, _id: -1 }).skip(page * pageSize).limit(pageSize).lean(),
            InventoryRequest.countDocuments(filter),
        ]);
        return res.json({ requests, total, page, pageSize });
    } catch { return res.status(500).json({ message: 'Unable to load vendor history.' }); }
};
