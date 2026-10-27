import { Response } from 'express';
import mongoose from 'mongoose';
import Employee, { type IEmployee } from '../models/Employee';
import EmployeeDocument from '../models/EmployeeDocument';
import Designation, { DEFAULT_DESIGNATIONS, normalizeDesignation } from '../models/Designation';
import Attendance from '../models/Attendance';
import EmployeeLeave from '../models/EmployeeLeave';
import { PayrollRun, SalaryStructure, PayrollRequest, PayrollLoan, PayrollCommission } from '../models/Payroll';
import { syncSalarySummary } from '../services/payrollService';
import User from '../models/User';
import type { AuthRequest } from '../middleware/auth';
import { buildTenantFilter, getTenantObjectId } from '../utils/tenancy';
import { acrossBranches } from '../utils/branchScope';
import { areEnrollmentSamplesConsistent, findBestFaceMatch } from '../utils/faceMatch';
import { ensureDeleteAllowed, normalizeRole } from '../utils/accessControl';
import { createEmployeeRecord, isDuplicateKeyError, isStaffRole, syncStaffEmployees } from '../utils/employeeAccounts';

/** Documents are opened in the browser, so only types that cannot run script are accepted. */
const ALLOWED_DOCUMENT_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

const isValidId = (id: unknown): id is string => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

type LeanEmployee = Omit<IEmployee, keyof mongoose.Document> & { _id: mongoose.Types.ObjectId };

interface EmployeeAccount {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
}

const serializeEmployee = ({ faceDescriptors: _faceDescriptors, ...employee }: LeanEmployee, account: EmployeeAccount | null = null) => ({
    ...employee,
    hasFace: Boolean(employee.faceRegisteredAt),
    account,
});

/** The Team login behind each employee, keyed by user id. */
const loadAccounts = async (employees: Pick<LeanEmployee, 'userId'>[]) => {
    const userIds = employees.flatMap((employee) => (employee.userId ? [employee.userId] : []));
    if (userIds.length === 0) return new Map<string, EmployeeAccount>();
    const users = await User.find({ _id: { $in: userIds } }).select('email role isActive').lean();
    return new Map(users.map((user) => [String(user._id), {
        id: String(user._id),
        email: user.email,
        role: normalizeRole(user.role),
        isActive: Boolean(user.isActive),
    }]));
};

const accountFor = (employee: Pick<LeanEmployee, 'userId'>, accounts: Map<string, EmployeeAccount>) =>
    (employee.userId && accounts.get(String(employee.userId))) || null;

/** A blank CNIC is allowed for any number of employees; a filled one must be unique across every branch. */
const findCnicOwner = (req: AuthRequest, cnic: string, ignoreId?: string) => (cnic ? acrossBranches(() => Employee.findOne({
    cnic,
    ...buildTenantFilter(req.user!),
    ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
}).select('fullName').lean().exec()) : null);

export const getEmployees = async (req: AuthRequest, res: Response) => {
    try {
        // Every staff login in Team shows up here, including accounts created before the two were linked.
        await syncStaffEmployees(req.user!.businessId);
        const enrolled = await Employee.find({ ...buildTenantFilter(req.user!), payrollEnrolled: true }).select('_id');
        for (const e of enrolled) await syncSalarySummary(req.user!.businessId, String(e._id));
        const employees = await Employee.find(buildTenantFilter(req.user!)).sort({ fullName: 1 }).lean<LeanEmployee[]>();
        const accounts = await loadAccounts(employees);
        return res.json(employees.map((employee) => serializeEmployee(employee, accountFor(employee, accounts))));
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch employees') });
    }
};

export const getEmployee = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Employee not found' });

        if (await SalaryStructure.exists({ _id: { $exists: true }, employeeId: id, businessId: req.user!.businessId })) await syncSalarySummary(req.user!.businessId, id);
        const employee = await Employee.findOne({ _id: id, ...buildTenantFilter(req.user!) }).lean<LeanEmployee>();
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const documents = await EmployeeDocument.find({ employeeId: employee._id, ...buildTenantFilter(req.user!) })
            .sort({ createdAt: -1 })
            .lean();

        const accounts = await loadAccounts([employee]);
        return res.json({ ...serializeEmployee(employee, accountFor(employee, accounts)), documents });
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch employee') });
    }
};

export const createEmployee = async (req: AuthRequest, res: Response) => {
    try {
        const owner = await findCnicOwner(req, req.body.cnic);
        if (owner) {
            return res.status(409).json({ message: `An employee with this CNIC already exists (${owner.fullName}).` });
        }

        const employee = await createEmployeeRecord({
            ...req.body,
            createdBy: req.user?.id,
            businessId: getTenantObjectId(req.user!),
        });
        return res.status(201).json(serializeEmployee(employee.toObject() as LeanEmployee));
    } catch (error: unknown) {
        if (isDuplicateKeyError(error, 'cnic')) {
            return res.status(409).json({ message: 'An employee with this CNIC already exists.' });
        }
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to create employee') });
    }
};

export const updateEmployee = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Employee not found' });

        const owner = await findCnicOwner(req, req.body.cnic, id);
        if (owner) {
            return res.status(409).json({ message: `An employee with this CNIC already exists (${owner.fullName}).` });
        }

        const existing = await Employee.findOne({ _id: id, ...buildTenantFilter(req.user!) });
        if (existing?.payrollEnrolled && ((req.body.salary != null && req.body.salary !== existing.salary) || (req.body.salaryType && req.body.salaryType !== existing.salaryType))) {
            return res.status(409).json({ message: 'Use the Payroll tab to create an effective-dated salary change for this enrolled employee.' });
        }
        if (existing?.payrollEnrolled && req.body.joiningDate !== undefined && req.body.joiningDate !== existing.joiningDate) return res.status(409).json({ message: 'Joining date is locked after payroll enrollment.' });
        if (existing?.payrollEnrolled && req.body.status === 'inactive' && !existing.employmentEndDate) return res.status(409).json({ message: 'Record the employment end date in Payroll before marking this enrolled employee inactive.' });

        const employee = await Employee.findOneAndUpdate(
            { _id: id, ...buildTenantFilter(req.user!) },
            { $set: req.body },
            { returnDocument: 'after', runValidators: true }
        ).lean<LeanEmployee>();

        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        // The login and the profile are the same person, so the name in Team follows the profile.
        if (employee.userId) await User.updateOne({ _id: employee.userId }, { $set: { name: employee.fullName } });

        const accounts = await loadAccounts([employee]);
        return res.json(serializeEmployee(employee, accountFor(employee, accounts)));
    } catch (error: unknown) {
        if (isDuplicateKeyError(error, 'cnic')) {
            return res.status(409).json({ message: 'An employee with this CNIC already exists.' });
        }
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to update employee') });
    }
};

export const deleteEmployee = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Employee not found' });

        const tenantFilter = buildTenantFilter(req.user!);
        const protectedEmployee = await Employee.findOne({ _id: id, ...tenantFilter });
        if (protectedEmployee && (protectedEmployee.payrollEnrolled || await SalaryStructure.exists({ employeeId: id, ...tenantFilter }) || await PayrollRun.exists({ employeeIds: id, ...tenantFilter }) || await PayrollLoan.exists({ employeeId: id, ...tenantFilter }) || await PayrollRequest.exists({ employeeId: id, ...tenantFilter }) || await PayrollCommission.exists({ employeeId: id, ...tenantFilter }))) {
            return res.status(409).json({ message: 'This employee has payroll records. Set the profile to Inactive and record an employment end date instead of deleting it.' });
        }
        const employee = await Employee.findOne({ _id: id, ...tenantFilter }).select('_id userId');
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        // A staff login always has a profile, so removing the person removes their login too.
        const account = employee.userId ? await User.findById(employee.userId).select('_id role createdBy email') : null;
        if (account) {
            if (!isStaffRole(account.role)) {
                return res.status(409).json({ message: `This employee is linked to an administrator login (${account.email}). Change or remove that account in Team first.` });
            }
            try {
                ensureDeleteAllowed(req.user, account);
            } catch {
                return res.status(403).json({
                    message: `This employee's login (${account.email}) can only be deleted by a super admin. Set the profile to Inactive instead.`,
                });
            }
            await account.deleteOne();
        }
        await employee.deleteOne();

        await Promise.all([
            EmployeeDocument.deleteMany({ employeeId: employee._id, ...tenantFilter }),
            Attendance.deleteMany({ employeeId: employee._id, ...tenantFilter }),
            EmployeeLeave.deleteMany({ employeeId: employee._id, ...tenantFilter }),
        ]);

        return res.json({ message: 'Employee deleted' });
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to delete employee') });
    }
};

export const setEmployeeFace = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Employee not found' });

        const descriptors: number[][] = req.body.descriptors;
        if (!areEnrollmentSamplesConsistent(descriptors)) {
            return res.status(400).json({ message: 'The face samples do not look like the same person. Please capture the face again.' });
        }

        const tenantFilter = buildTenantFilter(req.user!);
        const employee = await Employee.findOne({ _id: id, ...tenantFilter }).select('_id');
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        // One face must never be able to punch attendance for two employees.
        const others = await Employee.find({ ...tenantFilter, _id: { $ne: employee._id }, faceRegisteredAt: { $ne: null } })
            .select('+faceDescriptors fullName')
            .lean();
        const candidates = others.map((other) => ({ value: other.fullName, descriptors: other.faceDescriptors || [] }));
        for (const descriptor of descriptors) {
            const match = findBestFaceMatch(descriptor, candidates);
            if (match.status === 'matched') {
                return res.status(409).json({ message: `This face is already registered to ${match.value}.` });
            }
            if (match.status === 'ambiguous') {
                return res.status(409).json({ message: 'This face is already registered to another employee.' });
            }
        }

        const updated = await Employee.findOneAndUpdate(
            { _id: employee._id },
            { $set: { faceDescriptors: descriptors, faceRegisteredAt: new Date() } },
            { returnDocument: 'after' }
        ).lean<LeanEmployee>();

        return res.json(serializeEmployee(updated!));
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to register face') });
    }
};

export const clearEmployeeFace = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Employee not found' });

        const employee = await Employee.findOneAndUpdate(
            { _id: id, ...buildTenantFilter(req.user!) },
            { $set: { faceDescriptors: [], faceRegisteredAt: null } },
            { returnDocument: 'after' }
        ).lean<LeanEmployee>();

        if (!employee) return res.status(404).json({ message: 'Employee not found' });
        return res.json(serializeEmployee(employee));
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to remove face') });
    }
};

export const uploadEmployeeDocument = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Employee not found' });

        const tenantFilter = buildTenantFilter(req.user!);
        const employee = await Employee.findOne({ _id: id, ...tenantFilter }).select('_id');
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const data: string = req.body.data;
        const headerEnd = data.indexOf(',');
        const mimeType = data.slice('data:'.length, data.indexOf(';')).toLowerCase();
        if (!ALLOWED_DOCUMENT_TYPES.has(mimeType)) {
            return res.status(400).json({ message: 'Upload a PDF, image, Word, Excel, text, or CSV file.' });
        }

        const base64 = data.slice(headerEnd + 1);
        const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
        const document = await EmployeeDocument.create({
            employeeId: employee._id,
            title: req.body.title,
            fileName: req.body.fileName,
            mimeType,
            size: Math.max(0, Math.floor((base64.length * 3) / 4) - padding),
            data,
            uploadedBy: req.user?.id,
            businessId: getTenantObjectId(req.user!),
        });

        const { data: _data, ...metadata } = document.toObject();
        return res.status(201).json(metadata);
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to upload document') });
    }
};

export const getEmployeeDocument = async (req: AuthRequest, res: Response) => {
    try {
        const { id, documentId } = req.params;
        if (!isValidId(id) || !isValidId(documentId)) return res.status(404).json({ message: 'Document not found' });

        const document = await EmployeeDocument.findOne({ _id: documentId, employeeId: id, ...buildTenantFilter(req.user!) })
            .select('+data')
            .lean();
        if (!document) return res.status(404).json({ message: 'Document not found' });

        return res.json(document);
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch document') });
    }
};

export const deleteEmployeeDocument = async (req: AuthRequest, res: Response) => {
    try {
        const { id, documentId } = req.params;
        if (!isValidId(id) || !isValidId(documentId)) return res.status(404).json({ message: 'Document not found' });

        const document = await EmployeeDocument.findOneAndDelete({ _id: documentId, employeeId: id, ...buildTenantFilter(req.user!) });
        if (!document) return res.status(404).json({ message: 'Document not found' });

        return res.json({ message: 'Document deleted' });
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to delete document') });
    }
};

export const getDesignations = async (req: AuthRequest, res: Response) => {
    try {
        const defaultKeys = new Set(DEFAULT_DESIGNATIONS.map(normalizeDesignation));
        const custom = await Designation.find(buildTenantFilter(req.user!)).sort({ name: 1 }).lean();

        return res.json([
            ...DEFAULT_DESIGNATIONS.map((name) => ({ _id: null, name, isDefault: true })),
            ...custom
                .filter((designation) => !defaultKeys.has(designation.normalizedName))
                .map((designation) => ({ _id: String(designation._id), name: designation.name, isDefault: false })),
        ]);
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch designations') });
    }
};

export const createDesignation = async (req: AuthRequest, res: Response) => {
    try {
        const name = String(req.body.name).trim().replace(/\s+/g, ' ');
        const normalizedName = normalizeDesignation(name);
        if (DEFAULT_DESIGNATIONS.some((designation) => normalizeDesignation(designation) === normalizedName)) {
            return res.status(409).json({ message: 'This designation already exists.' });
        }

        const designation = await Designation.create({
            name,
            normalizedName,
            createdBy: req.user?.id,
            businessId: getTenantObjectId(req.user!),
        });

        return res.status(201).json({ _id: String(designation._id), name: designation.name, isDefault: false });
    } catch (error: unknown) {
        if (isDuplicateKeyError(error, 'normalizedName')) {
            return res.status(409).json({ message: 'This designation already exists.' });
        }
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to create designation') });
    }
};

export const deleteDesignation = async (req: AuthRequest, res: Response) => {
    try {
        const id = String(req.params.id);
        if (!isValidId(id)) return res.status(404).json({ message: 'Designation not found' });

        // Employees keep the designation text they were assigned; it just leaves the picker.
        const designation = await Designation.findOneAndDelete({ _id: id, ...buildTenantFilter(req.user!) });
        if (!designation) return res.status(404).json({ message: 'Designation not found' });

        return res.json({ message: 'Designation deleted' });
    } catch (error: unknown) {
        return res.status(400).json({ message: getErrorMessage(error, 'Failed to delete designation') });
    }
};

/** Active employees in this workspace who cannot sign in yet, listed on the Team screen. */
export const getUnlinkedEmployees = async (req: AuthRequest, res: Response) => {
    try {
        const employees = await Employee.find({ ...buildTenantFilter(req.user!), userId: null, status: 'active' })
            .select('fullName employeeCode designation photo email businessId')
            .sort({ fullName: 1 })
            .lean();
        return res.json(employees.map((employee) => ({
            _id: String(employee._id),
            fullName: employee.fullName,
            employeeCode: employee.employeeCode,
            designation: employee.designation,
            photo: employee.photo,
            email: employee.email,
            businessId: String(employee.businessId || ''),
        })));
    } catch (error: unknown) {
        return res.status(500).json({ message: getErrorMessage(error, 'Failed to fetch employees') });
    }
};
