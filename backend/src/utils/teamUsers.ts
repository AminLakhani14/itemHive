import mongoose, { type PipelineStage } from 'mongoose';
import Business from '../models/Business';
import { normalizeRole } from './accessControl';

export interface TeamUserFilters {
    actorId: string;
    actorRole: string;
    id?: string;
    search?: string;
    account?: string;
    business?: string;
    role?: string;
    userLimit?: string;
    businessSort?: string;
}

const literalPattern = (value: string) => ({
    $regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i',
});

// Filter and sort the full result set before paging, so each business stays together.
export const buildTeamUsersPipeline = (filters: TeamUserFilters): PipelineStage[] => {
    const conditions: Record<string, unknown>[] = [];
    if (normalizeRole(filters.actorRole) !== 'super_admin') {
        conditions.push({ createdBy: new mongoose.Types.ObjectId(filters.actorId), role: 'user' });
    }
    if (filters.id) conditions.push({ _id: new mongoose.Types.ObjectId(filters.id) });
    if (filters.search) conditions.push({ $or: ['name', 'email', 'role'].map((key) => ({ [key]: literalPattern(filters.search!) })) });
    if (filters.account) conditions.push({ $or: ['name', 'email'].map((key) => ({ [key]: literalPattern(filters.account!) })) });
    if (filters.role) conditions.push({ role: filters.role === 'user' ? { $in: ['user', 'cashier'] } : filters.role });
    if (filters.userLimit === '-') conditions.push({ role: { $ne: 'admin' } });
    else if (filters.userLimit) conditions.push({ role: 'admin', $expr: { $eq: [{ $ifNull: ['$userCreationLimit', 0] }, Number(filters.userLimit)] } });

    const pipeline: PipelineStage[] = [
        { $match: conditions.length ? { $and: conditions } : {} },
        { $lookup: { from: Business.collection.name, localField: 'businessId', foreignField: '_id', as: '_teamBusiness', pipeline: [{ $project: { name: 1 } }] } },
    ];
    if (filters.business) pipeline.push({ $match: { '_teamBusiness.name': literalPattern(filters.business) } });
    pipeline.push(
        { $addFields: {
            _teamBusinessNameSort: { $toLower: { $ifNull: [{ $arrayElemAt: ['$_teamBusiness.name', 0] }, ''] } },
            _teamAccountNameSort: { $toLower: { $ifNull: ['$name', ''] } },
        } },
        { $sort: { _teamBusinessNameSort: filters.businessSort === 'desc' ? -1 : 1, businessId: 1, _teamAccountNameSort: 1, _id: 1 } },
        // Aggregation bypasses select:false. Only expose the fields Team already uses.
        { $project: {
            name: 1, email: 1, role: 1, isActive: 1, isVisible: 1, installmentAccess: 1,
            discountAccess: 1, digitalMenuAccess: 1, screenPermissions: 1, screenPermissionsVersion: 1, userCreationLimit: 1,
            createdBy: 1, businessId: 1, branchId: 1, preferences: 1, location: 1, avatar: 1, visiblePassword: 1,
        } },
    );
    return pipeline;
};
