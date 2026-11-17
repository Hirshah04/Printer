"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
const env_js_1 = require("./env.js");
async function connectDatabase() {
    try {
        mongoose_1.default.set('strictQuery', false);
        await mongoose_1.default.connect(env_js_1.config.mongodbUri, {
            serverSelectionTimeoutMS: 5000,
            autoIndex: true,
        });
        console.log(`[Database] Successfully connected to MongoDB: ${mongoose_1.default.connection.host}/${mongoose_1.default.connection.name}`);
    }
    catch (err) {
        console.error('[Database] MongoDB connection failed:', err.message);
        if (env_js_1.config.nodeEnv === 'production') {
            process.exit(1);
        }
        else {
            console.warn('[Database] Running in development mode without active MongoDB. Some persistent operations will fail until MongoDB is connected.');
        }
    }
}
mongoose_1.default.connection.on('disconnected', () => {
    console.warn('[Database] MongoDB disconnected.');
});
mongoose_1.default.connection.on('reconnected', () => {
    console.log('[Database] MongoDB reconnected.');
});
