import { Router } from 'express';
import {
  getStats,
  getUsers,
  updateUserRole,
  getWorkers,
  getLogs,
} from '../controllers/admin.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.patch('/users/:id/role', updateUserRole);
router.get('/workers', getWorkers);
router.get('/logs', getLogs);

export default router;
