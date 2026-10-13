import type { IUser } from '../models/User';

export const USER_ROLES = ['super_admin', 'admin', 'user'] as const;
export type UserRole = typeof USER_ROLES[number];

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
    cashier: 'user',
    user: 'user',
    admin: 'admin',
    super_admin: 'super_admin',
};

export const SUPER_ADMIN_EMAILS = ['admin@itemhive.com', 'admin@itemhive.pro'];

export const normalizeRole = (role?: string | null): UserRole => {
    if (!role) {
        return 'user';
    }

    const normalized = LEGACY_ROLE_MAP[String(role).toLowerCase()];
    return normalized || 'user';
};

export const isSuperAdminEmail = (email?: string | null) =>
    Boolean(email && SUPER_ADMIN_EMAILS.includes(String(email).trim().toLowerCase()));

export const hasExplicitScreenPermission = (user: {
    role?: string;
    screenPermissions?: readonly string[] | null;
} | null | undefined, permission: string) =>
    normalizeRole(user?.role) === 'admin' && Boolean(user?.screenPermissions?.includes(permission));

export const getDigitalMenuAccess = (user: {
    role?: string;
    digitalMenuAccess?: 'none' | 'menu' | 'pos';
    screenPermissions?: readonly string[] | null;
}): 'none' | 'menu' | 'pos' => {
    const role = normalizeRole(user.role);
    if (role === 'super_admin') return 'pos';
    // A Super Admin's explicit grant takes priority over secondary access flags.
    if (role === 'admin' && user.screenPermissions != null) {
        if (!user.screenPermissions.includes('digital_menus')) return 'none';
        return 'pos';
    }
    return user.digitalMenuAccess || 'none';
};

export const serializeUser = (user: IUser) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    preferences: user.preferences,
    photoUrl: user.avatar,
    appearance: user.appearance,
    isActive: user.isActive,
    isVisible: user.isVisible,
    installmentAccess: normalizeRole(user.role) === 'super_admin' || hasExplicitScreenPermission(user, 'installments') || Boolean(user.installmentAccess),
    discountAccess: normalizeRole(user.role) === 'super_admin' || hasExplicitScreenPermission(user, 'settings') || Boolean(user.discountAccess),
    digitalMenuAccess: getDigitalMenuAccess(user),
    screenPermissions: user.screenPermissions == null ? null : [...user.screenPermissions],
    userCreationLimit: user.userCreationLimit ?? 0,
    businessId: user.businessId ? String(user.businessId) : '',
    createdBy: user.createdBy ? String(user.createdBy) : '',
    visiblePassword: user.visiblePassword || '',
});

export const canManageUsers = (role?: string | null) => {
    const normalizedRole = normalizeRole(role);
    return normalizedRole === 'super_admin' || normalizedRole === 'admin';
};

export const ensureManageableTarget = (role: string) => {
    const normalizedRole = normalizeRole(role);

    if (normalizedRole === 'super_admin') {
        throw new Error('Super admin accounts cannot be changed from this endpoint');
    }
};

export const ensureDeleteAllowed = (actor: { id?: string; role?: string } | undefined, target: { _id: unknown; role: string; createdBy?: unknown }) => {
    ensureManageableTarget(target.role);

    if (String(target._id) === actor?.id) {
        throw new Error('You cannot delete your own account');
    }

    if (normalizeRole(actor?.role) === 'super_admin') {
        return;
    }

    if (normalizeRole(actor?.role) === 'admin') {
        const isOwnUser = normalizeRole(target.role) === 'user' && String(target.createdBy || '') === actor?.id;
        if (isOwnUser) {
            return;
        }
    }

    throw new Error('You are not allowed to delete this account');
};
