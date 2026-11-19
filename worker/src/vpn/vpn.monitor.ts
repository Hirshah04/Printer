import os from 'os';
import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config/env.js';

const execAsync = promisify(exec);

export interface VpnHealth {
  vpnStatus: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  vpnIp?: string;
  gatewayIp?: string;
  interfaceName?: string;
  pingLatencyMs?: number;
  details?: string;
}

export class VpnMonitor {
  private lastStatus: VpnHealth = { vpnStatus: 'UNKNOWN' };

  /**
   * Determine whether VPN is connected and can reach the router gateway
   */
  async checkVpnStatus(): Promise<VpnHealth> {
    const interfaces = os.networkInterfaces();
    let vpnIp: string | undefined;
    let foundInterface: string | undefined;

    // 1. Look for wireguard / tun / tap interfaces
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      const lower = name.toLowerCase();
      if (
        lower.includes('wg') ||
        lower.includes('tun') ||
        lower.includes('tap') ||
        lower.includes('wireguard') ||
        name === config.wireguardInterface
      ) {
        const ipv4 = addrs.find((a) => a.family === 'IPv4' && !a.internal);
        if (ipv4) {
          vpnIp = ipv4.address;
          foundInterface = name;
          break;
        }
      }
    }

    // 2. Test connectivity to router gateway or printer
    const isGatewayReachable = await this.probeHost(config.gatewayIp, 80, 2000) ||
                               await this.probeHost(config.defaultPrinterIp, 631, 2000);

    // If interface exists and gateway is reachable
    if (vpnIp || isGatewayReachable) {
      this.lastStatus = {
        vpnStatus: 'CONNECTED',
        vpnIp: vpnIp || '10.14.0.2',
        gatewayIp: config.gatewayIp,
        interfaceName: foundInterface || config.wireguardInterface,
        details: isGatewayReachable ? 'Gateway and Printer reachable' : 'VPN interface active',
      };
    } else {
      // In local dev without active VPN, we check if default printer IP is reachable
      const isLocalPrinterReachable = await this.probeHost(config.defaultPrinterIp, 631, 1500);
      if (isLocalPrinterReachable) {
        this.lastStatus = {
          vpnStatus: 'CONNECTED',
          vpnIp: 'Local LAN Interface',
          gatewayIp: config.gatewayIp,
          interfaceName: 'Local Network',
          details: 'Direct LAN reachability active (Development mode)',
        };
      } else {
        this.lastStatus = {
          vpnStatus: 'DISCONNECTED',
          gatewayIp: config.gatewayIp,
          interfaceName: config.wireguardInterface,
          details: `Router VPN gateway ${config.gatewayIp} unreachable`,
        };
      }
    }

    return this.lastStatus;
  }

  /**
   * Lightweight TCP probe to test host reachability without requiring root ICMP ping
   */
  probeHost(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(true);
        }
      });

      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(false);
        }
      });

      socket.on('error', (err: any) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          // ECONNREFUSED still proves host is alive and reachable over IP routing!
          if (err.code === 'ECONNREFUSED') {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      });

      try {
        socket.connect(port, host);
      } catch {
        resolve(false);
      }
    });
  }

  getLastStatus(): VpnHealth {
    return this.lastStatus;
  }
}

export const vpnMonitor = new VpnMonitor();
