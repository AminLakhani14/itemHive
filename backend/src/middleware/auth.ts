import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Business from '../models/Business';
import { getDigitalMenuAccess, hasExplicitScreenPermission, normalizeRole } from '../utils/accessControl';
import { ensureUserBusiness, getCachedAppSettingsForTenant } from '../utils/tenancy';
import type { AdminScreenPermission } from '../utils/screenPermissions';
import { buildBranchScope, resolveBranchAccess, runInBranchScope, type BranchScope } from '../utils/branchScope';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: string;
        email: string;
        name: string;
        isActive: boolean;
        isVisible: boolean;
        installmentAccess: boolean;
        discountAccess: boolean;
        digitalMenuAccess: 'none' | 'menu' | 'pos';
        screenPermissions: AdminScreenPermission[] | null;
        screenPermissionsVersion?: number;
        userCreationLimit: number;
        businessId: string;
        businessName: string;
        businessIsLegacy: boolean;
        /** Active branch; empty when the business has no branches. */
        branchId: string;
        /** The business's first branch, which also owns records saved without a branch. */
        mainBranchId: string;
        /** Branches this login may switch between. */
        branchIds: string[];
        /** 'all' is a read-only view of every allowed branch, used by Dashboard and Reports. */
        branchScope: 'none' | 'branch' | 'all';
    };
    branchScopeContext?: BranchScope;
}

const resolveToken = (req: AuthRequest) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    return token;
};

const resolveSuperAdminWorkspace = async (req: AuthRequest, fallbackBusiness: any, role: string) => {
    if (normalizeRole(role) !== 'super_admin') {
        return fallbackBusiness;
    }

    const workspaceId = String(req.headers['x-itemhive-workspace-id'] || '').trim();
    if (!workspaceId) {
        return fallbackBusiness;
    }

    if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
        return fallbackBusiness;
    }

    const selectedBusiness = await Business.findById(workspaceId);
    if (!selectedBusiness || !selectedBusiness.isActive) {
        return fallbackBusiness;
    }

    return selectedBusiness;
};

const attachUserFromToken = async (req: AuthRequest) => {
    const token = resolveToken(req);

    if (!token) {
        return false;
    }

    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.id).select('name email role isActive isVisible installmentAccess discountAccess digitalMenuAccess screenPermissions screenPermissionsVersion userCreationLimit businessId branchId');

    if (!user) {
        throw new Error('Not authorized, user not found');
    }

    const normalizedRole = normalizeRole(user.role);
    const defaultBusiness = await ensureUserBusiness(user);
    const business = await resolveSuperAdminWorkspace(req, defaultBusiness, normalizedRole);
    if (!business.isActive) {
        throw new Error('Business workspace is inactive');
    }

    const branchAccess = resolveBranchAccess(business, { id: String(user._id), role: normalizedRole, branchId: user.branchId }, String(req.headers['x-itemhive-branch-id'] || '').trim());
    // Viewing every branch at once is read-only, so it is only honoured for GET requests.
    const allBranches = Boolean(branchAccess && branchAccess.branchIds.length > 1 && req.method === 'GET' && req.query?.branchScope === 'all');
    req.branchScopeContext = branchAccess ? buildBranchScope(branchAccess, allBranches) : undefined;

    req.user = {
        id: String(user._id),
        role: normalizedRole,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
        isVisible: user.isVisible,
        installmentAccess: normalizedRole === 'super_admin' || hasExplicitScreenPermission(user, 'installments') || Boolean(user.installmentAccess),
        discountAccess: normalizedRole === 'super_admin' || hasExplicitScreenPermission(user, 'settings') || Boolean(user.discountAccess),
        digitalMenuAccess: getDigitalMenuAccess(user),
        screenPermissions: user.screenPermissions == null ? null : [...user.screenPermissions],
        screenPermissionsVersion: user.screenPermissionsVersion ?? 1,
        userCreationLimit: user.userCreationLimit ?? 0,
        businessId: String(business._id),
        businessName: business.name,
        businessIsLegacy: business.isLegacy,
        branchId: branchAccess?.activeBranchId || '',
        mainBranchId: branchAccess?.mainBranchId || '',
        branchIds: branchAccess?.branchIds || [],
        branchScope: !branchAccess ? 'none' : allBranches ? 'all' : 'branch',
    };

    return true;
};

// The rest of the request reads and writes only the active branch's records.
const continueInBranch = (req: AuthRequest, next: NextFunction) =>
    req.branchScopeContext ? runInBranchScope(req.branchScopeContext, () => next()) : next();

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = resolveToken(req);

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        await attachUserFromToken(req);

        if (!req.user?.isActive) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact the super admin.' });
        }

        continueInBranch(req, next);
    } catch (error) {
        return res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

export const optionalProtect = async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
        await attachUserFromToken(req);
    } catch {
        req.user = undefined;
        req.branchScopeContext = undefined;
    }

    continueInBranch(req, next);
};

export const authorize = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Role ${req.user?.role} is not authorized` });
        }
        next();
    };
};

export const requireInstallmentAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role === 'super_admin' || hasExplicitScreenPermission(req.user, 'installments')) {
        next();
        return;
    }

    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const appSettings = await getCachedAppSettingsForTenant(req.user);
    if (!appSettings?.installmentsEnabled || !req.user?.installmentAccess) {
        return res.status(403).json({ message: 'Installment access has not been enabled for this account' });
    }

    next();
};

export const requireScreenAccess = (...permissions: AdminScreenPermission[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, no token' });
        }

        if (req.user.role !== 'admin' || req.user.screenPermissions == null) {
            next();
            return;
        }

        if (!permissions.some((permission) => req.user?.screenPermissions?.includes(permission)
            || (['expenses', 'my_payroll'].includes(permission) && (req.user?.screenPermissionsVersion ?? 1) < 2)
            || (permission === 'organization' && (req.user?.screenPermissionsVersion ?? 1) < 3))) {
            return res.status(403).json({ message: 'You do not have permission to access this screen' });
        }

        next();
    };
};
