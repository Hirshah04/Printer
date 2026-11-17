# Remote Wi-Fi PDF Printing System (AirPrint Hub)

A production-grade, end-to-end **Remote PDF Printing System** that enables users to upload PDF documents from anywhere in the world and physically print them on a home or office printer (specifically targeted and optimized for the **HP LaserJet Pro MFP M126nw**) through a secure router-hosted VPN tunnel.

---

## 1. System Architecture

```
                    [ USER DEVICE ]
              (Smartphone, Laptop, Tablet)
                           |
                           | 1. Uploads PDF (HTTPS)
                           v
            [ VERCEL WEB APPLICATION (SPA) ]
          (React 18, Vite, TypeScript, Tailwind CSS)
                           |
                           | 2. Authenticated REST API
                           v
               [ CLOUD BACKEND API ]
           (Node.js, Express, MongoDB Atlas,
             Cloudflare R2 / AWS S3 Storage)
                           |
                           | 3. High-concurrency Print Job Queue
                           v
              [ CLOUD PRINT WORKER ]
             (Runs 24/7 on Cloud VPS)
             - Downloads PDF from S3/R2
             - Converts PDF -> PCLm Raster
                           |
                           | 4. WireGuard VPN (Encrypted UDP 51820)
                           v
          [ WI-FI ROUTER / VPN SERVER ]
            (Asus / OpenWrt / TP-Link / GL.iNet)
                           |
                           | 5. Internal Private Subnet (192.168.1.0/24)
                           |    IPP Protocol (Port 631, /ipp/printer)
                           v
          [ HP LASERJET PRO MFP M126nw ]
                           |
                           | 6. Mechanical Print
                           v
              [ PHYSICAL PRINT OUTPUT ]
```

---

## 2. Key Architecture Principles

- **Zero Host PC Dependency**: Your laptop or desktop does **NOT** need to remain running or awake. The system runs 24/7 in the cloud.
- **No HP ePrint / No Email Printing**: Does not rely on deprecated HP ePrint or insecure email gateways.
- **Private & Secure IPP**: The printer's IPP port `631` is **never exposed** to the public internet. Communication occurs solely through the router's private WireGuard VPN tunnel.
- **Dedicated PCLm Converter Engine**: The HP LaserJet Pro MFP M126nw rejects direct `application/pdf`. The cloud worker converts PDFs into standard `application/PCLm` (using native Ghostscript rasterization) at 300 DPI for crisp laser output.
- **Wi-Fi Direct Disambiguation**: Intelligently detects and warns against using `192.168.223.1` (the printer's peer-to-peer SoftAP IP) and guides users to assign a router LAN IP (e.g. `192.168.1.150`).
- **Verified Completion Status**: Tracks IPP job attributes until the printer reports physical completion. If the printer hardware does not support terminal job query, the system reports `"Printer accepted job; completion not confirmed"` to avoid false success.

---

## 3. Project Structure

```
Printer/
├── backend/                  # Node.js + Express + TypeScript Backend API
│   ├── src/
│   │   ├── config/          # Environment, MongoDB, and Storage configuration
│   │   ├── controllers/     # Auth, Printers, Jobs, Workers, Network, Admin
│   │   ├── middleware/      # JWT Auth, Multer PDF Upload, Rate Limit, Errors
│   │   ├── models/          # User, Printer, PrintJob, Worker, SystemLog, NetworkConfig
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # IPP, PDF inspection, Storage (S3/R2/local), Queue
│   │   └── index.ts         # Server entry point
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── worker/                   # Standalone Cloud Print Worker Service
│   ├── src/
│   │   ├── config/          # Worker configuration
│   │   ├── converter/       # PDF to PCLm / raster converter (Ghostscript)
│   │   ├── ipp/             # IPP client, status poller, job submitter
│   │   ├── vpn/             # WireGuard / OpenVPN health monitor
│   │   ├── queue/           # Job consumer (BullMQ / REST polling fallback)
│   │   └── index.ts         # Worker daemon entry point
│   ├── wireguard/           # Sample WireGuard client configurations
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile           # Multi-stage with WireGuard tools and Ghostscript
├── frontend/                 # React 18 + Vite + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/      # UI components (Navbar, Modal, StatusBadge, etc.)
│   │   ├── context/         # AuthContext
│   │   ├── pages/           # Dashboard, Print, History, Admin, NetworkSetup
│   │   ├── services/        # Axios API client
│   │   └── types/           # TypeScript interfaces
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── docs/                     # Deep Architectural Documentation
│   ├── ROUTER_VPN_SETUP.md  # Detailed router setup (WireGuard, DDNS, Asus, OpenWrt)
│   ├── HP_M126NW_GUIDE.md    # IPP, PCLm, Wi-Fi Direct vs LAN IP diagnostic
│   ├── DEPLOYMENT_GUIDE.md  # Vercel, Cloud Worker (VPS/Docker), S3/R2, MongoDB
│   └── API_DOCUMENTATION.md # Complete REST API reference
├── docker-compose.yml        # Multi-service local orchestrator
└── README.md
```

---

## 4. Quick Start (Local Development)

### Prerequisites
- Node.js 18+ or 20+
- npm 9+
- (Optional) Ghostscript for local PCLm conversion (`choco install ghostscript` on Windows or `apt install ghostscript` on Linux)
- (Optional) Docker for full stack compose

### 1. Backend Setup
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```
Backend API will start on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Frontend will be accessible at `http://localhost:5173`.

### 3. Worker Setup
```bash
cd worker
cp .env.example .env
npm install
npm run dev
```

---

## 5. Docker Orchestration

You can spin up the whole ecosystem (MongoDB, Backend, Worker, and Frontend) with:

```bash
docker-compose up --build
```

---

## 6. The Final Acceptance Test Checklist

The project is considered fully validated when this test is carried out:

1. **Printer Connected**: The HP LaserJet Pro MFP M126nw is turned on and connected to your home router Wi-Fi with a reserved LAN IP (e.g., `192.168.1.150`).
2. **Cloud Worker Running**: The Cloud Print Worker container is running on a cloud VPS with its WireGuard interface `wg0` active.
3. **Laptop Switched OFF**: Your personal laptop/desktop is completely powered down.
4. **Different Network**: You connect your phone or remote device to cellular 4G/5G or a completely separate Wi-Fi network.
5. **Web Portal**: Open the deployed Vercel web URL.
6. **Upload & Print**: Select an A4 PDF document and click **Print Document Now**.
7. **Execution**: The Cloud Worker retrieves the job, converts it to PCLm, routes it through the WireGuard VPN to `192.168.1.150:631`, and the printer physically prints the document.
8. **Status Verified**: The web portal displays the verified `COMPLETED` status with evidence from printer telemetry.
