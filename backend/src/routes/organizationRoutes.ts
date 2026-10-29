import { Router } from 'express';
import { authorize, protect, requireScreenAccess } from '../middleware/auth';
import {
    createBranch,
    createBranchAdministrator,
    createDepartment,
    createFiscalYear,
    deleteDepartment,
    deleteFiscalYear,
    getBranches,
    getDepartments,
    getFiscalYears,
    getMyBranches,
    getOrganizationOverview,
    setBranchAdministrators,
    setBranchEmployees,
    updateBranch,
    updateDepartment,
    updateFiscalYear,
} from '../controllers/organizationController';

const router = Router();
const manageOrganization = [protect, authorize('super_admin', 'admin'), requireScreenAccess('organization')];

router.get('/my-branches', protect, getMyBranches);
router.get('/overview', ...manageOrganization, getOrganizationOverview);

router.get('/departments', ...manageOrganization, getDepartments);
router.post('/departments', ...manageOrganization, createDepartment);
router.patch('/departments/:id', ...manageOrganization, updateDepartment);
router.delete('/departments/:id', ...manageOrganization, deleteDepartment);

router.get('/branches', ...manageOrganization, getBranches);
router.post('/branches', ...manageOrganization, createBranch);
router.patch('/branches/:id', ...manageOrganization, updateBranch);
router.put('/branches/:id/administrators', ...manageOrganization, setBranchAdministrators);
router.post('/branches/:id/administrators', ...manageOrganization, createBranchAdministrator);
router.put('/branches/:id/employees', ...manageOrganization, setBranchEmployees);

router.get('/fiscal-years', ...manageOrganization, getFiscalYears);
router.post('/fiscal-years', ...manageOrganization, createFiscalYear);
router.patch('/fiscal-years/:id', ...manageOrganization, updateFiscalYear);
router.delete('/fiscal-years/:id', ...manageOrganization, deleteFiscalYear);

export default router;
