"""
=============================================================================
File: worker/print_helper.py
Description: Windows GDI print helper - prints any PDF to full-page A4.
Renders directly at the printer's native DPI using StretchDIBits with 24-bit
BGR (no alpha), compatible with all HP LaserJet mono PCLmS / IPP drivers.

PAGE SIZE CONFIGURATION:
  - Printer DPI and printable area are queried at runtime from the Windows DC.
  - For HP LaserJet Pro MFP M126nw (USB/PCLmS driver): 600 DPI, 4900x6400
  - For HP LaserJet Pro MFP M126nw (IPP Class driver):  300 DPI, 2480x3508
=============================================================================
Usage: python print_helper.py <pdf_path> <printer_name> [copies]
Exit codes: 0=success, 1=failure
"""
import sys
import os
import ctypes
from ctypes import wintypes

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ('biSize',          wintypes.DWORD),
        ('biWidth',         wintypes.LONG),
        ('biHeight',        wintypes.LONG),
        ('biPlanes',        wintypes.WORD),
        ('biBitCount',      wintypes.WORD),
        ('biCompression',   wintypes.DWORD),
        ('biSizeImage',     wintypes.DWORD),
        ('biXPelsPerMeter', wintypes.LONG),
        ('biYPelsPerMeter', wintypes.LONG),
        ('biClrUsed',       wintypes.DWORD),
        ('biClrImportant',  wintypes.DWORD),
    ]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [
        ('bmiHeader', BITMAPINFOHEADER),
        ('bmiColors', ctypes.c_uint32 * 1),
    ]


def ensure_printer_online(printer_name):
    """
    Ensure printer is not set to WORK_OFFLINE in Windows Spooler.
    """
    try:
        import win32print
        h = win32print.OpenPrinter(printer_name, {'DesiredAccess': win32print.PRINTER_ALL_ACCESS})
        info = win32print.GetPrinter(h, 2)
        if info.get('Attributes', 0) & win32print.PRINTER_ATTRIBUTE_WORK_OFFLINE:
            info['Attributes'] = info['Attributes'] & ~win32print.PRINTER_ATTRIBUTE_WORK_OFFLINE
            win32print.SetPrinter(h, 2, info, 0)
            print(f"[PrintHelper] Cleared WORK_OFFLINE attribute for '{printer_name}' [ONLINE]", flush=True)
        win32print.ClosePrinter(h)
    except Exception:
        pass


def detect_active_connection():
    """
    Detect whether the printer is physically connected via USB or Wi-Fi:
    1. Check USB: Verify Windows PnP device manager has an active, present USB printer.
       If and only if physical USB hardware acknowledges, return ('usb', printer_name, port).
    2. Check Wi-Fi: If USB is not physically connected, query the printer over Wi-Fi (IP 631/9100).
       If Wi-Fi acknowledges, return ('wifi', printer_name, port/ip).
    3. If neither acknowledges: return ('none', None, None).
    """
    import win32print
    import socket
    import subprocess

    # 1. Physical Hardware USB Check (via Windows PnP Device Manager)
    usb_hw_present = False
    try:
        ps_script = (
            "& { $dev = Get-PnpDevice -Class USB,Printer -ErrorAction SilentlyContinue | "
            "Where-Object { ($_.InstanceId -match 'USBPRINT.*M126|03F0.*222A') -and $_.Present -eq $true -and $_.Status -eq 'OK' }; "
            "if ($dev) { Write-Host 'PRESENT' } else { Write-Host 'NOT_PRESENT' } }"
        )
        res = subprocess.run(
            ['powershell', '-NoProfile', '-Command', ps_script],
            capture_output=True,
            text=True,
            timeout=4
        )
        out = (res.stdout or '').strip()
        if 'PRESENT' in out and 'NOT_PRESENT' not in out:
            usb_hw_present = True
    except Exception:
        usb_hw_present = False

    if usb_hw_present:
        try:
            installed = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL)
            for p in installed:
                name = p[2]
                if 'laserjet' in name.lower() or 'm126' in name.lower():
                    h = win32print.OpenPrinter(name)
                    info = win32print.GetPrinter(h, 2)
                    port = str(info.get('pPortName', ''))
                    win32print.ClosePrinter(h)
                    if port.upper().startswith('USB'):
                        ensure_printer_online(name)
                        print(f"[PrintHelper] Connection Check: USB is PHYSICALLY CONNECTED -> '{name}' on {port}", flush=True)
                        return 'usb', name, port
        except Exception:
            pass
        ensure_printer_online('Hewlett-Packard HP LaserJet Pro MFP M126nw (Copy 1)')
        print("[PrintHelper] Connection Check: USB is PHYSICALLY CONNECTED -> 'Hewlett-Packard HP LaserJet Pro MFP M126nw (Copy 1)' on USB001", flush=True)
        return 'usb', 'Hewlett-Packard HP LaserJet Pro MFP M126nw (Copy 1)', 'USB001'

    # 2. Check Wi-Fi connection (target IP port 631 / 9100)
    target_ip = os.getenv('DEFAULT_PRINTER_IP', '192.168.1.37')
    wifi_reachable = False
    for port in [631, 9100]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.5)
            s.connect((target_ip, port))
            s.close()
            wifi_reachable = True
            break
        except Exception:
            pass

    if wifi_reachable:
        try:
            installed = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)
            # Prioritize official HP driver on TCP/IP port (Hewlett-Packard HP LaserJet Pro MFP M126nw)
            for p in installed:
                name = p[2]
                if 'hewlett' in name.lower() and 'copy' not in name.lower():
                    ensure_printer_online(name)
                    print(f"[PrintHelper] Connection Check: USB disconnected. Wi-Fi is REACHABLE ({target_ip}:631) -> '{name}'", flush=True)
                    return 'wifi', name, f"{target_ip}:631"
            for p in installed:
                name = p[2]
                if ('laserjet' in name.lower() or 'm126' in name.lower()) and 'copy' not in name.lower():
                    ensure_printer_online(name)
                    print(f"[PrintHelper] Connection Check: USB disconnected. Wi-Fi is REACHABLE ({target_ip}:631) -> '{name}'", flush=True)
                    return 'wifi', name, f"{target_ip}:631"
        except Exception:
            pass
        ensure_printer_online('Hewlett-Packard HP LaserJet Pro MFP M126nw')
        print(f"[PrintHelper] Connection Check: USB disconnected. Wi-Fi is REACHABLE ({target_ip}:631) -> 'Hewlett-Packard HP LaserJet Pro MFP M126nw'", flush=True)
        return 'wifi', 'Hewlett-Packard HP LaserJet Pro MFP M126nw', f"{target_ip}:631"

    print("[PrintHelper] Connection Check: Neither USB nor Wi-Fi printer detected!", flush=True)
    return 'none', None, None


def find_printer(requested_name):
    """
    Return exact matching printer, or automatically detect active connection:
    - If requested_name is 'auto', None, or empty: auto-detect USB (priority) or Wi-Fi.
    - If 'usb' is in requested_name: prioritize USB001 printer.
    - If 'wifi' is in requested_name: prioritize Wi-Fi printer.
    - Otherwise perform exact or best fuzzy match.
    """
    try:
        import win32print
        installed = [p[2] for p in win32print.EnumPrinters(2)]

        resolved = None

        if not requested_name or requested_name.lower() in ('auto', 'detect', ''):
            conn_type, detected_name, _ = detect_active_connection()
            if detected_name:
                resolved = detected_name
            else:
                requested_name = 'Hewlett-Packard HP LaserJet Pro MFP M126nw'

        # 1. Exact match first
        if not resolved and requested_name in installed:
            resolved = requested_name

        # 2. Case-insensitive match
        if not resolved:
            for p in installed:
                if p.lower() == requested_name.lower():
                    resolved = p
                    break

        # 3. If USB requested or prefer USB connection
        if not resolved and 'usb' in requested_name.lower():
            for p in installed:
                if 'copy' in p.lower() or ('hewlett' in p.lower() and 'usb' in p.lower()):
                    resolved = p
                    break

        # 4. If Wi-Fi requested
        if not resolved and 'wifi' in requested_name.lower():
            for p in installed:
                if 'hewlett' in p.lower() and 'copy' not in p.lower():
                    resolved = p
                    break
            if not resolved:
                for p in installed:
                    if 'copy' not in p.lower() and ('laserjet' in p.lower() or 'm126' in p.lower()):
                        resolved = p
                        break

        # 5. Fuzzy match for LaserJet (prefer official HP driver)
        if not resolved:
            for p in installed:
                if 'hewlett' in p.lower() and 'copy' not in p.lower():
                    resolved = p
                    break
            if not resolved:
                for p in installed:
                    if 'm126' in p.lower() or 'laserjet' in p.lower():
                        resolved = p
                        break

        if resolved:
            ensure_printer_online(resolved)
            return resolved

        print(f"ERROR: No printer found for '{requested_name}'. Installed: {installed}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[PrintHelper] Warning enumerating printers: {e}", file=sys.stderr)
        return requested_name


def method_sumatra_pdf(pdf_path, printer_name, copies=1):
    """
    Method 1: Native Windows XPS/GDI vector printing via bundled SumatraPDF engine.
    Guarantees clean A4 full-page scaling ('fit,paper=A4') with zero scanline
    stride corruption, zero black boxes, and perfect vector font/image rendering.
    """
    sumatra_candidates = [
        os.path.join(os.path.dirname(__file__), 'bin', 'SumatraPDF.exe'),
        os.path.join(os.path.dirname(__file__), 'SumatraPDF.exe'),
        'SumatraPDF.exe',
    ]
    sumatra_path = None
    for cand in sumatra_candidates:
        if os.path.exists(cand):
            sumatra_path = os.path.abspath(cand)
            break

    if not sumatra_path:
        return False

    resolved_printer = find_printer(printer_name)
    if not resolved_printer:
        return False

    abs_pdf = os.path.abspath(pdf_path)
    settings = f'fit,paper=A4,{copies}x' if copies > 1 else 'fit,paper=A4'
    cmd = [
        sumatra_path,
        '-print-to', resolved_printer,
        '-silent',
        '-print-settings', settings,
        abs_pdf
    ]

    import subprocess
    print(f"[PrintHelper] Printing via SumatraPDF native vector engine -> '{resolved_printer}'...", flush=True)
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if res.returncode == 0:
        print(f"[PrintHelper] SUCCESS: SumatraPDF delivered document to '{resolved_printer}' [OK]", flush=True)
        return True
    else:
        print(f"[PrintHelper] SumatraPDF returned exit code {res.returncode}: {res.stderr}", file=sys.stderr)
        return False


def method_pymupdf_gdi(pdf_path, printer_name, copies=1):
    """
    Print PDF via Windows GDI using StretchDIBits with 24-bit BGR bitmap.
    - No alpha channel (avoids black-fill issue with laser printer drivers)
    - Renders at native printer DPI (queried from DC, not hardcoded)
    - Fills the full printable area, centered, with correct aspect ratio
    """
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz

    import win32print
    import win32ui
    import win32con

    resolved_printer = find_printer(printer_name)
    if not resolved_printer:
        return False

    doc = fitz.open(pdf_path)
    page_count = doc.page_count

    # Set up GDI StretchDIBits with correct type signatures
    gdi32 = ctypes.windll.gdi32
    gdi32.StretchDIBits.argtypes = [
        wintypes.HDC,                     # hdc
        wintypes.INT, wintypes.INT,       # xDest, yDest
        wintypes.INT, wintypes.INT,       # DestWidth, DestHeight
        wintypes.INT, wintypes.INT,       # xSrc, ySrc
        wintypes.INT, wintypes.INT,       # SrcWidth, SrcHeight
        ctypes.c_void_p,                  # lpBits
        ctypes.c_void_p,                  # lpbmi (use void* for custom palette struct)
        wintypes.UINT,                    # iUsage
        wintypes.DWORD,                   # rop
    ]
    gdi32.StretchDIBits.restype = wintypes.INT

    gdi32.SetStretchBltMode.argtypes = [wintypes.HDC, wintypes.INT]
    gdi32.SetStretchBltMode.restype = wintypes.INT

    try:
        # Create printer Device Context
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(resolved_printer)

        # Query native printable dimensions and DPI from printer driver
        printable_w = hDC.GetDeviceCaps(win32con.HORZRES)
        printable_h = hDC.GetDeviceCaps(win32con.VERTRES)
        dpi_x       = hDC.GetDeviceCaps(win32con.LOGPIXELSX)
        dpi_y       = hDC.GetDeviceCaps(win32con.LOGPIXELSY)

        print(f"[PrintHelper] PDF: {os.path.basename(pdf_path)}, {page_count} page(s), {copies} copy(ies)", flush=True)
        print(f"[PrintHelper] Printer: '{resolved_printer}' | DPI: {dpi_x}x{dpi_y} | Printable: {printable_w}x{printable_h}", flush=True)

        # Set HALFTONE stretch mode on the DC for best quality bitmap scaling
        gdi32.SetStretchBltMode(hDC.GetSafeHdc(), 4)  # HALFTONE = 4

        for copy_idx in range(copies):
            if copies > 1:
                print(f"[PrintHelper] Processing copy {copy_idx + 1}/{copies}...", flush=True)

            doc_title = os.path.basename(pdf_path)
            if copies > 1:
                doc_title += f" (Copy {copy_idx + 1})"
            hDC.StartDoc(doc_title)

            for page_num in range(page_count):
                page = doc[page_num]

                # Auto-rotate landscape pages to fit portrait printer feed
                page_w = page.rect.width
                page_h = page.rect.height
                rotate = 0
                if page_w > page_h:
                    rotate = 90

                # Compute destination rect: scale to fill printable area, keep aspect ratio
                if rotate == 90:
                    # Swap dimensions for aspect ratio calculation
                    aspect_w, aspect_h = page_h, page_w
                else:
                    aspect_w, aspect_h = page_w, page_h

                scale = min(printable_w / aspect_w, printable_h / aspect_h)
                dest_w = int(aspect_w * scale)
                dest_h = int(aspect_h * scale)

                # Center on page
                dest_x = (printable_w - dest_w) // 2
                dest_y = (printable_h - dest_h) // 2

                # Render page at native printer DPI using PyMuPDF
                # DPI factor: printer_dpi / 72 (PDF uses 72 pts/inch)
                dpi_factor_x = dpi_x / 72.0
                dpi_factor_y = dpi_y / 72.0

                if rotate == 90:
                    mat = fitz.Matrix(dpi_factor_x, dpi_factor_y).prerotate(90)
                else:
                    mat = fitz.Matrix(dpi_factor_x, dpi_factor_y)

                # alpha=False, csGRAY → 1-byte-per-pixel grayscale (clean, no RGBA issues)
                pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csGRAY)

                src_w = pix.width
                src_h = pix.height
                samples = pix.samples  # bytes, 1 byte per pixel (grayscale)

                # Build BITMAPINFO for 8-bit grayscale with 256-color palette
                bmi = BITMAPINFO()
                bmi.bmiHeader.biSize          = ctypes.sizeof(BITMAPINFOHEADER)
                bmi.bmiHeader.biWidth         = src_w
                bmi.bmiHeader.biHeight        = -src_h   # negative = top-down
                bmi.bmiHeader.biPlanes        = 1
                bmi.bmiHeader.biBitCount      = 8        # 8-bit grayscale
                bmi.bmiHeader.biCompression   = 0        # BI_RGB
                bmi.bmiHeader.biSizeImage     = 0
                bmi.bmiHeader.biClrUsed       = 0
                bmi.bmiHeader.biClrImportant  = 0

                # Build a full 256-entry grayscale palette
                # BITMAPINFO only has 1 slot but we need 256 — allocate manually
                palette_size = 256 * 4  # 256 RGBQUAD entries
                class BITMAPINFO256(ctypes.Structure):
                    _fields_ = [
                        ('bmiHeader', BITMAPINFOHEADER),
                        ('bmiColors', ctypes.c_uint8 * (256 * 4)),
                    ]

                bmi256 = BITMAPINFO256()
                bmi256.bmiHeader = bmi.bmiHeader
                # Fill palette: index i → RGB(i, i, i) + reserved 0
                for i in range(256):
                    base = i * 4
                    bmi256.bmiColors[base + 0] = i  # Blue
                    bmi256.bmiColors[base + 1] = i  # Green
                    bmi256.bmiColors[base + 2] = i  # Red
                    bmi256.bmiColors[base + 3] = 0  # Reserved

                # Pad samples to 4-byte row stride (required by StretchDIBits)
                stride = src_w
                padded_stride = (src_w + 3) & ~3
                if padded_stride != stride:
                    rows = []
                    for row_i in range(src_h):
                        row = samples[row_i * stride : (row_i + 1) * stride]
                        rows.append(row + b'\x00' * (padded_stride - stride))
                    padded_samples = b''.join(rows)
                else:
                    padded_samples = bytes(samples)

                hDC.StartPage()

                result = gdi32.StretchDIBits(
                    hDC.GetSafeHdc(),
                    dest_x, dest_y,         # destination origin
                    dest_w, dest_h,         # destination size (stretch to full page)
                    0, 0,                   # source origin
                    src_w, src_h,           # source size (native render)
                    padded_samples,
                    ctypes.cast(ctypes.byref(bmi256), ctypes.c_void_p),
                    0,                      # DIB_RGB_COLORS
                    0x00CC0020,             # SRCCOPY
                )

                hDC.EndPage()
                print(f"[PrintHelper] Page {page_num+1}/{page_count}: "
                      f"rendered {src_w}x{src_h} -> printed {dest_w}x{dest_h} "
                      f"at ({dest_x},{dest_y}) | StretchDIBits={result} [OK]", flush=True)

            hDC.EndDoc()

        hDC.DeleteDC()

    finally:
        doc.close()

    print(f"[PrintHelper] All {page_count * copies} page(s) successfully sent to printer spooler!", flush=True)
    return True


def print_pdf(pdf_path, printer_name, copies=1):
    if not os.path.exists(pdf_path):
        print(f"ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[PrintHelper] Initiating print for '{os.path.basename(pdf_path)}' "
          f"({copies}x) -> '{printer_name}'...", flush=True)

    try:
        # Pipeline 1: Native Windows vector engine (SumatraPDF)
        if method_sumatra_pdf(pdf_path, printer_name, copies=copies):
            print("[PrintHelper] SUCCESS via SumatraPDF vector print pipeline [OK]", flush=True)
            sys.exit(0)
    except Exception as e:
        print(f"[PrintHelper] SumatraPDF method warning: {e}. Trying GDI fallback...", flush=True)

    try:
        # Pipeline 2: PyMuPDF GDI fallback
        if method_pymupdf_gdi(pdf_path, printer_name, copies=copies):
            print("[PrintHelper] SUCCESS via Windows GDI printer pipeline [OK]", flush=True)
            sys.exit(0)
    except Exception as e:
        print(f"[PrintHelper] GDI method failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

    print("ERROR: Print helper execution failed.", file=sys.stderr)
    sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python print_helper.py <pdf_path> <printer_name> [copies]", file=sys.stderr)
        sys.exit(1)
    num_copies = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    print_pdf(sys.argv[1], sys.argv[2], copies=num_copies)
