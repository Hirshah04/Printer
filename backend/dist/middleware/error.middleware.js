"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    console.error(`[ErrorHandler] Error caught on ${req.method} ${req.url}:`, err);
    const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({
        success: false,
        message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
}
