"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const job_controller_js_1 = require("../controllers/job.controller.js");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const upload_middleware_js_1 = require("../middleware/upload.middleware.js");
const router = (0, express_1.Router)();
// Upload & create print job
router.post('/', auth_middleware_js_1.authenticate, upload_middleware_js_1.pdfUpload.single('file'), job_controller_js_1.createJob);
// List and view
router.get('/', auth_middleware_js_1.authenticate, job_controller_js_1.getJobs);
router.get('/:id', auth_middleware_js_1.authenticate, job_controller_js_1.getJobById);
// Job actions
router.post('/:id/retry', auth_middleware_js_1.authenticate, job_controller_js_1.retryJob);
router.post('/:id/cancel', auth_middleware_js_1.authenticate, job_controller_js_1.cancelJob);
// Download file (stream)
router.get('/download/:storageKey', job_controller_js_1.downloadDocument);
exports.default = router;
