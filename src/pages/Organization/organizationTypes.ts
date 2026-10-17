export interface Department {
    _id: string;
    name: string;
    description: string;
    isActive: boolean;
}

export interface FiscalYear {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
}

export interface OrganizationAdmin { id: string; name: string; email: string }
export interface OrganizationEmployee {
    id: string;
    employeeCode: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    designation: string;
    status: 'active' | 'inactive';
    branchId: string | null;
}
export interface OrganizationBranch {
    id: string;
    name: string;
    location: string;
    phone: string;
    city: string;
    countryCode: string;
    country: string;
    adminUserIds: string[];
}
export interface BranchesResponse {
    branches: OrganizationBranch[];
    administrators: OrganizationAdmin[];
    employees: OrganizationEmployee[];
}

export interface OverviewEmployee {
    id: string;
    employeeCode: string;
    fullName: string;
    designation: string;
    departmentId: string | null;
    departmentName: string;
    status: 'active' | 'inactive';
    branchId: string | null;
    joiningDate: string;
}
export interface OrganizationOverview {
    client: { id: string; name: string; isActive: boolean; createdAt?: string; contact: { name: string; email: string; phone: string } };
    fiscalYears: FiscalYear[];
    departments: Array<{ id: string; name: string; isActive: boolean }>;
    branches: Array<OrganizationBranch & { administrators: OrganizationAdmin[] }>;
    employees: OverviewEmployee[];
}
