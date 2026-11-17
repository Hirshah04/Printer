"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireAdmin = requireAdmin;
exports.authenticateWorker = authenticateWorker;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_js_1 = require("../config/env.js");
const User_js_1 = require("../models/User.js");
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, env_js_1.config.jwtSecret);
        const user = await User_js_1.User.findById(decoded.id).select('-passwordHash');
        if (!user) {
            res.status(401).json({ success: false, message: 'Invalid token: User no longer exists.' });
            return;
        }
        req.user = user;
        next();
    }
    catch (err) {
        res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
}
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ success: false, message: 'Forbidden: Admin privilege required.' });
        return;
    }
    next();
}
function authenticateWorker(req, res, next) {
    const apiKey = req.headers['x-worker-api-key'];
    if (!apiKey || apiKey !== env_js_1.config.workerApiKey) {
        res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing worker API key.' });
        return;
    }
    req.workerId = req.headers['x-worker-id'] || 'unknown-worker';
    next();
}
