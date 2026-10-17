import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Joi from 'joi';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import Business from '../models/Business';
import User from '../models/User';
import AppSetting from '../models/AppSetting';
import { effectiveBusinessTypeId, getBusinessTypeCatalog } from '../utils/businessTypes';
import { isSuperAdminEmail } from '../utils/accessControl';
import { ADMIN_SCREEN_PERMISSIONS } from '../utils/screenPermissions';
import { getAppSettingsForTenant, invalidateAppSettingsCache } from '../utils/tenancy';
import { BranchLocationError, branchAdminIds, branchDetailsSchema, findDuplicateName, phoneSchema as phone, resolveBranchPlaces, serializeBranch } from '../utils/branches';
import { getCountries, getCities } from '../services/clientLocations';

const CNIC_PATTERN = /^(?:\d{13}|\d{5}-\d{7}-\d)$/;
const cnic = Joi.string().trim().pattern(CNIC_PATTERN).allow('').default('')
    .messages({ 'string.pattern.base': '{#label} must be 13 digits, e.g. 12345-1234567-1' });
const objectId = Joi.string().hex().length(24);

export const createClientSchema = Joi.object({
    businessName: Joi.string().trim().min(1).max(160).required(),
    businessTypeId: Joi.string().trim().max(100).required(),
    client: Joi.object({
        name: Joi.string().trim().min(1).max(120).required(),
        email: Joi.string().trim().lowercase().email().max(254).required(),
        phone: phone.allow('').default(''),
        cnic,
    }).required(),
    admin: Joi.object({
        name: Joi.string().trim().min(1).max(120).required(),
        email: Joi.string().trim().lowercase().email().max(254).required(),
        role: Joi.string().valid('admin').required(),
        password: Joi.string().min(8).max(128).required(),
        countryCode: Joi.string().uppercase().pattern(/^[A-Z]{2}$/).required(),
        city: Joi.string().trim().min(1).max(160).required(),
    }).required(),
    // Branches are optional; the Organization screens create a Main Branch for a business without one.
    branches: Joi.array().max(50).items(Joi.object({
        name: Joi.string().trim().min(1).max(160).required(),
        location: Joi.string().trim().max(500).allow('').default(''),
        phone: phone.allow('').default(''),
        city: Joi.string().trim().max(160).allow('').default(''),
        bindAdmin: Joi.boolean().strict().default(false),
    })).default([]),
    screenPermissions: Joi.array().items(Joi.string().valid(...ADMIN_SCREEN_PERMISSIONS)).unique().required(),
});

export const listCountries = async (_req: AuthRequest, res: Response) => {
    try { return res.json(await getCountries()); }
    catch { return res.status(503).json({ message: 'Unable to load countries. Please retry.' }); }
};

export const listCities = async (req: AuthRequest, res: Response) => {
    try {
        const country = (await getCountries()).find((item) => item.code === req.query.country);
        if (!country) return res.status(400).json({ message: 'Choose a valid country.' });
        return res.json(await getCities(country));
    } catch { return res.status(503).json({ message: 'Unable to load cities. Please retry.' }); }
};

export const createClient = async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ message: 'Only a super admin can create clients.' });
    const validation = createClientSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (validation.error) return res.status(400).json({ message: validation.error.details.map((detail) => detail.message).join(', ') });
    const input = validation.value;
    try {
        if (isSuperAdminEmail(input.admin.email)) return res.status(400).json({ message: 'Use a client email, rather than a reserved super admin email.' });
        if (await User.exists({ email: input.admin.email })) return res.status(409).json({ message: 'This login email already belongs to an account.' });
        const type = (await getBusinessTypeCatalog()).types.find((item) => item.id === input.businessTypeId);
        if (!type) return res.status(400).json({ message: 'Choose an available business type.' });
        let country;
        let cities;
        try {
            country = (await getCountries()).find((item) => item.code === input.admin.countryCode);
            if (country) cities = await getCities(country);
        } catch { return res.status(503).json({ message: 'Unable to verify the location. Please retry.' }); }
        if (!country || !cities?.includes(input.admin.city)) return res.status(400).json({ message: 'Choose a city belonging to the selected country.' });
        const allowedCities = new Set(cities);
        if (input.branches.some((branch: { city: string }) => branch.city && !allowedCities.has(branch.city))) {
            return res.status(400).json({ message: 'Choose a city in the selected country for every branch.' });
        }

        const businessId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await Business.create([{
                    _id: businessId, name: input.businessName, slug: `client-${randomUUID()}`,
                    createdBy: req.user!.id, clientContact: input.client,
                    branches: input.branches.map((branch: { name: string; location: string; phone: string; city: string; bindAdmin: boolean }) => ({
                        name: branch.name, location: branch.location, phone: branch.phone, city: branch.city,
                        countryCode: country.code, country: country.name,
                        adminUserId: branch.bindAdmin ? userId : null,
                        adminUserIds: branch.bindAdmin ? [userId] : [],
                    })),
                }], { session });
                await User.create([{
                    _id: userId, name: input.admin.name, email: input.admin.email, password: input.admin.password,
                    role: 'admin', businessId, createdBy: req.user!.id, screenPermissions: input.screenPermissions, screenPermissionsVersion: 3,
                    location: { countryCode: country.code, country: country.name, city: input.admin.city },
                    // Regional display settings currently support these nine locales.
                    ...(['PK', 'US', 'DE', 'GB', 'CH', 'CD', 'CG', 'IN', 'AE'].includes(country.code) ? {
                        preferences: { country: country.code, currency: ({ PK: 'PKR', US: 'USD', DE: 'EUR', GB: 'GBP', CH: 'CHF', CD: 'CDF', CG: 'XAF', IN: 'INR', AE: 'AED' } as Record<string, string>)[country.code] },
                    } : {}),
                }], { session });
                await AppSetting.create([{
                    key: `business:${businessId}`, businessId, shopName: input.businessName, shopPhone: input.client.phone,
                    businessTypeId: type.id, restaurantEnabled: type.restaurantEnabled,
                    installmentsEnabled: input.screenPermissions.includes('installments'),
                }], { session });
            });
        } finally { await session.endSession(); }
        return res.status(201).json({ message: 'Client created successfully.', businessId: String(businessId), userId: String(userId) });
    } catch (error: unknown) {
        if ((error as { code?: number }).code === 11000) return res.status(409).json({ message: 'This login email already belongs to an account.' });
        console.error('Client creation failed:', error);
        return res.status(500).json({ message: 'Unable to create the client. Please retry.' });
    }
};

// Edit Client keeps branches it is not sent. Branches without an id are added.
export const updateClientSchema = Joi.object({
    businessName: Joi.string().trim().min(1).max(160).required(),
    businessTypeId: Joi.string().trim().max(100).allow('').default(''),
    client: Joi.object({
        name: Joi.string().trim().max(120).allow('').default(''),
        email: Joi.string().trim().lowercase().email().max(254).allow('').default(''),
        phone: phone.allow('').default(''),
        cnic,
    }).required(),
    branches: Joi.array().max(200).items(branchDetailsSchema.keys({
        id: objectId,
        adminUserIds: Joi.array().max(50).items(objectId.required()).unique().default([]),
    })).default([]),
});

const findClientBusiness = async (id: string) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const business = await Business.findById(id);
    return business && !business.isLegacy ? business : null;
};

const serializeClient = async (business: any) => {
    const [settings, admins] = await Promise.all([
        AppSetting.findOne({ key: `business:${business._id}` }).select('businessTypeId restaurantEnabled').lean(),
        User.find({ businessId: business._id, role: 'admin', isActive: true }).select('name email location').sort({ name: 1 }).lean(),
    ]);
    const contact = business.clientContact || {};
    return {
        id: String(business._id),
        name: business.name,
        businessTypeId: effectiveBusinessTypeId(settings),
        contact: { name: contact.name || '', email: contact.email || '', phone: contact.phone || '', cnic: contact.cnic || '' },
        // New branches start in the client's country.
        countryCode: business.branches.find((branch: any) => branch.countryCode)?.countryCode
            || admins.find((admin) => admin.location?.countryCode)?.location?.countryCode || '',
        branches: business.branches.map(serializeBranch),
        administrators: admins.map((admin) => ({ id: String(admin._id), name: admin.name, email: admin.email })),
    };
};

export const getClient = async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ message: 'Only a super admin can edit clients.' });
    const business = await findClientBusiness(String(req.params.id));
    if (!business) return res.status(404).json({ message: 'Client not found.' });
    return res.json(await serializeClient(business));
};

export const updateClient = async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ message: 'Only a super admin can edit clients.' });
    const validation = updateClientSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (validation.error) return res.status(400).json({ message: validation.error.details.map((detail) => detail.message).join(', ') });
    const input = validation.value;
    const business = await findClientBusiness(String(req.params.id));
    if (!business) return res.status(404).json({ message: 'Client not found.' });

    type BranchInput = { id?: string; name: string; location: string; phone: string; countryCode: string; city: string; adminUserIds: string[] };
    const branches: BranchInput[] = input.branches;
    const existing = new Map(business.branches.map((branch: any) => [String(branch._id), branch]));
    const sentIds = branches.flatMap((branch) => branch.id ? [branch.id] : []);
    if (sentIds.some((id) => !existing.has(id)) || new Set(sentIds).size !== sentIds.length) {
        return res.status(400).json({ message: 'A branch was changed elsewhere. Reload the client and try again.' });
    }
    const keptNames = business.branches.filter((branch: any) => !sentIds.includes(String(branch._id))).map((branch: any) => branch.name);
    const duplicate = findDuplicateName([...keptNames, ...branches.map((branch) => branch.name)]);
    if (duplicate) return res.status(409).json({ message: `More than one branch is named "${duplicate}".` });
    // Only new assignments must be active, so a deactivated administrator's existing assignment does not block saving.
    const addedAdminIds = [...new Set(branches.flatMap((branch) => {
        const current = branch.id ? branchAdminIds(existing.get(branch.id)) : [];
        return branch.adminUserIds.filter((adminId) => !current.includes(adminId));
    }))];
    if (addedAdminIds.length && await User.countDocuments({ _id: { $in: addedAdminIds }, businessId: business._id, role: 'admin', isActive: true }) !== addedAdminIds.length) {
        return res.status(400).json({ message: 'Choose active administrators from this client.' });
    }
    const type = input.businessTypeId ? (await getBusinessTypeCatalog()).types.find((item) => item.id === input.businessTypeId) : null;
    if (input.businessTypeId && !type) return res.status(400).json({ message: 'Choose an available business type.' });
    let places;
    try {
        places = await resolveBranchPlaces(branches.map((branch) => ({ ...branch, current: branch.id ? existing.get(branch.id) as any : undefined })));
    } catch (error) {
        if (!(error instanceof BranchLocationError)) throw error;
        return res.status(error.status).json({ message: error.message });
    }

    business.name = input.businessName;
    business.clientContact = input.client;
    branches.forEach((branch, index) => {
        const values = {
            name: branch.name, location: branch.location, phone: branch.phone, ...places[index],
            adminUserIds: branch.adminUserIds.map((id) => new mongoose.Types.ObjectId(id)),
            adminUserId: branch.adminUserIds[0] ? new mongoose.Types.ObjectId(branch.adminUserIds[0]) : null,
        };
        if (branch.id) Object.assign(existing.get(branch.id) as object, values);
        else business.branches.push(values);
    });
    await business.save();

    const tenant = { businessId: String(business._id), businessIsLegacy: false };
    const settings = await getAppSettingsForTenant(tenant);
    if (effectiveBusinessTypeId(settings) !== input.businessTypeId) {
        if (!settings.businessId) settings.businessId = business._id as mongoose.Types.ObjectId;
        settings.businessTypeId = input.businessTypeId;
        settings.restaurantEnabled = Boolean(type?.restaurantEnabled);
        await settings.save();
        invalidateAppSettingsCache(tenant);
    }
    return res.json(await serializeClient(business));
};
