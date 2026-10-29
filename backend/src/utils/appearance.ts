import User, { type IUser } from '../models/User';
import Employee from '../models/Employee';
import { normalizeRole, serializeUser } from './accessControl';

/**
 * Team users (role User) wear their business's branding: the theme of the admin who created them,
 * or, when the creator belongs to another business (a super admin setting up a client), that
 * business's first admin. Admins and super admins keep their own theme.
 */
export const resolveThemeOwner = async (user: IUser) => {
    if (normalizeRole(user.role) !== 'user' || !user.businessId) return null;

    const owners = { businessId: user.businessId, role: { $in: ['admin', 'super_admin'] } };
    if (user.createdBy) {
        const creator = await User.findOne({ _id: user.createdBy, ...owners }).select('appearance');
        if (creator) return creator;
    }
    return User.findOne(owners).sort({ createdAt: 1 }).select('appearance');
};

/** serializeUser, with the theme the account actually sees. */
export const serializeUserWithTheme = async (user: IUser, businessId = String(user.businessId || '')) => {
    const owner = await resolveThemeOwner(user);
    const employee = businessId ? await Employee.findOne({ businessId, userId: user._id }).select('_id').lean() : null;
    return {
        ...serializeUser(user),
        employeeId: employee ? String(employee._id) : null,
        appearance: owner ? owner.appearance : user.appearance,
        themeManaged: Boolean(owner),
    };
};
