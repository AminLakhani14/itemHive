import mongoose from 'mongoose';
import Employee, { type IEmployee } from '../models/Employee';
import User from '../models/User';
import { acrossBranches } from './branchScope';

/** Team accounts with these roles are staff and always have an employee profile. */
const STAFF_ROLES = ['user', 'cashier'];

type ObjectIdLike = mongoose.Types.ObjectId | string;

export const isDuplicateKeyError = (error: unknown, field: string) => {
    const mongoError = error as { code?: number; keyPattern?: Record<string, unknown> };
    return mongoError?.code === 11000 && Boolean(mongoError.keyPattern?.[field]);
};

// Codes are unique across the business, so every branch's employees are counted.
const nextEmployeeCode = async (businessId: ObjectIdLike) => {
    const employees = await acrossBranches(() => Employee.find({ businessId }).select('employeeCode').lean().exec());
    const highest = employees.reduce((max, employee) => {
        const number = Number(/^EMP-(\d+)$/.exec(employee.employeeCode)?.[1]);
        return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0);
    return `EMP-${String(highest + 1).padStart(4, '0')}`;
};

/** Creates an employee with the next EMP-#### code, retrying if a concurrent create took the same code. */
export const createEmployeeRecord = async (data: Partial<IEmployee> & { businessId: ObjectIdLike }) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await Employee.create({ ...data, employeeCode: await nextEmployeeCode(data.businessId) });
        } catch (error: unknown) {
            if (!isDuplicateKeyError(error, 'employeeCode')) throw error;
        }
    }
    throw new Error('Could not assign an employee code. Please try again.');
};

interface StaffAccount {
    _id: mongoose.Types.ObjectId;
    name: string;
    email: string;
    businessId?: mongoose.Types.ObjectId | null;
    branchId?: mongoose.Types.ObjectId | null;
}

/** Gives a Team login its employee profile. Safe to call twice: the second call finds the link and does nothing. */
export const createEmployeeForAccount = async (account: StaffAccount) => {
    if (!account.businessId) return null;
    try {
        return await createEmployeeRecord({
            fullName: account.name,
            email: account.email,
            userId: account._id,
            businessId: account.businessId,
            // The profile is kept in the login's branch; without one, in the branch of the request.
            ...(account.branchId ? { branchId: account.branchId } : {}),
        });
    } catch (error: unknown) {
        if (isDuplicateKeyError(error, 'userId')) return null;
        throw error;
    }
};

/** Backfills profiles for staff logins created before accounts and employees were linked, or moved between businesses. */
export const syncStaffEmployees = async (businessId?: ObjectIdLike) => {
    const accounts = await User.find({
        role: { $in: STAFF_ROLES },
        businessId: businessId ? new mongoose.Types.ObjectId(String(businessId)) : { $ne: null },
    }).select('_id name email businessId branchId').lean<StaffAccount[]>();
    if (accounts.length === 0) return 0;

    const linked = await acrossBranches(() => Employee.find({ userId: { $in: accounts.map((account) => account._id) } }).select('userId').lean().exec());
    const linkedIds = new Set(linked.map((employee) => String(employee.userId)));
    const missing = accounts.filter((account) => !linkedIds.has(String(account._id)));
    for (const account of missing) await createEmployeeForAccount(account);
    return missing.length;
};

export const isStaffRole = (role?: string | null) => STAFF_ROLES.includes(String(role || '').toLowerCase());
