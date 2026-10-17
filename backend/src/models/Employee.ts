import mongoose, { Schema, Document } from 'mongoose';
import { branchScopedPlugin } from '../utils/branchScope';

export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export const SALARY_TYPES = ['monthly', 'daily', 'hourly'] as const;
/** '' means not recorded. */
export const GENDERS = ['', 'male', 'female', 'other'] as const;
export const MARITAL_STATUSES = ['', 'single', 'married', 'divorced', 'widowed'] as const;

export interface IEmployeeEducation {
    degree: string;
    institute: string;
    year: string;
    grade: string;
}

export interface IEmployeeExperience {
    company: string;
    position: string;
    fromDate: string;
    toDate: string;
    description: string;
}

export interface IEmployeeReference {
    name: string;
    relation: string;
    phoneNumber: string;
    cnic: string;
    address: string;
}

export interface IEmployeeAchievement {
    title: string;
    date: string;
    description: string;
}

export interface IEmployee extends Document {
    payrollEnrolled: boolean;
    payrollRevision: number;
    department: string;
    branchId?: mongoose.Types.ObjectId | null;
    departmentId?: mongoose.Types.ObjectId | null;
    employmentEndDate: string;
    paymentMethod: 'cash' | 'bank';
    bankName: string;
    bankAccount: string;
    employeeCode: string;
    fullName: string;
    fatherName: string;
    motherName: string;
    cnic: string;
    phoneNumber: string;
    email: string;
    address: string;
    /** Date-only fields are stored as YYYY-MM-DD so they never shift across time zones. */
    dateOfBirth: string;
    joiningDate: string;
    gender: typeof GENDERS[number];
    maritalStatus: typeof MARITAL_STATUSES[number];
    religion: string;
    nationality: string;
    emergencyContactName: string;
    emergencyContactNumber: string;
    medicalConditions: string;
    designation: string;
    salary: number;
    salaryType: typeof SALARY_TYPES[number];
    status: typeof EMPLOYEE_STATUSES[number];
    education: IEmployeeEducation[];
    experience: IEmployeeExperience[];
    references: IEmployeeReference[];
    achievements: IEmployeeAchievement[];
    notes: string;
    photo: string;
    /** 128-value face-api descriptors, one per enrollment sample. Never sent to clients. */
    faceDescriptors: number[][];
    faceRegisteredAt?: Date | null;
    /** The Team login account for this employee, if they have one. */
    userId?: mongoose.Types.ObjectId | null;
    createdBy?: mongoose.Types.ObjectId;
    businessId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const EducationSchema = new Schema<IEmployeeEducation>({
    degree: { type: String, default: '', trim: true },
    institute: { type: String, default: '', trim: true },
    year: { type: String, default: '', trim: true },
    grade: { type: String, default: '', trim: true },
}, { _id: false });

const ExperienceSchema = new Schema<IEmployeeExperience>({
    company: { type: String, default: '', trim: true },
    position: { type: String, default: '', trim: true },
    fromDate: { type: String, default: '', trim: true },
    toDate: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
}, { _id: false });

const ReferenceSchema = new Schema<IEmployeeReference>({
    name: { type: String, default: '', trim: true },
    relation: { type: String, default: '', trim: true },
    phoneNumber: { type: String, default: '', trim: true },
    cnic: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
}, { _id: false });

const AchievementSchema = new Schema<IEmployeeAchievement>({
    title: { type: String, default: '', trim: true },
    date: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
}, { _id: false });

const EmployeeSchema: Schema<IEmployee> = new Schema(
    {
        payrollEnrolled: { type: Boolean, default: false },
        payrollRevision: { type: Number, default: 0 },
        department: { type: String, default: '', trim: true },
        branchId: { type: Schema.Types.ObjectId, default: null, index: true },
        departmentId: { type: Schema.Types.ObjectId, default: null, index: true },
        employmentEndDate: { type: String, default: '' },
        paymentMethod: { type: String, enum: ['cash', 'bank'], default: 'cash' },
        bankName: { type: String, default: '', select: false },
        bankAccount: { type: String, default: '', select: false },
        employeeCode: { type: String, required: true, trim: true },
        fullName: { type: String, required: true, trim: true },
        fatherName: { type: String, default: '', trim: true },
        motherName: { type: String, default: '', trim: true },
        // Optional because staff added from Team start without one; unique once entered.
        cnic: { type: String, default: '', trim: true },
        phoneNumber: { type: String, default: '', trim: true },
        email: { type: String, default: '', trim: true, lowercase: true },
        address: { type: String, default: '', trim: true },
        dateOfBirth: { type: String, default: '' },
        joiningDate: { type: String, default: '' },
        gender: { type: String, enum: GENDERS, default: '' },
        maritalStatus: { type: String, enum: MARITAL_STATUSES, default: '' },
        religion: { type: String, default: '', trim: true },
        nationality: { type: String, default: '', trim: true },
        emergencyContactName: { type: String, default: '', trim: true },
        emergencyContactNumber: { type: String, default: '', trim: true },
        medicalConditions: { type: String, default: '', trim: true },
        designation: { type: String, default: '', trim: true },
        salary: { type: Number, default: 0, min: 0 },
        salaryType: { type: String, enum: SALARY_TYPES, default: 'monthly' },
        status: { type: String, enum: EMPLOYEE_STATUSES, default: 'active' },
        education: { type: [EducationSchema], default: [] },
        experience: { type: [ExperienceSchema], default: [] },
        references: { type: [ReferenceSchema], default: [] },
        achievements: { type: [AchievementSchema], default: [] },
        notes: { type: String, default: '', trim: true },
        photo: { type: String, default: '' },
        faceDescriptors: { type: [[Number]], default: [], select: false },
        faceRegisteredAt: { type: Date, default: null },
        userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        businessId: { type: Schema.Types.ObjectId, ref: 'Business', default: null, index: true },
    },
    { timestamps: true }
);

EmployeeSchema.index(
    { businessId: 1, cnic: 1 },
    { unique: true, name: 'businessId_1_cnic_1_filled', partialFilterExpression: { cnic: { $gt: '' } } }
);
// One employee per login account.
EmployeeSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
EmployeeSchema.index({ businessId: 1, employeeCode: 1 }, { unique: true });

EmployeeSchema.plugin(branchScopedPlugin);
export default mongoose.model<IEmployee>('Employee', EmployeeSchema);
