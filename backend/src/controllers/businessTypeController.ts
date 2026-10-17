import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import BusinessTypeCatalog from '../models/BusinessTypeCatalog';
import { getBusinessTypeAssignments, getBusinessTypeCatalog } from '../utils/businessTypes';
import { businessProductFields } from '../utils/businessProductFields';

export const getBusinessTypes = async (req: AuthRequest, res: Response) => {
    try {
        const catalog = await getBusinessTypeCatalog();
        const assignments = req.user?.role === 'super_admin' ? await getBusinessTypeAssignments() : new Map<string, string>();
        return res.json(catalog.types.map((type) => ({
            id: type.id, name: type.name, restaurantEnabled: type.restaurantEnabled,
            productFields: businessProductFields(type),
            businessCount: [...assignments.values()].filter((id) => id === type.id).length,
        })));
    } catch (error: unknown) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Business types could not be loaded.' });
    }
};

export const createBusinessType = async (req: AuthRequest, res: Response) => {
    try {
        await getBusinessTypeCatalog();
        const name = String(req.body.name).trim().replace(/\s+/g, ' ');
        const type = { id: randomUUID(), name, restaurantEnabled: false, productFields: req.body.productFields || ['unitSize'] };
        const updated = await BusinessTypeCatalog.findOneAndUpdate(
            { key: 'global', 'types.name': { $not: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
            { $push: { types: type } },
            { new: true, runValidators: true },
        );
        if (!updated) return res.status(409).json({ message: 'A business type with this name already exists.' });
        return res.status(201).json({ ...type, businessCount: 0 });
    } catch (error: unknown) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Business type could not be added.' });
    }
};

export const updateBusinessType = async (req: AuthRequest, res: Response) => {
    try {
        const catalog = await BusinessTypeCatalog.findOneAndUpdate(
            { key: 'global', 'types.id': req.params.id },
            { $set: { 'types.$.productFields': req.body.productFields } },
            { new: true, runValidators: true },
        );
        if (!catalog) return res.status(404).json({ message: 'Business type not found.' });
        return res.json({ message: 'Product fields updated.' });
    } catch (error: unknown) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Product fields could not be updated.' });
    }
};

export const deleteBusinessType = async (req: AuthRequest, res: Response) => {
    try {
        const catalog = await getBusinessTypeCatalog();
        const id = String(req.params.id);
        if (!catalog.types.some((type) => type.id === id)) return res.status(404).json({ message: 'Business type not found.' });
        const assignments = await getBusinessTypeAssignments();
        if ([...assignments.values()].includes(id)) {
            return res.status(409).json({ message: 'This type is assigned to a business. Change its business type in Team before deleting it.' });
        }
        await BusinessTypeCatalog.updateOne({ key: 'global' }, { $pull: { types: { id } } });
        return res.json({ message: 'Business type deleted.' });
    } catch (error: unknown) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Business type could not be deleted.' });
    }
};
