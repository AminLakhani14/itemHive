export type EmployeeStatus = 'active' | 'inactive';
export type SalaryType = 'monthly' | 'daily' | 'hourly';
/** '' means not recorded. */
export type Gender = '' | 'male' | 'female' | 'other';
export type MaritalStatus = '' | 'single' | 'married' | 'divorced' | 'widowed';
export type LeaveType = 'casual' | 'sick' | 'annual' | 'unpaid' | 'other';
export type AttendanceDayStatus = 'present' | 'leave' | 'off' | 'absent' | 'upcoming' | 'not_joined';
export type AttendanceMethod = 'face' | 'manual';

export interface EmployeeEducation {
    degree: string;
    institute: string;
    year: string;
    grade: string;
}

export interface EmployeeExperience {
    company: string;
    position: string;
    fromDate: string;
    toDate: string;
    description: string;
}

export interface EmployeeReference {
    name: string;
    relation: string;
    phoneNumber: string;
    cnic: string;
    address: string;
}

export interface EmployeeAchievement {
    title: string;
    date: string;
    description: string;
}

export interface EmployeeDocumentMeta {
    _id: string;
    title: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: string;
}

/** The Team login linked to an employee. Rights and active status are managed in Team. */
export interface EmployeeAccount {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'user';
    isActive: boolean;
}

export interface Employee {
    payrollEnrolled?: boolean;
    _id: string;
    employeeCode: string;
    fullName: string;
    fatherName: string;
    motherName: string;
    cnic: string;
    phoneNumber: string;
    email: string;
    address: string;
    dateOfBirth: string;
    gender: Gender;
    maritalStatus: MaritalStatus;
    religion: string;
    nationality: string;
    emergencyContactName: string;
    emergencyContactNumber: string;
    medicalConditions: string;
    joiningDate: string;
    designation: string;
    salary: number;
    salaryType: SalaryType;
    status: EmployeeStatus;
    education: EmployeeEducation[];
    experience: EmployeeExperience[];
    references: EmployeeReference[];
    achievements: EmployeeAchievement[];
    notes: string;
    photo: string;
    hasFace: boolean;
    faceRegisteredAt?: string | null;
    userId?: string | null;
    businessId?: string;
    branchId?: string | null;
    departmentId?: string | null;
    account?: EmployeeAccount | null;
    createdAt: string;
    updatedAt: string;
    documents?: EmployeeDocumentMeta[];
}

export interface Designation {
    _id: string | null;
    name: string;
    isDefault: boolean;
}

/** The slim employee shape the attendance endpoints return. */
export interface EmployeeSummary {
    _id: string;
    fullName: string;
    employeeCode: string;
    designation: string;
    photo: string;
    status: EmployeeStatus;
    joiningDate: string;
    hasFace: boolean;
}

export interface AttendanceRecord {
    _id: string;
    dateKey: string;
    checkIn: string | null;
    checkOut: string | null;
    checkInMethod: AttendanceMethod | null;
    checkOutMethod: AttendanceMethod | null;
    note: string;
    workedMinutes: number;
}

export interface EmployeeLeave {
    _id: string;
    employee: EmployeeSummary;
    startDate: string;
    endDate: string;
    leaveType: LeaveType;
    reason: string;
    days: number;
    createdAt: string;
}

export const GENDER_LABELS: Record<Exclude<Gender, ''>, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
};

export const MARITAL_STATUS_LABELS: Record<Exclude<MaritalStatus, ''>, string> = {
    single: 'Single',
    married: 'Married',
    divorced: 'Divorced',
    widowed: 'Widowed',
};

/** Suggestions only; any value can be typed. */
export const RELIGION_OPTIONS = ['Islam', 'Christianity', 'Hinduism', 'Sikhism', 'Buddhism'];
export const NATIONALITY_OPTIONS = ['Pakistani', 'Afghan', 'Bangladeshi', 'Indian', 'Emirati', 'British', 'American'];

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
    monthly: 'Monthly',
    daily: 'Daily',
    hourly: 'Hourly',
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
    casual: 'Casual',
    sick: 'Sick',
    annual: 'Annual',
    unpaid: 'Unpaid',
    other: 'Other',
};
