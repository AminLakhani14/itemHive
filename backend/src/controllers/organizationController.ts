import type { Response } from 'express';
import mongoose from 'mongoose';
import Joi from 'joi';
import Business from '../models/Business';
import Employee from '../models/Employee';
import User from '../models/User';
import type { AuthRequest } from '../middleware/auth';
import { buildTenantFilter, getAppSettingsForTenant } from '../utils/tenancy';
import { BranchLocationError, branchAdminIds, branchDetailsSchema, resolveBranchPlaces, serializeBranch } from '../utils/branches';
import { acrossBranches } from '../utils/branchScope';
import { adoptUnbranchedRecords } from '../utils/branchData';

const objectId = Joi.string().hex().length(24);
const dateKey = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

export const departmentSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    description: Joi.string().trim().allow('').max(500).default(''),
    isActive: Joi.boolean().strict().default(true),
});

export const fiscalYearSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    startDate: dateKey.required(),
    endDate: dateKey.required(),
    isCurrent: Joi.boolean().strict().default(false),
}).custom((value, helpers) => value.startDate <= value.endDate ? value : helpers.error('any.invalid'));

export const branchAdministratorsSchema = Joi.object({
    adminUserIds: Joi.array().max(50).items(objectId.required()).unique().required(),
});

export const branchEmployeesSchema = Joi.object({
    employeeIds: Joi.array().max(5000).items(objectId.required()).unique().required(),
});

export const branchAdminSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    email: Joi.string().trim().lowercase().email().max(254).required(),
    password: Joi.string().min(8).max(128).required(),
});

const validate = (schema: Joi.ObjectSchema, value: unknown) => schema.validate(value, {
    abortEarly: false,
    stripUnknown: true,
});

const validationError = (res: Response, error: Joi.ValidationError) => res.status(400).json({
    message: error.details.map((detail) => detail.type === 'any.invalid'
        ? 'The fiscal year end date must be on or after its start date.'
        : detail.message).join(', '),
});

// Businesses from public signup, signup approval or Team never went through client onboarding, so
// they have no branch. Their single location becomes the main branch, which their staff already work in.
const ensureMainBranch = async (req: AuthRequest, business: any) => {
    if (business.branches?.length) return business;
    const [settings, admin] = await Promise.all([
        getAppSettingsForTenant(req.user!),
        User.findOne({ businessId: business._id, role: 'admin', 'location.city': { $nin: [null, ''] } }).select('location').lean(),
    ]);
    const branch = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Main Branch',
        location: settings.shopAddress || '',
        phone: (settings.shopPhone || business.clientContact?.phone || '').slice(0, 25),
        city: admin?.location?.city || '',
        countryCode: admin?.location?.countryCode || '',
        country: admin?.location?.country || '',
        adminUserId: null,
        adminUserIds: [],
    };
    // The empty-branches condition makes concurrent first visits create one main branch only.
    const created = await Business.updateOne(
        { _id: business._id, $or: [{ branches: { $size: 0 } }, { branches: { $exists: false } }] },
        { $push: { branches: branch } },
    );
    if (created.modifiedCount) await adoptUnbranchedRecords(business._id, branch._id);
    return Business.findById(business._id);
};

const loadBusiness = async (req: AuthRequest) => {
    const business = await Business.findById(req.user!.businessId);
    return business && ensureMainBranch(req, business);
};

const actorBranchIds = (business: any, actorId: string) => business.branches
    .filter((branch: any) => branchAdminIds(branch).includes(actorId))
    .map((branch: any) => String(branch._id));

const visibleBranchIds = (req: AuthRequest, business: any) => {
    if (req.user!.role === 'super_admin') return business.branches.map((branch: any) => String(branch._id));
    const assigned = actorBranchIds(business, req.user!.id);
    return assigned.length ? assigned : business.branches.map((branch: any) => String(branch._id));
};

const findVisibleBranch = (req: AuthRequest, business: any, branchId: string) => {
    if (!mongoose.Types.ObjectId.isValid(branchId) || !visibleBranchIds(req, business).includes(branchId)) return null;
    return business.branches.id(branchId);
};

// The branches this login can switch between in the top bar. Any signed-in account may ask.
export const getMyBranches = async (req: AuthRequest, res: Response) => {
    const business = await Business.findById(req.user!.businessId).select('branches').lean();
    const allowed = new Set(req.user!.branchIds);
    return res.json({
        activeBranchId: req.user!.branchId || null,
        canViewAll: allowed.size > 1,
        // Printed documents name the branch only when the business has more than one.
        businessBranchCount: business?.branches?.length || 0,
        branches: (business?.branches || []).filter((branch: any) => allowed.has(String(branch._id))).map((branch: any) => ({
            id: String(branch._id), name: branch.name, location: branch.location, phone: branch.phone, city: branch.city, country: branch.country,
        })),
    });
};

export const getOrganizationOverview = async (req: AuthRequest, res: Response) => {
    const business = await loadBusiness(req);
    if (!business) return res.status(404).json({ message: 'Business workspace not found.' });
    const branchIds = visibleBranchIds(req, business);
    const branches = business.branches.filter((branch: any) => branchIds.includes(String(branch._id)));
    const [admins, employees] = await Promise.all([
        User.find({ _id: { $in: branches.flatMap(branchAdminIds) }, businessId: business._id, role: 'admin', isActive: true }).select('name email').lean(),
        acrossBranches(() => Employee.find({ ...buildTenantFilter(req.user!), $or: [{ branchId: { $in: branchIds } }, { branchId: null }, { branchId: { $exists: false } }] })
            .select('employeeCode fullName designation department departmentId status branchId joiningDate').sort({ fullName: 1 }).lean().exec()),
    ]);
    const adminsById = new Map(admins.map((admin) => [String(admin._id), { id: String(admin._id), name: admin.name, email: admin.email }]));
    const departmentNames = new Map(business.departments.map((item: any) => [String(item._id), item.name]));
    return res.json({
        client: {
            id: String(business._id),
            name: business.name,
            isActive: business.isActive,
            createdAt: business.get('createdAt'),
            contact: { name: business.clientContact?.name || '', email: business.clientContact?.email || '', phone: business.clientContact?.phone || '' },
        },
        fiscalYears: [...business.fiscalYears].sort((a, b) => a.startDate.localeCompare(b.startDate)),
        departments: business.departments.map((item: any) => ({ id: String(item._id), name: item.name, isActive: item.isActive })),
        branches: branches.map((branch: any) => ({
            ...serializeBranch(branch),
            administrators: branchAdminIds(branch).flatMap((id) => adminsById.get(id) || []),
        })),
        employees: employees.map((employee) => ({
            id: String(employee._id),
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            designation: employee.designation,
            departmentId: employee.departmentId ? String(employee.departmentId) : null,
            departmentName: (employee.departmentId && departmentNames.get(String(employee.departmentId))) || employee.department || '',
            status: employee.status,
            branchId: employee.branchId ? String(employee.branchId) : null,
            joiningDate: employee.joiningDate,
        })),
    });
};

export const getDepartments = async (req: AuthRequest, res: Response) => {
    const business = await loadBusiness(req);
    if (!business) return res.status(404).json({ message: 'Business workspace not found.' });
    return res.json(business.departments || []);
};

export const createDepartment = async (req: AuthRequest, res: Response) => {
    const result = validate(departmentSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    if (!business) return res.status(404).json({ message: 'Business workspace not found.' });
    const duplicate = business.departments.some((item: any) => item.name.toLowerCase() === result.value.name.toLowerCase());
    if (duplicate) return res.status(409).json({ message: 'A department with this name already exists.' });
    business.departments.push(result.value);
    await business.save();
    return res.status(201).json(business.departments[business.departments.length - 1]);
};

export const updateDepartment = async (req: AuthRequest, res: Response) => {
    const result = validate(departmentSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    const department = (business?.departments as any)?.id(req.params.id);
    if (!business || !department) return res.status(404).json({ message: 'Department not found.' });
    if (business.departments.some((item: any) => String(item._id) !== req.params.id && item.name.toLowerCase() === result.value.name.toLowerCase())) {
        return res.status(409).json({ message: 'A department with this name already exists.' });
    }
    Object.assign(department, result.value);
    await business.save();
    return res.json(department);
};

export const deleteDepartment = async (req: AuthRequest, res: Response) => {
    const business = await loadBusiness(req);
    const department = (business?.departments as any)?.id(req.params.id);
    if (!business || !department) return res.status(404).json({ message: 'Department not found.' });
    department.deleteOne();
    await business.save();
    // Departments are shared by every branch.
    await acrossBranches(() => Employee.updateMany({ ...buildTenantFilter(req.user!), departmentId: req.params.id }, { $set: { departmentId: null, department: '' } }).exec());
    return res.json({ message: 'Department deleted.' });
};

export const getBranches = async (req: AuthRequest, res: Response) => {
    const business = await loadBusiness(req);
    if (!business) return res.status(404).json({ message: 'Business workspace not found.' });
    const branchIds = visibleBranchIds(req, business);
    const [admins, employees] = await Promise.all([
        User.find({ businessId: business._id, role: 'admin', isActive: true }).select('name email').sort({ name: 1 }).lean(),
        acrossBranches(() => Employee.find({ ...buildTenantFilter(req.user!), $or: [{ branchId: { $in: branchIds } }, { branchId: null }, { branchId: { $exists: false } }] })
            .select('employeeCode fullName email phoneNumber designation status branchId').sort({ fullName: 1 }).lean().exec()),
    ]);
    return res.json({
        branches: business.branches.filter((branch: any) => branchIds.includes(String(branch._id))).map(serializeBranch),
        administrators: admins.map((admin) => ({ id: String(admin._id), name: admin.name, email: admin.email })),
        employees: employees.map((employee) => ({ ...employee, id: String(employee._id), branchId: employee.branchId ? String(employee.branchId) : null })),
    });
};

const sendBranchLocationError = (res: Response, error: unknown) => {
    if (!(error instanceof BranchLocationError)) throw error;
    return res.status(error.status).json({ message: error.message });
};

const hasBranchNamed = (business: any, name: string, exceptId = '') => business.branches
    .some((branch: any) => String(branch._id) !== exceptId && branch.name.toLowerCase() === name.toLowerCase());

export const createBranch = async (req: AuthRequest, res: Response) => {
    const result = validate(branchDetailsSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    if (!business) return res.status(404).json({ message: 'Business workspace not found.' });
    if (hasBranchNamed(business, result.value.name)) return res.status(409).json({ message: 'A branch with this name already exists.' });
    let place;
    try { [place] = await resolveBranchPlaces([result.value]); } catch (error) { return sendBranchLocationError(res, error); }
    // An administrator assigned to branches only sees those branches, so they manage the branch they add.
    const adminUserIds = req.user!.role === 'admin' && actorBranchIds(business, req.user!.id).length ? [new mongoose.Types.ObjectId(req.user!.id)] : [];
    business.branches.push({
        name: result.value.name, location: result.value.location, phone: result.value.phone, ...place,
        adminUserId: adminUserIds[0] || null, adminUserIds,
    });
    await business.save();
    return res.status(201).json(serializeBranch(business.branches[business.branches.length - 1]));
};

export const updateBranch = async (req: AuthRequest, res: Response) => {
    const result = validate(branchDetailsSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    const branch = business && findVisibleBranch(req, business, String(req.params.id));
    if (!business || !branch) return res.status(404).json({ message: 'Branch not found.' });
    if (hasBranchNamed(business, result.value.name, String(branch._id))) return res.status(409).json({ message: 'A branch with this name already exists.' });
    let place;
    try { [place] = await resolveBranchPlaces([{ ...result.value, current: branch }]); } catch (error) { return sendBranchLocationError(res, error); }
    Object.assign(branch, { name: result.value.name, location: result.value.location, phone: result.value.phone, ...place });
    await business.save();
    return res.json(serializeBranch(branch));
};

export const setBranchAdministrators = async (req: AuthRequest, res: Response) => {
    const result = validate(branchAdministratorsSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    const branch = business && findVisibleBranch(req, business, String(req.params.id));
    if (!business || !branch) return res.status(404).json({ message: 'Branch not found.' });
    const validAdmins = await User.countDocuments({ _id: { $in: result.value.adminUserIds }, businessId: business._id, role: 'admin', isActive: true });
    if (validAdmins !== result.value.adminUserIds.length) return res.status(400).json({ message: 'Choose active administrators from this business.' });
    const actorAssignments = actorBranchIds(business, req.user!.id);
    if (req.user!.role === 'admin' && actorAssignments.length === 1
        && actorAssignments[0] === String(branch._id)
        && !result.value.adminUserIds.includes(req.user!.id)) {
        return res.status(400).json({ message: 'You cannot remove your final branch assignment from your own account.' });
    }
    branch.adminUserIds = result.value.adminUserIds;
    branch.adminUserId = result.value.adminUserIds[0] || null;
    await business.save();
    return res.json(serializeBranch(branch));
};

export const createBranchAdministrator = async (req: AuthRequest, res: Response) => {
    const result = validate(branchAdminSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    const branch = business && findVisibleBranch(req, business, String(req.params.id));
    if (!business || !branch) return res.status(404).json({ message: 'Branch not found.' });
    if (await User.exists({ email: result.value.email })) return res.status(409).json({ message: 'This login email already belongs to an account.' });
    try {
        const adminId = new mongoose.Types.ObjectId();
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await User.create([{
                    _id: adminId,
                    ...result.value,
                    role: 'admin',
                    businessId: business._id,
                    createdBy: req.user!.id,
                    screenPermissions: ['organization'],
                    screenPermissionsVersion: 3,
                    location: { countryCode: branch.countryCode, country: branch.country, city: branch.city },
                }], { session });
                branch.adminUserIds = [...new Set([...branchAdminIds(branch), String(adminId)])];
                branch.adminUserId = branch.adminUserIds[0];
                await business.save({ session });
            });
        } finally {
            await session.endSession();
        }
        return res.status(201).json({ id: String(adminId), name: result.value.name, email: result.value.email });
    } catch (error: unknown) {
        if ((error as { code?: number }).code === 11000) return res.status(409).json({ message: 'This login email already belongs to an account.' });
        throw error;
    }
};

export const setBranchEmployees = async (req: AuthRequest, res: Response) => {
    const result = validate(branchEmployeesSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    const branch = business && findVisibleBranch(req, business, String(req.params.id));
    if (!business || !branch) return res.status(404).json({ message: 'Branch not found.' });
    const tenant = buildTenantFilter(req.user!);
    const employees = await acrossBranches(() => Employee.find({ _id: { $in: result.value.employeeIds }, ...tenant }).select('_id branchId').lean().exec());
    if (employees.length !== result.value.employeeIds.length) return res.status(400).json({ message: 'Choose employees from this business.' });
    const visibleIds = new Set(visibleBranchIds(req, business));
    if (employees.some((employee) => employee.branchId && !visibleIds.has(String(employee.branchId)))) {
        return res.status(403).json({ message: 'An employee is assigned to a branch you cannot manage.' });
    }
    await acrossBranches(async () => {
        // Employees removed from a branch return to the main branch, where records without a branch belong.
        const removed = await Employee.find({ ...tenant, branchId: branch._id, _id: { $nin: result.value.employeeIds } }).select('userId').lean().exec();
        const added = await Employee.find({ ...tenant, _id: { $in: result.value.employeeIds } }).select('userId').lean().exec();
        await Promise.all([
            Employee.updateMany({ ...tenant, _id: { $in: removed.map((employee) => employee._id) } }, { $set: { branchId: null } }).exec(),
            Employee.updateMany({ ...tenant, _id: { $in: result.value.employeeIds } }, { $set: { branchId: branch._id } }).exec(),
            // A staff login works in the branch of its employee profile.
            User.updateMany({ _id: { $in: removed.flatMap((employee) => employee.userId ? [employee.userId] : []) }, role: { $ne: 'admin' } }, { $set: { branchId: null } }),
            User.updateMany({ _id: { $in: added.flatMap((employee) => employee.userId ? [employee.userId] : []) }, role: { $ne: 'admin' } }, { $set: { branchId: branch._id } }),
        ]);
    });
    return res.json({ message: 'Branch employees updated.' });
};

export const getFiscalYears = async (req: AuthRequest, res: Response) => {
    const business = await loadBusiness(req);
    if (!business) return res.status(404).json({ message: 'Business workspace not found.' });
    return res.json(business.fiscalYears || []);
};

export const createFiscalYear = async (req: AuthRequest, res: Response) => {
    const result = validate(fiscalYearSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    if (!business) return res.status(404).json({ message: 'Business workspace not found.' });
    if (business.fiscalYears.some((item: any) => item.name.toLowerCase() === result.value.name.toLowerCase())) {
        return res.status(409).json({ message: 'A fiscal year with this name already exists.' });
    }
    if (result.value.isCurrent) business.fiscalYears.forEach((item: any) => { item.isCurrent = false; });
    business.fiscalYears.push(result.value);
    await business.save();
    return res.status(201).json(business.fiscalYears[business.fiscalYears.length - 1]);
};

export const updateFiscalYear = async (req: AuthRequest, res: Response) => {
    const result = validate(fiscalYearSchema, req.body);
    if (result.error) return validationError(res, result.error);
    const business = await loadBusiness(req);
    const fiscalYear = (business?.fiscalYears as any)?.id(req.params.id);
    if (!business || !fiscalYear) return res.status(404).json({ message: 'Fiscal year not found.' });
    if (business.fiscalYears.some((item: any) => String(item._id) !== req.params.id && item.name.toLowerCase() === result.value.name.toLowerCase())) {
        return res.status(409).json({ message: 'A fiscal year with this name already exists.' });
    }
    if (result.value.isCurrent) business.fiscalYears.forEach((item: any) => { item.isCurrent = false; });
    Object.assign(fiscalYear, result.value);
    await business.save();
    return res.json(fiscalYear);
};

export const deleteFiscalYear = async (req: AuthRequest, res: Response) => {
    const business = await loadBusiness(req);
    const fiscalYear = (business?.fiscalYears as any)?.id(req.params.id);
    if (!business || !fiscalYear) return res.status(404).json({ message: 'Fiscal year not found.' });
    fiscalYear.deleteOne();
    await business.save();
    return res.json({ message: 'Fiscal year deleted.' });
};
