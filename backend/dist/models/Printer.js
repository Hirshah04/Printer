"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Printer = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const printerSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    brand: { type: String, default: 'HP' },
    model: { type: String, default: 'HP LaserJet Pro MFP M126nw' },
    lanIp: { type: String, required: true, trim: true },
    ippPort: { type: Number, default: 631 },
    ippEndpoint: { type: String, default: '/ipp/printer' },
    supportedFormats: {
        type: [String],
        default: ['application/PCLm', 'application/octet-stream', 'image/jpeg', 'image/urf'],
    },
    connectionStatus: {
        type: String,
        enum: ['ONLINE', 'OFFLINE', 'UNREACHABLE', 'BUSY', 'ERROR'],
        default: 'OFFLINE',
    },
    paperStatus: {
        type: String,
        enum: ['OK', 'LOW', 'EMPTY', 'OUT', 'UNKNOWN'],
        default: 'UNKNOWN',
    },
    tonerStatus: {
        type: String,
        enum: ['OK', 'LOW', 'EMPTY', 'OUT', 'UNKNOWN'],
        default: 'UNKNOWN',
    },
    enabled: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    stateReasons: { type: [String], default: [] },
    lastSeenAt: { type: Date },
    locationNotes: { type: String, default: 'Home / Office Wi-Fi Network' },
}, { timestamps: true });
exports.Printer = mongoose_1.default.model('Printer', printerSchema);
