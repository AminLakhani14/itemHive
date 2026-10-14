import { Response } from 'express';
import User from '../models/User';
import Business from '../models/Business';
import AppSetting from '../models/AppSetting';
import Employee from '../models/Employee';
import type { AuthRequest } from '../middleware/auth';
import { ensureDeleteAllowed, ensureManageableTarget, normalizeRole, serializeUser } from '../utils/accessControl';
import { isAdminScreenPermission } from '../utils/screenPermissions';
import { getAppSettingsForTenant, invalidateAppSettingsCache } from '../utils/tenancy';
import { effectiveBusinessTypeId, getBusinessTypeCatalog } from '../utils/businessTypes';
import { buildTeamUsersPipeline } from '../utils/teamUsers';

const isMonthlyPaymentOverdue = (settings: any, now = new Date()) => {
    if (!settings?.monthlyPaymentTrackingEnabled) return false;
    const referenceDate = settings.monthlyPaymentPaidAt || settings.monthlyPaymentTrackingStartedAt;
    if (!referenceDate) return false;
    const dueDate = new Date(referenceDate);
    dueDate.setMonth(dueDate.getMonth() + 1);
    return dueDate <= now;
};

const serializeUsersWithBusinessNames = async (users: any[]) => {
    const businessIds = [...new Set(users.map((user) => String(user.businessId || '')).filter(Boolean))];
    const [businesses, businessSettings, linkedEmployees] = await Promise.all([
        Business.find({ _id: { $in: businessIds } }).select('name isLegacy'),
        AppSetting.find({
            $or: [
                { businessId: { $in: businessIds } },
                { key: { $in: businessIds.map((businessId) => `business:${businessId}`) } },
                { key: 'global' },
            ],
        }).select('key businessId businessTypeId restaurantEnabled monthlyPaymentTrackingEnabled monthlyPaymentPaidAt monthlyPaymentTrackingStartedAt'),
        Employee.find({ userId: { $in: users.map((user) => user._id) } }).select('_id userId').lean(),
    ]);
    const employeeIdByUserId = new Map(linkedEmployees.map((employee) => [String(employee.userId), String(employee._id)]));
    const businessNameById = new Map(businesses.map((business) => [String(business._id), business.name]));
    const restaurantEnabledByBusinessId = new Map<string, boolean>();
    const businessTypeByBusinessId = new Map<string, string>();
    const legacyBusinessId = String(businesses.find((business) => business.isLegacy)?._id || '');
    const monthlyPaymentByBusinessId = new Map<string, { enabled: boolean; paidAt?: string; trackingStartedAt?: string; overdue: boolean }>();

    // Old legacy data may contain both a global settings record and the newer
    // business:<id> record. Read the global/legacy value first, then always
    // let the tenant-specific record win—the same precedence POS uses.
    const applyRestaurantSetting = (setting: any) => {
        const settingBusinessId = String(setting.key || '').startsWith('business:')
            ? String(setting.key).slice('business:'.length)
            : setting.key === 'global' ? legacyBusinessId : String(setting.businessId || '');
        if (settingBusinessId) {
            restaurantEnabledByBusinessId.set(settingBusinessId, Boolean(setting.restaurantEnabled));
            businessTypeByBusinessId.set(settingBusinessId, effectiveBusinessTypeId(setting));
            monthlyPaymentByBusinessId.set(settingBusinessId, {
                enabled: Boolean(setting.monthlyPaymentTrackingEnabled),
                paidAt: setting.monthlyPaymentPaidAt ? new Date(setting.monthlyPaymentPaidAt).toISOString() : undefined,
                trackingStartedAt: setting.monthlyPaymentTrackingStartedAt ? new Date(setting.monthlyPaymentTrackingStartedAt).toISOString() : undefined,
                overdue: isMonthlyPaymentOverdue(setting),
            });
        }
    };
    businessSettings.filter((setting) => !String(setting.key || '').startsWith('business:')).forEach(applyRestaurantSetting);
    businessSettings.filter((setting) => String(setting.key || '').startsWith('business:')).forEach(applyRestaurantSetting);

    return users.map((user) => ({
        ...serializeUser(user),
        businessName: businessNameById.get(String(user.businessId || '')) || '',
        restaurantEnabled: restaurantEnabledByBusinessId.get(String(user.businessId || '')) || false,
        businessTypeId: businessTypeByBusinessId.get(String(user.businessId || '')) || '',
        monthlyPayment: monthlyPaymentByBusinessId.get(String(user.businessId || '')) || { enabled: false, overdue: false },
        employeeId: employeeIdByUserId.get(String(user._id)) || null,
    }));
};

export const getUsers = async (req: AuthRequest, res: Response) => {
    try {
        const search = String(req.query.search || '').trim();
        const account = String(req.query.account || '').trim();
        const business = String(req.query.business || '').trim();
        const role = String(req.query.role || '').trim();
        const userLimit = String(req.query.userLimit ?? '').trim();
        const businessSort = String(req.query.businessSort || 'asc');
        if (role && !['super_admin', 'admin', 'user'].includes(role)) return res.status(400).json({ message: 'Invalid role filter.' });
        if (userLimit && userLimit !== '-' && (!/^\d+$/.test(userLimit) || !Number.isSafeInteger(Number(userLimit)))) return res.status(400).json({ message: 'User limit must be a non-negative integer or -.' });
        if (!['asc', 'desc'].includes(businessSort)) return res.status(400).json({ message: 'Invalid business sort direction.' });
        const requestedPage = Number(req.query.page || 1);
        const requestedLimit = Number(req.query.limit || 20);
        const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
        const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 20;
        const paginated = Boolean(req.query.page || req.query.limit || search || account || business || role || userLimit);
        const pipeline = buildTeamUsersPipeline({
            actorId: req.user?.id || '', actorRole: req.user?.role || 'user',
            search, account, business, role, userLimit, businessSort,
        });

        if (!paginated) {
            const users = await User.aggregate(pipeline);
            return res.json(await serializeUsersWithBusinessNames(users));
        }

        const [result] = await User.aggregate([...pipeline, {
            $facet: {
                users: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                count: [{ $count: 'total' }],
            },
        }]);
        const users = result?.users || [];
        const total = result?.count?.[0]?.total || 0;

        return res.json({
            users: await serializeUsersWithBusinessNames(users),
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to fetch users' });
    }
};

export const updateUserStatus = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isRestaurantModeUpdate = typeof req.body.restaurantEnabled === 'boolean' || typeof req.body.businessTypeId === 'string';
        // Restaurant mode belongs to a workspace. A super admin must be able
        // to configure it for the legacy workspace as well.
        if (!isRestaurantModeUpdate || Object.keys(req.body).some((key) => !['restaurantEnabled', 'businessTypeId'].includes(key))) {
            ensureManageableTarget(user.role);
        }

        if (typeof req.body.isActive === 'boolean') {
            user.isActive = req.body.isActive;
        }

        if (typeof req.body.isVisible === 'boolean') {
            user.isVisible = req.body.isVisible;
        }

        if (typeof req.body.installmentAccess === 'boolean') {
            if (!['admin', 'user'].includes(normalizeRole(user.role))) {
                return res.status(400).json({ message: 'Installment access can only be assigned to admin or user accounts' });
            }
            user.installmentAccess = req.body.installmentAccess;
        }

        if (typeof req.body.discountAccess === 'boolean') {
            if (normalizeRole(user.role) !== 'admin') {
                return res.status(400).json({ message: 'Discount access can only be assigned to admin accounts' });
            }
            user.discountAccess = req.body.discountAccess;
        }

        if (['none', 'menu', 'pos'].includes(req.body.digitalMenuAccess)) {
            if (!['admin', 'user'].includes(normalizeRole(user.role))) {
                return res.status(400).json({ message: 'Digital Menu access can only be assigned to admin or user accounts' });
            }
            user.digitalMenuAccess = req.body.digitalMenuAccess;
        }

        if (isRestaurantModeUpdate) {
            if (!['admin', 'super_admin'].includes(normalizeRole(user.role)) || !user.businessId) {
                return res.status(400).json({ message: 'Business type can only be assigned through an admin workspace account' });
            }

            // Use the same tenant-settings lookup that POS uses. In particular,
            // this migrates a legacy workspace's old global settings document to
            // its business key before updating it, so the Team grid and POS read
            // back the same value immediately.
            const business = await Business.findById(user.businessId).select('isLegacy');
            if (!business) {
                return res.status(400).json({ message: 'The account workspace could not be found' });
            }

            const tenant = {
                businessId: String(user.businessId),
                businessIsLegacy: Boolean(business.isLegacy),
            };
            const appSettings = await getAppSettingsForTenant(tenant);
            // Some older tenant records have the business key but no businessId.
            // Backfill it so Team Management reads the same setting that POS uses.
            if (!appSettings.businessId || String(appSettings.businessId) !== tenant.businessId) {
                appSettings.businessId = user.businessId;
            }
            const typeId = typeof req.body.businessTypeId === 'string' ? req.body.businessTypeId : req.body.restaurantEnabled ? 'restaurant' : '';
            const catalog = await getBusinessTypeCatalog();
            const selectedType = catalog.types.find((type) => type.id === typeId);
            if (typeId && !selectedType) return res.status(400).json({ message: 'Business type not found. Refresh and choose an available type.' });
            appSettings.businessTypeId = typeId;
            appSettings.restaurantEnabled = Boolean(selectedType?.restaurantEnabled);
            await appSettings.save();
            invalidateAppSettingsCache(tenant);
        }

        await user.save();

        return res.json({
            message: 'User status updated successfully',
            user: serializeUser(user),
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update user status' });
    }
};

export const updateMonthlyPayment = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || !user.businessId || !['admin', 'super_admin'].includes(normalizeRole(user.role))) {
            return res.status(400).json({ message: 'Monthly payment can only be managed for an admin workspace' });
        }
        const business = await Business.findById(user.businessId).select('isLegacy');
        if (!business) return res.status(400).json({ message: 'The account workspace could not be found' });

        const tenant = { businessId: String(user.businessId), businessIsLegacy: Boolean(business.isLegacy) };
        const settings = await getAppSettingsForTenant(tenant);
        const enabled = Boolean(req.body.enabled);
        const paid = enabled && Boolean(req.body.paid);
        settings.monthlyPaymentTrackingEnabled = enabled;
        settings.monthlyPaymentTrackingStartedAt = enabled
            ? (settings.monthlyPaymentTrackingStartedAt || new Date())
            : undefined;
        settings.monthlyPaymentPaidAt = paid
            ? new Date(req.body.paidAt || new Date())
            : undefined;
        await settings.save();
        invalidateAppSettingsCache(tenant);
        return res.json({ message: 'Monthly payment updated successfully' });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update monthly payment' });
    }
};

export const getMonthlyPaymentAlerts = async (_req: AuthRequest, res: Response) => {
    try {
        const settings = await AppSetting.find({ monthlyPaymentTrackingEnabled: true })
            .select('businessId key monthlyPaymentPaidAt monthlyPaymentTrackingStartedAt');
        const businessIds = settings.flatMap((setting) => setting.businessId ? [setting.businessId] : []);
        const businesses = await Business.find({ _id: { $in: businessIds } }).select('name');
        const businessNames = new Map(businesses.map((business) => [String(business._id), business.name]));
        return res.json(settings.filter((setting) => isMonthlyPaymentOverdue(setting)).map((setting) => ({
            businessId: String(setting.businessId || ''),
            businessName: businessNames.get(String(setting.businessId || '')) || 'Workspace',
            paidAt: setting.monthlyPaymentPaidAt || null,
        })));
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to load monthly payment alerts' });
    }
};

export const getBusinesses = async (_req: AuthRequest, res: Response) => {
    try {
        const businesses = await Business.find({ isActive: true })
            .select('name slug isLegacy createdAt')
            .sort({ isLegacy: -1, name: 1 });

        const userCounts = await User.aggregate([
            { $match: { businessId: { $in: businesses.map((business) => business._id) } } },
            { $group: { _id: '$businessId', count: { $sum: 1 } } },
        ]);
        const userCountByBusiness = new Map(userCounts.map((entry) => [String(entry._id), entry.count]));

        return res.json(businesses.map((business) => ({
            id: String(business._id),
            name: business.name,
            slug: business.slug,
            isLegacy: business.isLegacy,
            userCount: userCountByBusiness.get(String(business._id)) || 0,
        })));
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to fetch businesses' });
    }
};

export const updateBusiness = async (req: AuthRequest, res: Response) => {
    try {
        const business = await Business.findById(req.params.id);

        if (!business) {
            return res.status(404).json({ message: 'Business not found' });
        }
        if (business.isLegacy) {
            return res.status(400).json({ message: 'The default business cannot be renamed' });
        }

        business.name = String(req.body.name || '').trim();
        await business.save();

        return res.json({
            message: 'Business updated successfully',
            business: {
                id: String(business._id),
                name: business.name,
                slug: business.slug,
                isLegacy: business.isLegacy,
            },
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update business' });
    }
};

export const deleteBusiness = async (req: AuthRequest, res: Response) => {
    try {
        const business = await Business.findById(req.params.id);

        if (!business) {
            return res.status(404).json({ message: 'Business not found' });
        }
        if (business.isLegacy) {
            return res.status(400).json({ message: 'The default business cannot be deleted' });
        }

        const superAdminExists = await User.exists({ businessId: business._id, role: 'super_admin' });
        if (superAdminExists) {
            return res.status(400).json({ message: 'A business with a super admin account cannot be deleted' });
        }

        const deletedUsers = await User.deleteMany({ businessId: business._id });
        await business.deleteOne();

        return res.json({
            message: 'Business and its related users deleted successfully',
            deletedUsers: deletedUsers.deletedCount,
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to delete business' });
    }
};

export const updateUserAccount = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.params.id).select('+password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        ensureManageableTarget(user.role);

        const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
        const duplicateEmail = await User.exists({ email: normalizedEmail, _id: { $ne: user._id } });
        if (duplicateEmail) {
            return res.status(400).json({ message: 'Email address is already assigned to another account' });
        }

        user.name = String(req.body.name || '').trim();
        user.email = normalizedEmail;
        if (typeof req.body.businessId === 'string') {
            const businessId = String(req.body.businessId || '').trim();
            if (businessId) {
                const business = await Business.findById(businessId);
                if (!business || !business.isActive) {
                    return res.status(400).json({ message: 'Selected business was not found or is inactive' });
                }
                user.businessId = business._id;
            }
        }
        if (req.body.role) {
            user.role = normalizeRole(req.body.role);
        }
        if (req.body.password) {
            user.password = String(req.body.password);
            user.visiblePassword = String(req.body.password);
        }
        await user.save();

        // The account and its employee profile are the same person; a move to another business
        // detaches the old profile, and the new business gets one on its next Employees load.
        await Employee.updateOne({ userId: user._id, businessId: { $ne: user.businessId } }, { $set: { userId: null } });
        await Employee.updateOne({ userId: user._id }, { $set: { fullName: user.name } });

        return res.json({
            message: 'Account details updated successfully',
            user: serializeUser(user),
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update account details' });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        ensureDeleteAllowed(req.user, user);

        await user.deleteOne();
        // Only the login goes; the employee profile and attendance history stay.
        await Employee.updateOne({ userId: user._id }, { $set: { userId: null } });

        return res.json({ message: 'User deleted successfully' });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to delete user' });
    }
};

export const updateUserCreationLimit = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        ensureManageableTarget(user.role);

        if (normalizeRole(user.role) !== 'admin') {
            return res.status(400).json({ message: 'User creation limits can only be assigned to admin accounts' });
        }

        user.userCreationLimit = Math.max(0, Number(req.body.userCreationLimit || 0));
        await user.save();

        return res.json({
            message: 'Admin user limit updated successfully',
            user: serializeUser(user),
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update admin limit' });
    }
};

export const getAdminPermissionAssignments = async (_req: AuthRequest, res: Response) => {
    try {
        const admins = await User.find({ role: { $in: ['admin', 'user'] } })
            .select('name email role isActive businessId screenPermissions')
            .sort({ name: 1, email: 1 });

        return res.json(await serializeUsersWithBusinessNames(admins));
    } catch (error: any) {
        return res.status(500).json({ message: error.message || 'Failed to load admin permission assignments' });
    }
};

export const updateAdminScreenPermissions = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'Admin user not found' });
        }
        if (normalizeRole(user.role) === 'super_admin') {
            return res.status(400).json({ message: 'Super Admin access cannot be restricted' });
        }

        const screenPermissions = Array.from(new Set(req.body.screenPermissions))
            .filter(isAdminScreenPermission)
            .filter(key => normalizeRole(user.role) === 'admin' || key.startsWith('self_') || key === 'finance_expense_create');
        user.screenPermissions = screenPermissions;
        await user.save();

        return res.json({
            message: 'Admin screen permissions updated successfully',
            user: serializeUser(user),
        });
    } catch (error: any) {
        return res.status(400).json({ message: error.message || 'Failed to update screen permissions' });
    }
};
