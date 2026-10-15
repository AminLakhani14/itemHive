import { Router } from 'express';
import { createInventoryRequest, createRestockRequest, getInventoryRequests, reviewInventoryRequest, getInventoryVendors, saveInventoryVendors, receiveInventoryRequest, getInventoryRequestHistory } from '../controllers/inventoryRequestController';
import { protect, authorize, requireScreenAccess } from '../middleware/auth';
import { inventoryRequestDecisionSchema, productSchema, restockRequestSchema, inventoryVendorsSchema, inventoryVendorDetailsSchema, receiveInventorySchema, validate } from '../middleware/validate';
import { listVendors, createVendor, updateVendor, getVendorHistory } from '../controllers/inventoryVendorController';

const router = Router();

router.get('/', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), getInventoryRequests);
router.get('/vendor-directory', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), listVendors);
router.post('/vendor-directory', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), validate(inventoryVendorDetailsSchema), createVendor);
router.put('/vendor-directory/:vendorId', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), validate(inventoryVendorDetailsSchema), updateVendor);
router.get('/vendor-history', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), getVendorHistory);
router.get('/vendors', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), getInventoryVendors);
router.put('/vendors', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), validate(inventoryVendorsSchema), saveInventoryVendors);
router.post('/', protect, authorize('user'), validate(productSchema), createInventoryRequest);
router.post('/restock', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), validate(restockRequestSchema), createRestockRequest);
router.get('/:id/history', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), getInventoryRequestHistory);
router.patch('/:id/receive', protect, authorize('super_admin', 'admin', 'user'), requireScreenAccess('inventory_requests'), validate(receiveInventorySchema), receiveInventoryRequest);
router.patch('/:id/review', protect, authorize('super_admin', 'admin'), requireScreenAccess('inventory_requests'), validate(inventoryRequestDecisionSchema), reviewInventoryRequest);

export default router;
