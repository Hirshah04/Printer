"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const printer_controller_js_1 = require("../controllers/printer.controller.js");
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const router = (0, express_1.Router)();
// Any authenticated user can list printers
router.get('/', auth_middleware_js_1.authenticate, printer_controller_js_1.getPrinters);
router.get('/:id', auth_middleware_js_1.authenticate, printer_controller_js_1.getPrinterById);
// Admin operations
router.post('/', auth_middleware_js_1.authenticate, auth_middleware_js_1.requireAdmin, printer_controller_js_1.createPrinter);
router.put('/:id', auth_middleware_js_1.authenticate, auth_middleware_js_1.requireAdmin, printer_controller_js_1.updatePrinter);
router.delete('/:id', auth_middleware_js_1.authenticate, auth_middleware_js_1.requireAdmin, printer_controller_js_1.deletePrinter);
// Testing and capabilities
router.post('/:id/test-connection', auth_middleware_js_1.authenticate, auth_middleware_js_1.requireAdmin, printer_controller_js_1.testConnection);
router.get('/:id/detect-capabilities', auth_middleware_js_1.authenticate, auth_middleware_js_1.requireAdmin, printer_controller_js_1.detectCapabilities);
exports.default = router;
