import { Router } from 'express';
import { getPrinter, testConnection } from '../controllers/printer.controller.js';

const router = Router();

router.get('/', getPrinter);
router.post('/test-connection', testConnection);

export default router;
