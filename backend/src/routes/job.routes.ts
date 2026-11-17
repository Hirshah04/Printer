import { Router } from 'express';
import {
  createJob,
  getJobs,
  getJobById,
  retryJob,
  cancelJob,
  downloadDocument,
} from '../controllers/job.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { pdfUpload } from '../middleware/upload.middleware.js';

const router = Router();

// Upload & create print job
router.post('/', authenticate, pdfUpload.single('file'), createJob);

// List and view
router.get('/', authenticate, getJobs);
router.get('/:id', authenticate, getJobById);

// Job actions
router.post('/:id/retry', authenticate, retryJob);
router.post('/:id/cancel', authenticate, cancelJob);

// Download file (stream)
router.get('/download/:storageKey', downloadDocument);

export default router;
