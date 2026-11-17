# Router VPN Setup and Network Architecture Guide

This guide details how to configure your home or office Wi-Fi router as a secure VPN gateway for the Remote PDF Printing System.

---

## 1. Network Architecture Overview

```
[ User Anywhere on Mobile / Web ]
                 |  HTTPS
                 v
   [ Vercel Frontend Web App ]
                 |  REST API
                 v
       [ Cloud Backend API ]
                 |  Queue / Events
                 v
     [ Cloud Print Worker ]  <-- Independent 24/7 Cloud Service (e.g., VPS / Docker)
                 |
        =================== WireGuard VPN Tunnel ===================
                 |  UDP 51820 (Encrypted, Private)
                 v
       [ Wi-Fi Router Gateway ]  <-- Runs WireGuard Server & DDNS
                 |
                 |  Internal LAN (192.168.1.0/24)
                 |  Port 631 (IPP - Internet Printing Protocol)
                 v
   [ HP LaserJet Pro MFP M126nw ]  <-- Physical Printer (Static LAN IP)
```

### Critical Security Rule
- **Never expose IPP port 631 to the public internet via router Port Forwarding.**
- All communication between the Cloud Worker and the printer happens strictly inside the encrypted WireGuard VPN tunnel.

---

## 2. IP Address Disambiguation: Wi-Fi Direct vs Router LAN IP

### The `192.168.223.1` Trap
- `192.168.223.1` is the factory default IP of the printer's **Wi-Fi Direct SoftAP**.
- In Wi-Fi Direct mode, the printer acts as its own autonomous wireless access point for peer-to-peer laptop connections.
- **This IP is NOT accessible through your router's Wi-Fi network or through a VPN.**

### How to Find and Verify the Real LAN IP
1. Ensure the printer's Wireless LED is solid blue (indicating it is connected to your router's Wi-Fi network).
2. On the printer control panel:
   - Press the **Setup** (Wrench) button.
   - Use the arrow keys to find **Network Setup** and press **OK**.
   - Select **Print Report** -> **Network Configuration Page** and press **OK**.
3. Locate the **IPv4 Address** on the printed sheet (e.g., `192.168.1.150` or `192.168.0.45`).
4. This router-assigned address is the **LAN IP** you must configure in the Admin Dashboard.

---

## 3. Router DHCP Reservation (Static Lease)

To ensure the router never changes the printer's IP address:
1. Open your router web management page (typically `http://192.168.1.1` or `http://192.168.0.1`).
2. Navigate to **LAN** -> **DHCP Server** -> **Address Reservation** (or **Static Leases**).
3. Find your printer by its MAC address (listed on the Network Configuration Page).
4. Assign a fixed IP, such as `192.168.1.150`.
5. Save and apply settings.

---

## 4. Router-Specific WireGuard Server Setup

### A. ASUS Routers (AsusWRT 388+ / AsusWRT-Merlin)
1. Log in to Asus router web GUI at `http://router.asus.com`.
2. Navigate to **VPN** -> **VPN Server** tab -> Select **WireGuard**.
3. Toggle **Enable WireGuard Server** to **ON**.
4. Set Server Port to `51820` (default).
5. Under **Client Management**, click `+` to add a client:
   - Client Name: `CloudPrintWorker`
   - Allowed IPs: `10.14.0.2/32`
6. Click **Apply all settings**.
7. Click the **Export** icon next to the client profile to download the client `.conf` file.
8. Ensure **Allow Client to Access LAN** is enabled.

### B. OpenWrt Routers
1. SSH into the router or access the LuCI web interface.
2. Install packages:
   ```bash
   opkg update
   opkg install luci-app-wireguard wireguard-tools
   ```
3. In LuCI: **Network** -> **Interfaces** -> **Add New Interface**:
   - Name: `wg0`
   - Protocol: `WireGuard VPN`
4. Set IP: `10.14.0.1/24`, Port: `51820`.
5. Under **Firewall Settings**, create a firewall rule allowing inbound UDP traffic on port `51820`.
6. Under firewall zone forwardings, allow traffic from `wg0` to `lan`.
7. Add Peer for the Cloud Worker:
   - Peer Public Key: `<WORKER_PUBLIC_KEY>`
   - Allowed IPs: `10.14.0.2/32`

### C. TP-Link Routers (Archer AX55, AX72, BE550, Deco X50)
1. Go to `http://tplinkwifi.net`.
2. Navigate to **Advanced** -> **VPN Server** -> **WireGuard**.
3. Check **Enable WireGuard**.
4. Click **Add** under Account List to generate a peer profile for the Cloud Worker.
5. Download the configuration file.
6. Enable **Allow Access Local Network**.

### D. GL.iNet Routers (Flint, Beryl, Slate)
1. Open GL.iNet admin panel at `http://192.168.8.1`.
2. Go to **VPN** -> **WireGuard Server** -> Click **Start**.
3. Go to **Profiles** -> **Add a New Profile** (`CloudPrintWorker`).
4. Ensure **Allow Access Local Network** is checked.
5. Export the client configuration.

---

## 5. Dynamic DNS (DDNS) Configuration

If your ISP assigns a dynamic WAN IP that changes periodically:
1. Enable DDNS in your router settings.
2. **Asus**: Provides free `*.asuscomm.com` DDNS under **WAN** -> **DDNS**.
3. **TP-Link**: Provides free `*.tplinkdns.com` under **Advanced** -> **Network** -> **Dynamic DNS**.
4. **Third-Party Providers**: Use DuckDNS, No-IP, Dynu, or Cloudflare DNS.
5. Use this hostname in your WireGuard client configuration:
   ```ini
   Endpoint = your-home.asuscomm.com:51820
   ```

---

## 6. CGNAT (Carrier-Grade NAT) Limitations & Alternatives

### How to Check for CGNAT
1. Check your router's WAN IPv4 address in its status page.
2. If the WAN IP begins with `100.64.x.x` through `100.127.x.x`, `10.x.x.x`, or `172.16.x.x`, your ISP is using CGNAT.
3. Compare the WAN IP in your router status with what `https://ifconfig.me` displays. If they differ, you are behind CGNAT.

### Solutions if Behind CGNAT
- **Option 1 (Recommended)**: Call your ISP and request a **Public Static IPv4 Address** (often available for a small monthly fee or for gaming/CCTV requests).
- **Option 2 (Hardware Relay)**: If your router cannot receive inbound WireGuard connections, run a lightweight zero-tier gateway (such as Tailscale or Cloudflare Tunnel) on a low-power home device (Raspberry Pi, old Android phone, or small GL.iNet travel router plugged into your main router).
