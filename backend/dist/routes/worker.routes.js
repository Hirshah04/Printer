"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const worker_controller_js_1 = require("../controllers/worker.controller.js");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const router = (0, express_1.Router)();
// All worker routes require Worker API Key
router.use(auth_middleware_js_1.authenticateWorker);
router.post('/heartbeat', worker_controller_js_1.heartbeat);
router.get('/jobs/next', worker_controller_js_1.getNextJob);
router.patch('/jobs/:id/status', worker_controller_js_1.updateJobStatus);
router.post('/printers/:id/status', worker_controller_js_1.updatePrinterStatus);
exports.default = router;
