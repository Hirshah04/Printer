import { Request, Response } from 'express';
import { NetworkConfig } from '../models/NetworkConfig.js';
import { Printer } from '../models/Printer.js';
import { Worker } from '../models/Worker.js';
import { loggerService } from '../services/logger.service.js';

export async function getNetworkConfig(req: Request, res: Response): Promise<void> {
  try {
    let config = await NetworkConfig.findOne();
    if (!config) {
      config = await NetworkConfig.create({
        routerBrand: 'Generic Router',
        routerModel: 'Wi-Fi 6 Router',
        vpnType: 'wireguard',
        vpnPort: 51820,
        lanSubnet: '192.168.1.0/24',
        printerStaticIp: '192.168.1.150',
        setupStatus: 'NOT_STARTED',
      });
    }

    const latestWorker = await Worker.findOne().sort({ updatedAt: -1 });
    const printers = await Printer.find();

    res.json({
      success: true,
      config,
      workerStatus: latestWorker ? latestWorker.status : 'OFFLINE',
      workerVpnStatus: latestWorker ? latestWorker.vpnStatus : 'UNKNOWN',
      printers,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateNetworkConfig(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body;
    let config = await NetworkConfig.findOne();
    if (!config) {
      config = await NetworkConfig.create(data);
    } else {
      Object.assign(config, data);
      await config.save();
    }

    await loggerService.info('NETWORK_CONFIG_UPDATED', 'Router and VPN configuration updated', { config });

    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRouterGuide(req: Request, res: Response): Promise<void> {
  const { brand = 'generic' } = req.query;

  const brandKey = String(brand).toLowerCase();

  const guides: Record<string, any> = {
    asus: {
      brand: 'ASUS (AsusWRT / Merlin)',
      wireguardSupport: 'Native in AsusWRT 388+ / Merlin',
      openvpnSupport: 'Native in all modern models',
      steps: [
        'Log in to Asus router web GUI at http://192.168.1.1 (or router.asus.com).',
        'Navigate to VPN -> VPN Server tab -> Select "WireGuard" (or "OpenVPN").',
        'Toggle "Enable WireGuard Server" to ON.',
        'Under "Client Management", click "+" to add a new client (Name: "CloudPrintWorker").',
        'Click "Apply all settings".',
        'Click the Export icon to download the .conf WireGuard configuration file.',
        'Navigate to LAN -> DHCP Server tab.',
        'Under "Manually Assigned IP around the DHCP list", find your HP LaserJet M126nw and assign a static LAN IP (e.g. 192.168.1.150). Click Apply.',
        'Upload the client .conf to the Cloud Print Worker environment.',
      ],
      ddns: 'Asus provides free built-in DDNS under WAN -> DDNS (e.g. yourname.asuscomm.com).',
      cgnatNote: 'If your WAN IP shows 100.64.0.0/10, your ISP uses CGNAT. You must request a public IP from your ISP or use a Cloudflare/Tailscale relay.',
    },
    openwrt: {
      brand: 'OpenWrt',
      wireguardSupport: 'Full native support via `luci-app-wireguard` and `wireguard-tools`',
      openvpnSupport: 'Supported via `luci-app-openvpn`',
      steps: [
        'SSH into your router or open LuCI web interface at http://192.168.1.1.',
        'Install WireGuard packages: `opkg update && opkg install luci-app-wireguard wireguard-tools`.',
        'Go to Network -> Interfaces -> Add new interface (Name: `wg0`, Protocol: `WireGuard VPN`).',
        'Generate private and public keys. Set IP e.g. 10.14.0.1/24, Listen Port: 51820.',
        'Add firewall rule: Network -> Firewall -> Traffic Rules -> Allow inbound UDP on port 51820.',
        'In the wg0 firewall zone, allow forwarding to and from the `lan` zone so the worker can reach the printer LAN IP.',
        'Navigate to Network -> DHCP and DNS -> Static Leases and assign static IP to printer (e.g. 192.168.1.150).',
        'Create a peer entry for the Cloud Worker (AllowedIPs: 10.14.0.2/32).',
      ],
      ddns: 'Supported via `luci-app-ddns` with DuckDNS, Cloudflare, No-IP, etc.',
      cgnatNote: 'If behind CGNAT, OpenWrt can also run Tailscale (`opkg install tailscale`) as a zero-config tunnel alternative.',
    },
    tplink: {
      brand: 'TP-Link (Archer / Deco)',
      wireguardSupport: 'Supported on Archer AX55, AX72, AX73, BE550, Deco X50/X55 with latest firmware',
      openvpnSupport: 'Supported on almost all Archer models',
      steps: [
        'Log in to http://tplinkwifi.net or 192.168.0.1.',
        'Go to Advanced -> VPN Server -> WireGuard (or OpenVPN).',
        'Toggle "Enable WireGuard".',
        'Click "Add" under Account List to create a peer for the cloud worker.',
        'Download the peer configuration file.',
        'Go to Advanced -> Network -> DHCP Server -> Address Reservation.',
        'Add the HP printer MAC address and reserve an IP (e.g. 192.168.0.150).',
        'Go to Advanced -> Network -> Dynamic DNS to configure TP-Link DDNS (free TP-Link ID).',
      ],
      ddns: 'Free TP-Link DDNS (*.tplinkdns.com).',
      cgnatNote: 'Check WAN Status: if WAN IP starts with 10.x, 100.64.x, or 172.16.x, you are behind CGNAT.',
    },
    glinet: {
      brand: 'GL.iNet',
      wireguardSupport: 'Built-in one-click WireGuard Server & Client',
      openvpnSupport: 'Built-in',
      steps: [
        'Log in to GL.iNet Admin Panel at http://192.168.8.1.',
        'Navigate to VPN -> WireGuard Server.',
        'Click "Start" to enable the server.',
        'Click "Profiles" -> "Add a New Profile" -> Enter name "CloudPrintWorker".',
        'Click the QR/Export button and copy or download the client configuration.',
        'Ensure "Allow Access Local Network" is toggled ON so the worker can route to the LAN IP.',
        'Go to Network -> Clients -> Locate HP LaserJet -> Click "Static IP" to reserve IP.',
      ],
      ddns: 'Built-in GIDDNS (*.glddns.com) out of the box.',
      cgnatNote: 'GoodNAT / Drop-in Gateway mode supported.',
    },
    generic: {
      brand: 'Generic / Other Router',
      wireguardSupport: 'Dependent on firmware. Check manufacturer specification.',
      openvpnSupport: 'Commonly supported.',
      steps: [
        'Check router manual or specifications for "VPN Server" (WireGuard or OpenVPN).',
        'If VPN server is supported: enable it, configure listening port (51820 for WG, 1194 for OVPN), and create a client profile.',
        'Ensure the VPN configuration permits routing to the local LAN subnet (e.g. 192.168.1.0/24).',
        'Set a DHCP reservation (static lease) for the HP LaserJet Pro MFP M126nw.',
        'Set up Dynamic DNS (DDNS) so the cloud worker can always locate your home/office WAN IP.',
        'If your router does NOT support a VPN server: see the "Low-Cost Hardware Gateway" alternative below (e.g. GL.iNet travel router or Raspberry Pi/Mini PC running WireGuard).',
      ],
      ddns: 'DuckDNS, No-IP, Dynu, or Cloudflare DNS.',
      cgnatNote: 'Verify with your ISP that your WAN interface has a publicly routable IPv4 address.',
    },
  };

  const selectedGuide = guides[brandKey] || guides.generic;

  res.json({
    success: true,
    guide: selectedGuide,
    allBrands: Object.keys(guides),
  });
}

export async function runDiagnostics(req: Request, res: Response): Promise<void> {
  const { printerIp, routerIp } = req.body;

  const diagnostics: Record<string, any> = {
    printerIpAnalysis: {},
    cgnatAnalysis: {},
    recommendations: [],
  };

  if (printerIp) {
    if (printerIp.startsWith('192.168.223.')) {
      diagnostics.printerIpAnalysis = {
        detectedType: 'HP Wi-Fi Direct SoftAP Subnet',
        isLanIp: false,
        warning:
          '192.168.223.1 is the factory default IP for HP Wi-Fi Direct (peer-to-peer wireless connection). It is NOT accessible through your router Wi-Fi network.',
        actionRequired:
          'Connect the HP M126nw to your home/office Wi-Fi router network using WPS or printer control panel. Then print a Configuration Report to find its real router-assigned IP (e.g. 192.168.1.x or 192.168.0.x).',
      };
      diagnostics.recommendations.push(
        'Change printer IP from 192.168.223.x to your router LAN subnet address.'
      );
    } else if (
      printerIp.startsWith('192.168.') ||
      printerIp.startsWith('10.') ||
      printerIp.startsWith('172.16.')
    ) {
      diagnostics.printerIpAnalysis = {
        detectedType: 'Private LAN IP',
        isLanIp: true,
        status: 'Valid private subnet address.',
      };
    } else {
      diagnostics.printerIpAnalysis = {
        detectedType: 'Public or Invalid IP',
        isLanIp: false,
        warning: 'Printer IP should be an internal private RFC1918 address (e.g. 192.168.x.x). Never expose port 631 publicly!',
      };
    }
  }

  res.json({
    success: true,
    diagnostics,
  });
}
