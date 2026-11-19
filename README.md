# Remote Wi-Fi PDF Printing System (AirPrint Hub)

A streamlined, production-grade **Remote PDF Printing System** engineered specifically to print to an **HP LaserJet Pro MFP M126nw** at IP `192.168.1.37` from anywhere in the world.

---

## 1. Simplified Architecture (No Database, No Login Required)

- **Target Printer**: HP LaserJet Pro MFP M126nw at `192.168.1.37:631/ipp/printer`.
- **Zero Database Setup**: Uses a fast, persistent file-backed store (`data/jobs.json`). No MongoDB Atlas or external database required.
- **Zero Authentication Overhead**: No registration or login screens. Any user opening the web URL can immediately upload and print.
- **Exactly Two Pages**:
  1. **Print Document**: Drag-and-drop PDF upload, page count/size inspection, copies (1-100), paper size (A4/Letter), orientation, print trigger button, and live execution stepper.
  2. **History**: Searchable table of submitted documents, date/time, page counts, copies, status badge, full lifecycle drawer, and manual retry button.
- **No Host PC Dependency**: Works when your personal laptop/desktop is completely switched off.
- **Dedicated PCLm Converter**: The HP LaserJet M126nw rejects direct `application/pdf`. The cloud worker converts PDFs into standard `application/PCLm` raster via Ghostscript for crisp laser output.
- **Secure Router VPN**: Printer port 631 is **never exposed** to the public internet. Communication occurs solely through the router's private WireGuard VPN tunnel.

---

## 2. System Flow (Hybrid Cloud + Local Worker Architecture)

```
                      [ ANY USER DEVICE ]
                 (Mobile Phone, Tablet, Laptop)
                              |
                              | 1. Uploads PDF (HTTPS)
                              v
               [ VERCEL WEB APPLICATION (SPA) ]
             (React 18, Vite, TypeScript, Tailwind CSS)
             - Page 1: Print Document
             - Page 2: History
                              |
                              | 2. REST API (No Auth Wall)
                              v
                  [ CLOUD BACKEND API ]
              (Node.js, Express, File-backed JSON Store)
                              |
                              | 3. Print Job Queue
                              v
                 [ CLOUD PRINT WORKER ]
             (Runs 24/7 on Cloud VPS / Docker)
             - Downloads PDF
             - Converts PDF -> PCLm Raster (300 DPI)
                              |
                              | 4. WireGuard VPN (Encrypted UDP 51820)
                              v
             [ WI-FI ROUTER / VPN SERVER ]
                              |
                              | 5. Internal LAN: 192.168.1.37:631
                              |    IPP Protocol (/ipp/printer)
                              v
             [ HP LASERJET PRO MFP M126nw ]
                              |
                              | 6. Mechanical Output
                              v
                 [ PHYSICAL PRINTED SHEET ]
```

---

## 3. How to Run (Local Worker + Cloud Stack)

### 1. Start Local Print Worker (on your PC connected to printer Wi-Fi)
Simply double-click `start-worker.bat` or run:
```cmd
.\start-worker.bat
```
The script will:
- Check for Node.js and Python.
- Auto-install `pymupdf`, `pywin32`, and `pillow` if not present.
- Connect to your Render backend (`https://printer-8bki.onrender.com`).
- Stream status and wait for incoming print jobs.

### 2. Print Documents
Open your Vercel deployment URL (or `cd frontend && npm run dev` locally). Drag & drop any single page or multi-page PDF and click **Print**. The local worker will receive the job and print it immediately to your HP LaserJet Pro MFP M126nw!

---

## 4. Docker Orchestration

Run the entire stack with Docker Compose:

```bash
docker-compose up --build
```

---

## 5. Verification Checklist

1. **Printer Ready**: HP LaserJet M126nw is turned on and assigned `192.168.1.37` on your router Wi-Fi.
2. **Cloud Worker Active**: Worker is running on your VPS with WireGuard connected to your router.
3. **Laptop Powered OFF**: Switch off your personal computer completely.
4. **Mobile Phone on 4G/5G**: Open the Vercel web URL on your phone browser.
5. **Print**: Upload a PDF and click **Print Document Now**.
6. **Result**: Cloud worker renders PCLm, tunnels to `192.168.1.37:631`, and the printer physically prints your document!
