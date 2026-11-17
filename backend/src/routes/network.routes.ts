import { Router } from 'express';
import {
  getNetworkConfig,
  updateNetworkConfig,
  getRouterGuide,
  runDiagnostics,
} from '../controllers/network.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/config', authenticate, getNetworkConfig);
router.put('/config', authenticate, requireAdmin, updateNetworkConfig);
router.get('/guide', authenticate, getRouterGuide);
router.post('/diagnostics', authenticate, runDiagnostics);

export default router;
