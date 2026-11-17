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
exports.NetworkConfig = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const networkConfigSchema = new mongoose_1.Schema({
    routerBrand: { type: String, default: 'Generic / Unknown' },
    routerModel: { type: String, default: 'Wi-Fi 6 Router' },
    routerFirmware: { type: String },
    vpnType: { type: String, enum: ['wireguard', 'openvpn'], default: 'wireguard' },
    vpnServerAddress: { type: String },
    vpnPort: { type: Number, default: 51820 },
    lanSubnet: { type: String, default: '192.168.1.0/24' },
    printerStaticIp: { type: String, default: '192.168.1.150' },
    dynamicDnsProvider: { type: String },
    dynamicDnsHostname: { type: String },
    hasPublicIp: { type: Boolean, default: true },
    isCgnat: { type: Boolean, default: false },
    setupStatus: {
        type: String,
        enum: ['NOT_STARTED', 'ROUTER_CONFIGURED', 'VPN_VERIFIED', 'PRINTER_REACHABLE'],
        default: 'NOT_STARTED',
    },
    notes: { type: String },
}, { timestamps: true });
exports.NetworkConfig = mongoose_1.default.model('NetworkConfig', networkConfigSchema);
