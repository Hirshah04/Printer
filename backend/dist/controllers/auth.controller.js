"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.getMe = getMe;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const User_js_1 = require("../models/User.js");
const env_js_1 = require("../config/env.js");
const logger_service_js_1 = require("../services/logger.service.js");
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
async function register(req, res) {
    try {
        const parseResult = registerSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
            return;
        }
        const { name, email, password } = parseResult.data;
        const normalizedEmail = email.toLowerCase();
        const existing = await User_js_1.User.findOne({ email: normalizedEmail });
        if (existing) {
            res.status(409).json({ success: false, message: 'An account with this email already exists.' });
            return;
        }
        // First user is automatically made admin
        const userCount = await User_js_1.User.countDocuments();
        const role = userCount === 0 ? 'admin' : 'user';
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        const user = await User_js_1.User.create({
            name,
            email: normalizedEmail,
            passwordHash,
            role,
        });
        const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, env_js_1.config.jwtSecret, {
            expiresIn: env_js_1.config.jwtExpiresIn,
        });
        await logger_service_js_1.loggerService.info('USER_REGISTERED', `New user registered: ${normalizedEmail} (Role: ${role})`);
        res.status(201).json({
            success: true,
            message: 'Account created successfully.',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Registration failed.' });
    }
}
async function login(req, res) {
    try {
        const parseResult = loginSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
            return;
        }
        const { email, password } = parseResult.data;
        const normalizedEmail = email.toLowerCase();
        const user = await User_js_1.User.findOne({ email: normalizedEmail });
        if (!user) {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
            return;
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            res.status(401).json({ success: false, message: 'Invalid email or password.' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, env_js_1.config.jwtSecret, {
            expiresIn: env_js_1.config.jwtExpiresIn,
        });
        await logger_service_js_1.loggerService.info('USER_LOGIN', `User logged in: ${normalizedEmail}`);
        res.json({
            success: true,
            message: 'Logged in successfully.',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message || 'Login failed.' });
    }
}
async function getMe(req, res) {
    if (!req.user) {
        res.status(401).json({ success: false, message: 'Not authenticated.' });
        return;
    }
    res.json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            createdAt: req.user.createdAt,
        },
    });
}
