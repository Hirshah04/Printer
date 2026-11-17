# HP LaserJet Pro MFP M126nw Technical Guide

This document contains hardware specifications, IPP capabilities, and format conversion details specifically for the **HP LaserJet Pro MFP M126nw**.

---

## 1. Hardware Specifications

- **Device Name**: HP LaserJet Pro MFP M126nw
- **Device Type**: Monochrome Laser All-in-One Printer, Scanner, Copier
- **Print Technology**: Laser
- **Print Resolution**: Up to 600 x 600 dpi (HP FastRes 1200)
- **Standard Media Size**: A4 (210 x 297 mm), Letter (8.5 x 11 in), Legal, Envelopes
- **Recommended Default Media**: A4
- **Connectivity**: 10/100 Ethernet (RJ45), 802.11b/g/n Wi-Fi, USB 2.0
- **Supported Network Protocols**: IPP, LPD, RAW Port 9100, WSD, mDNS / Bonjour, SNMP

---

## 2. IPP (Internet Printing Protocol) Profile

When queried via IPP `Get-Printer-Attributes` on port `631`:

- **IPP Endpoint**: `/ipp/printer`
- **Supported IPP Versions**: `1.0`, `1.1`, `2.0`
- **Supported Document Formats**:
  - `application/PCLm`
  - `application/octet-stream`
  - `image/jpeg`
  - `image/urf` (Apple AirPrint URF raster)
- **Direct PDF (`application/pdf`)**: **NOT SUPPORTED**

### Why Raw PDF Fails
The HP LaserJet Pro MFP M126nw is a host-based / raster printer that lacks an onboard Adobe PostScript or native PDF rendering engine.
If you send raw `application/pdf` bytes to the printer over IPP:
1. The IPP spooler rejects the job with `client-error-document-format-not-supported`, or
2. The printer prints pages containing raw binary characters or error text.

---

## 3. The PCLm Conversion Solution

### What is PCLm?
PCLm (PCLm / PCLmS) is a lightweight, rasterized PDF subset developed by the Wi-Fi Alliance and Mopria Alliance for mobile and driverless printing.
In PCLm:
- Pages are converted to raster bitmaps (300 or 600 DPI).
- Bitmaps are compressed using standard JPEG or Flate compression.
- The compressed raster strips are wrapped in a strictly formatted PDF container that matches PCLm specification 1.0.

### Conversion Pipeline
The Cloud Print Worker automatically converts uploaded PDFs into PCLm using Ghostscript:

```bash
gs -sDEVICE=pclm \
   -r300 \
   -sPAPERSIZE=a4 \
   -dPDFFitPage \
   -dNOPAUSE \
   -dBATCH \
   -dQUIET \
   -sOutputFile=output.pclm \
   input.pdf
```

This guarantees 100% crisp laser printing at 300 DPI fitted to A4 paper.

---

## 4. IPP Print-Job Submission Syntax

When submitting the job to the printer over the WireGuard tunnel:

```javascript
const msg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'remote-print-worker',
    'job-name': 'document.pdf',
    'document-format': 'application/PCLm'
  },
  'job-attributes-tag': {
    'copies': 1,
    'media': 'iso_a4_210x297mm',
    'sides': 'one-sided',
    'orientation-requested': 3 // 3 = Portrait, 4 = Landscape
  },
  data: pclmBuffer
};
```

---

## 5. Hardware Troubleshooting & Factory Diagnostics

### How to Print the Network Configuration Report
1. On the printer control panel, press the **Setup** (Wrench) icon.
2. Press the Right Arrow until **Network Setup** is displayed. Press **OK**.
3. Press the Right Arrow until **Print Report** is displayed. Press **OK**.
4. Press **OK** on **Network Configuration Page**.
5. The printer will print two pages detailing its MAC address, active IP address, gateway, and Wi-Fi SSID.

### Disabling Wi-Fi Direct to Avoid Confusion
If you do not need laptop peer-to-peer printing, you can disable Wi-Fi Direct:
1. Press the **Setup** button.
2. Select **Network Setup** -> **Wireless Direct** -> **Off**.
3. This turns off the `192.168.223.1` interface and ensures all connections use your router's Wi-Fi network.
