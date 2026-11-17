import mongoose, { Document, Schema } from 'mongoose';

export type WorkerStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';
export type VpnStatus = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';

export interface IWorker extends Document {
  workerId: string;
  name: string;
  status: WorkerStatus;
  vpnStatus: VpnStatus;
  vpnIp?: string;
  gatewayIp?: string;
  version: string;
  lastHeartbeat: Date;
  systemInfo?: {
    platform?: string;
    arch?: string;
    uptime?: number;
    freeMemoryMb?: number;
    wireguardInterface?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const workerSchema = new Schema<IWorker>(
  {
    workerId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: 'Cloud Print Worker #1' },
    status: { type: String, enum: ['ONLINE', 'OFFLINE', 'BUSY'], default: 'OFFLINE' },
    vpnStatus: { type: String, enum: ['CONNECTED', 'DISCONNECTED', 'UNKNOWN'], default: 'UNKNOWN' },
    vpnIp: { type: String },
    gatewayIp: { type: String },
    version: { type: String, default: '1.0.0' },
    lastHeartbeat: { type: Date, default: Date.now },
    systemInfo: {
      platform: { type: String },
      arch: { type: String },
      uptime: { type: Number },
      freeMemoryMb: { type: Number },
      wireguardInterface: { type: String },
    },
  },
  { timestamps: true }
);

export const Worker = mongoose.model<IWorker>('Worker', workerSchema);
