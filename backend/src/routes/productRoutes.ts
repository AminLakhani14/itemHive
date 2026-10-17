import { Router } from 'express';
import { getProducts, getProductById, createProduct, bulkCreateProducts, updateProduct, deleteProduct, getProductImageSuggestions } from '../controllers/productController';
import { protect, authorize, requireScreenAccess } from '../middleware/auth';
import { validate, productSchema } from '../middleware/validate';

const router = Router();
const requireProductScreen = requireScreenAccess('dashboard', 'pos', 'digital_menus', 'inventory', 'inventory_requests', 'inventory_add', 'inventory_import', 'inventory_units', 'inventory_reduce', 'orders', 'transactions', 'installments', 'reports');

router.get('/', protect, requireProductScreen, getProducts);
router.get('/image-suggestions', protect, requireScreenAccess('inventory_add'), getProductImageSuggestions);
router.post('/bulk', protect, authorize('super_admin', 'admin'), requireScreenAccess('inventory_import'), bulkCreateProducts);
router.get('/:id', protect, requireProductScreen, getProductById);
router.post('/', protect, authorize('super_admin', 'admin'), requireScreenAccess('inventory', 'inventory_add'), validate(productSchema), createProduct);
router.put('/:id', protect, authorize('super_admin', 'admin'), requireScreenAccess('inventory', 'inventory_reduce', 'pos', 'orders'), validate(productSchema), updateProduct);
router.delete('/:id', protect, authorize('super_admin', 'admin'), requireScreenAccess('inventory'), deleteProduct);

export default router;
