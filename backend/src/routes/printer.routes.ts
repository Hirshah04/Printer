import { Router } from 'express';
import {
  getPrinters,
  getPrinterById,
  createPrinter,
  updatePrinter,
  deletePrinter,
  testConnection,
  detectCapabilities,
} from '../controllers/printer.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Any authenticated user can list printers
router.get('/', authenticate, getPrinters);
router.get('/:id', authenticate, getPrinterById);

// Admin operations
router.post('/', authenticate, requireAdmin, createPrinter);
router.put('/:id', authenticate, requireAdmin, updatePrinter);
router.delete('/:id', authenticate, requireAdmin, deletePrinter);

// Testing and capabilities
router.post('/:id/test-connection', authenticate, requireAdmin, testConnection);
router.get('/:id/detect-capabilities', authenticate, requireAdmin, detectCapabilities);

export default router;
