import { Router } from 'express';
import { createClient, getClient, listCountries, listCities, updateClient } from '../controllers/clientController';
import { deleteBusiness, deleteUser, getAdminPermissionAssignments, getBusinesses, getMonthlyPaymentAlerts, getUser, getUsers, updateAdminScreenPermissions, updateBusiness, updateMonthlyPayment, updateUserStatus, updateUserCreationLimit, updateUserAccount } from '../controllers/userController';
import { protect, authorize, requireScreenAccess } from '../middleware/auth';
import { getUnlinkedEmployees } from '../controllers/employeeController';
import { createBusinessType, deleteBusinessType, getBusinessTypes, updateBusinessType } from '../controllers/businessTypeController';
import { createBusinessTypeSchema, updateBusinessTypeSchema } from '../middleware/validate';
import { updateAdminLimitSchema, updateBusinessSchema, updateMonthlyPaymentSchema, updateScreenPermissionsSchema, updateUserAccountSchema, updateUserStatusSchema, validate } from '../middleware/validate';

const router = Router();
router.post('/clients', protect, authorize('super_admin'), createClient);
router.get('/clients/countries', protect, authorize('super_admin'), listCountries);
router.get('/clients/cities', protect, authorize('super_admin'), listCities);
router.get('/clients/:id', protect, authorize('super_admin'), getClient);
router.put('/clients/:id', protect, authorize('super_admin'), updateClient);

router.get('/', protect, authorize('super_admin', 'admin'), requireScreenAccess('team'), getUsers);
router.get('/unlinked-employees', protect, authorize('super_admin', 'admin'), requireScreenAccess('team'), getUnlinkedEmployees);
router.get('/businesses', protect, authorize('super_admin'), getBusinesses);
router.get('/business-types', protect, authorize('super_admin', 'admin'), getBusinessTypes);
router.post('/business-types', protect, authorize('super_admin'), validate(createBusinessTypeSchema), createBusinessType);
router.patch('/business-types/:id', protect, authorize('super_admin'), validate(updateBusinessTypeSchema), updateBusinessType);
router.delete('/business-types/:id', protect, authorize('super_admin'), deleteBusinessType);
router.get('/admin-permissions', protect, authorize('super_admin'), getAdminPermissionAssignments);
router.get('/monthly-payment-alerts', protect, getMonthlyPaymentAlerts);
router.patch('/businesses/:id', protect, authorize('super_admin'), validate(updateBusinessSchema), updateBusiness);
router.delete('/businesses/:id', protect, authorize('super_admin'), deleteBusiness);
router.get('/:id', protect, authorize('super_admin', 'admin'), requireScreenAccess('team'), getUser);
router.patch('/:id/account', protect, authorize('super_admin'), validate(updateUserAccountSchema), updateUserAccount);
router.patch('/:id/status', protect, authorize('super_admin'), validate(updateUserStatusSchema), updateUserStatus);
router.patch('/:id/monthly-payment', protect, authorize('super_admin'), validate(updateMonthlyPaymentSchema), updateMonthlyPayment);
router.patch('/:id/limit', protect, authorize('super_admin'), validate(updateAdminLimitSchema), updateUserCreationLimit);
router.patch('/:id/permissions', protect, authorize('super_admin'), validate(updateScreenPermissionsSchema), updateAdminScreenPermissions);
router.delete('/:id', protect, authorize('super_admin', 'admin'), requireScreenAccess('team'), deleteUser);

export default router;
