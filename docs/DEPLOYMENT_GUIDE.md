# Production Cloud Deployment Guide

This guide details the step-by-step production deployment for all components of the Remote PDF Printing System.

---

## Architecture Distribution

| Component | Recommended Host | Notes |
| :--- | :--- | :--- |
| **Frontend** | Vercel | Fast global CDN, React + Vite SPA |
| **Backend API** | Render / Railway / Fly.io / VPS | Node.js + Express REST API |
| **Database** | MongoDB Atlas | Free tier or Dedicated cluster |
| **PDF Storage** | Cloudflare R2 / AWS S3 | S3-compatible object storage with signed URLs |
| **Cloud Print Worker** | VPS (DigitalOcean / Hetzner / AWS EC2) | Independent 24/7 service running WireGuard tunnel |

---

## 1. MongoDB Atlas Setup

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Build a new M0 Free Cluster.
3. Under **Database Access**, create a user (e.g. `printer_admin`) with read/write privileges.
4. Under **Network Access**, add IP `0.0.0.0/0` (allow from anywhere) so cloud servers can connect.
5. In **Clusters** -> **Connect** -> **Connect your application**, copy your connection string:
   ```env
   MONGODB_URI=mongodb+srv://printer_admin:<password>@cluster0.abcde.mongodb.net/remote_printer_hub?retryWrites=true&w=majority
   ```

---

## 2. Cloudflare R2 / AWS S3 Storage Setup

### Option A: Cloudflare R2 (Recommended - Zero Egress Fees)
1. In Cloudflare Dashboard, go to **R2 Object Storage** -> **Create bucket** (name: `remote-printer-storage`).
2. Go to **Manage R2 API Tokens** -> **Create API token** with Object Read & Write permissions.
3. Note your:
   - Account ID
   - Access Key ID
   - Secret Access Key
4. Set backend environment variables:
   ```env
   STORAGE_TYPE=r2
   AWS_ACCESS_KEY_ID=<your_r2_access_key_id>
   AWS_SECRET_ACCESS_KEY=<your_r2_secret_access_key>
   AWS_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
   AWS_S3_BUCKET=remote-printer-storage
   AWS_REGION=auto
   ```

---

## 3. Cloud Backend API Deployment (e.g., Render / Railway)

### Deploying to Render
1. Create a new **Web Service** on Render connected to your Git repository.
2. Root directory: `backend`
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Environment Variables:
   ```env
   NODE_ENV=production
   PORT=5000
   MONGODB_URI=<your_atlas_connection_string>
   JWT_SECRET=<secure_random_64_character_hex_string>
   WORKER_API_KEY=<high_entropy_random_secret_token>
   STORAGE_TYPE=r2 (or s3 or local)
   CORS_ORIGIN=*
   ```
6. Copy your public backend URL (e.g., `https://printer-api.onrender.com`).

---

## 4. Frontend Deployment on Vercel

1. Log in to [Vercel](https://vercel.com) and import your Git repository.
2. Root directory: `frontend`
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Environment Variables:
   ```env
   VITE_API_URL=https://printer-api.onrender.com
   ```
7. Click **Deploy**. Vercel will assign a production domain (e.g., `https://airprint-hub.vercel.app`).

---

## 5. Cloud Print Worker Deployment (VPS / Docker Container)

The Cloud Print Worker must run independently on an always-on host with Linux network capabilities (`NET_ADMIN`) so it can establish the WireGuard VPN connection to your router.

### Deploying via Docker on a Linux VPS (DigitalOcean / Hetzner / Linode)

1. Connect to your VPS via SSH.
2. Clone your repository:
   ```bash
   git clone <your_repo_url>
   cd Printer/worker
   ```
3. Place your router-generated WireGuard client configuration in `/etc/wireguard/wg0.conf`:
   ```bash
   sudo mkdir -p /etc/wireguard
   sudo nano /etc/wireguard/wg0.conf
   # Paste your router client configuration
   sudo chmod 600 /etc/wireguard/wg0.conf
   ```
4. Test the WireGuard connection directly on the VPS:
   ```bash
   sudo wg-quick up wg0
   # Ping the printer LAN IP across the VPN
   ping 192.168.1.150
   sudo wg-quick down wg0
   ```
5. Create `.env` in `worker/`:
   ```env
   BACKEND_URL=https://printer-api.onrender.com
   WORKER_API_KEY=<same_worker_api_key_set_on_backend>
   WORKER_ID=cloud-worker-vps-1
   DEFAULT_PRINTER_IP=192.168.1.150
   GATEWAY_IP=10.14.0.1
   WIREGUARD_INTERFACE=wg0
   ```
6. Build and launch the container with `NET_ADMIN` capability:
   ```bash
   docker build -t printer-worker .
   docker run -d \
     --name printer-worker \
     --restart unless-stopped \
     --cap-add=NET_ADMIN \
     --cap-add=SYS_MODULE \
     -v /etc/wireguard/wg0.conf:/etc/wireguard/wg0.conf:ro \
     --env-file .env \
     printer-worker
   ```
7. Check logs:
   ```bash
   docker logs -f printer-worker
   ```

The worker is now connected 24/7, polling the backend queue and transmitting converted print jobs directly through the WireGuard VPN to your HP LaserJet!
