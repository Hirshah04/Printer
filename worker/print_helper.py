"""
=============================================================================
File: worker/print_helper.py
Description: Windows GDI print helper - prints any PDF to 200% Full-Page A4.
Scales document height and width to the maximum 600 DPI size of A4 paper.

PAGE SIZE DEFINITION (Standard ISO A4 @ 600 DPI / 200% Scale):
  - Physical Paper Dimensions : 210mm x 297mm (8.267in x 11.693in)
  - 100% Base Printable Width  : 2480 pixels (at 300 DPI)
  - 100% Base Printable Height : 3508 pixels (at 300 DPI)
  - 200% Full-Page Width      : 4960 dots   (at 600 DPI)
  - 200% Full-Page Height     : 7016 dots   (at 600 DPI)
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

# =============================================================================
# A4 FULL-PAGE 200% SCALING CONFIGURATION
# =============================================================================
# The HP LaserJet Pro MFP M126nw hardware operates at 600 DPI.
# When DC reports 300 DPI (2480x3508), scaling by 200% (2.0x) outputs
# 4960 x 7016 dots, covering the 100% full A4 paper sheet edge-to-edge.
SCALE_FACTOR = float(os.getenv('PRINT_SCALE', '2.0'))  # 200% scale


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ('biSize', wintypes.DWORD),
        ('biWidth', wintypes.LONG),
        ('biHeight', wintypes.LONG),
        ('biPlanes', wintypes.WORD),
        ('biBitCount', wintypes.WORD),
        ('biCompression', wintypes.DWORD),
        ('biSizeImage', wintypes.DWORD),
        ('biXPelsPerMeter', wintypes.LONG),
        ('biYPelsPerMeter', wintypes.LONG),
        ('biClrUsed', wintypes.DWORD),
        ('biClrImportant', wintypes.DWORD),
    ]


def find_printer(printer_name):
    """Find exact or best matching installed Windows printer name."""
    try:
        import win32print
        installed = [p[2] for p in win32print.EnumPrinters(2)]
        if printer_name in installed:
            return printer_name

        # Case-insensitive match
        for p in installed:
            if p.lower() == printer_name.lower():
                return p

        # Substring / fuzzy match
        for p in installed:
            if "laserjet" in p.lower() or "m126" in p.lower():
                print(f"[PrintHelper] Matched printer '{p}' for requested '{printer_name}'", flush=True)
                return p

        print(f"ERROR: Printer '{printer_name}' not found. Available: {installed}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[PrintHelper] Warning enumerating printers: {e}", file=sys.stderr)
        return printer_name


def method_pymupdf_gdi(pdf_path, printer_name, copies=1):
    """Render PDF pages scaled to 200% for full A4 paper coverage (4960x7016)."""
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
    print(f"[PrintHelper] PDF has {page_count} page(s), printing {copies}x copy(ies) at 200% scale to '{resolved_printer}'...", flush=True)

    gdi32 = ctypes.windll.gdi32
    gdi32.StretchDIBits.argtypes = [
        wintypes.HDC,
        wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT,
        wintypes.INT, wintypes.INT, wintypes.INT, wintypes.INT,
        ctypes.c_char_p,
        ctypes.POINTER(BITMAPINFOHEADER),
        wintypes.UINT,
        wintypes.DWORD
    ]
    gdi32.StretchDIBits.restype = wintypes.INT

    try:
        # Create printer Device Context
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(resolved_printer)

        # Base printable area reported by DC (300 DPI base: 2480 x 3508)
        base_w = hDC.GetDeviceCaps(win32con.HORZRES) or 2480
        base_h = hDC.GetDeviceCaps(win32con.VERTRES) or 3508

        # Target 200% full-page dimensions (4960 x 7016 @ 600 DPI engine)
        printable_w = int(base_w * SCALE_FACTOR)
        printable_h = int(base_h * SCALE_FACTOR)

        print(f"[PrintHelper] Target Paper: Full A4 @ 200% Scale ({printable_w} x {printable_h} dots)", flush=True)

        for copy_idx in range(copies):
            if copies > 1:
                print(f"[PrintHelper] Processing copy {copy_idx + 1} of {copies}...", flush=True)

            doc_title = f"{os.path.basename(pdf_path)}" + (f" (Copy {copy_idx + 1})" if copies > 1 else "")
            hDC.StartDoc(doc_title)

            for page_num in range(page_count):
                page = doc[page_num]

                # Auto-rotate landscape documents so they fit the printer's portrait paper feed
                if page.rect.width > page.rect.height:
                    page.set_rotation((page.rotation + 90) % 360)

                page_w = page.rect.width
                page_h = page.rect.height

                # Compute scale to fill the full A4 printable area at 200%
                scale_x = printable_w / page_w
                scale_y = printable_h / page_h
                scale = min(scale_x, scale_y)

                dest_w = int(page_w * scale)
                dest_h = int(page_h * scale)

                # Center on A4 paper
                dest_x = (printable_w - dest_w) // 2
                dest_y = (printable_h - dest_h) // 2

                # Render source bitmap at 300 DPI (2480x3508) for optimal buffer performance
                render_w = int(dest_w / SCALE_FACTOR)
                render_h = int(dest_h / SCALE_FACTOR)
                mat = fitz.Matrix(render_w / page_w, render_h / page_h)
                pix = page.get_pixmap(matrix=mat, alpha=True)

                pix_w, pix_h = pix.width, pix.height
                samples = pix.samples

                # Build 32-bit top-down BITMAPINFOHEADER
                bmi = BITMAPINFOHEADER()
                bmi.biSize = 40
                bmi.biWidth = pix_w
                bmi.biHeight = -pix_h
                bmi.biPlanes = 1
                bmi.biBitCount = 32
                bmi.biCompression = 0
                bmi.biSizeImage = len(samples)

                hDC.StartPage()

                # Hardware stretch from (pix_w x pix_h) to 200% full-page (dest_w x dest_h)
                scanlines = gdi32.StretchDIBits(
                    hDC.GetSafeHdc(),
                    dest_x, dest_y, dest_w, dest_h,
                    0, 0, pix_w, pix_h,
                    samples,
                    ctypes.byref(bmi),
                    0,
                    0x00CC0020  # SRCCOPY
                )

                hDC.EndPage()
                print(f"[PrintHelper] Page {page_num + 1}/{page_count} sent at 200% full A4: {dest_w}x{dest_h} (scanlines: {scanlines}) [OK]", flush=True)

            hDC.EndDoc()

        hDC.DeleteDC()

    finally:
        doc.close()

    print(f"[PrintHelper] All {page_count * copies} page(s) successfully delivered to printer spooler!", flush=True)
    return True


def print_pdf(pdf_path, printer_name, copies=1):
    if not os.path.exists(pdf_path):
        print(f"ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[PrintHelper] Printing '{os.path.basename(pdf_path)}' ({copies}x) -> '{printer_name}' [200% Full-Page A4]...", flush=True)

    try:
        if method_pymupdf_gdi(pdf_path, printer_name, copies=copies):
            print("[PrintHelper] SUCCESS via 200% Full-Page A4 pipeline [OK]", flush=True)
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
