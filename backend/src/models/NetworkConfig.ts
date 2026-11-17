import mongoose, { Document, Schema } from 'mongoose';

export interface INetworkConfig extends Document {
  routerBrand: string;
  routerModel: string;
  routerFirmware?: string;
  vpnType: 'wireguard' | 'openvpn';
  vpnServerAddress?: string;
  vpnPort: number;
  lanSubnet: string;
  printerStaticIp: string;
  dynamicDnsProvider?: string;
  dynamicDnsHostname?: string;
  hasPublicIp: boolean;
  isCgnat: boolean;
  setupStatus: 'NOT_STARTED' | 'ROUTER_CONFIGURED' | 'VPN_VERIFIED' | 'PRINTER_REACHABLE';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const networkConfigSchema = new Schema<INetworkConfig>(
  {
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
  },
  { timestamps: true }
);

export const NetworkConfig = mongoose.model<INetworkConfig>('NetworkConfig', networkConfigSchema);
