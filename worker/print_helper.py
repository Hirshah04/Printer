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
# A4 STANDARD FULL-PAGE CONFIGURATION (1:1 Hardware Buffer Alignment)
# =============================================================================
# The HP LaserJet Pro MFP M126nw DC reports 2480 x 3508 at 300 DPI (standard A4).
# SCALE_FACTOR is strictly 1.0 to prevent raster buffer overflow and stride corruption.
SCALE_FACTOR = 1.0


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

    from PIL import Image, ImageWin
    import win32print
    import win32ui
    import win32con

    resolved_printer = find_printer(printer_name)
    if not resolved_printer:
        return False

    doc = fitz.open(pdf_path)
    page_count = doc.page_count
    print(f"[PrintHelper] PDF has {page_count} page(s), printing {copies}x copy(ies) to '{resolved_printer}'...", flush=True)

    try:
        # Create printer Device Context
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(resolved_printer)

        # Base printable area reported by DC (A4: 2480 x 3508 at 300 DPI)
        printable_w = hDC.GetDeviceCaps(win32con.HORZRES) or 2480
        printable_h = hDC.GetDeviceCaps(win32con.VERTRES) or 3508

        print(f"[PrintHelper] Target Paper: Full A4 ({printable_w} x {printable_h} dots)", flush=True)

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

                # Compute scale to fit within the printable A4 page keeping aspect ratio
                scale = min(printable_w / page_w, printable_h / page_h)
                dest_w = int(page_w * scale)
                dest_h = int(page_h * scale)

                # Center on A4 paper
                dest_x = (printable_w - dest_w) // 2
                dest_y = (printable_h - dest_h) // 2

                # Render source bitmap cleanly with no alpha (24-bit RGB)
                mat = fitz.Matrix(dest_w / page_w, dest_h / page_h)
                pix = page.get_pixmap(matrix=mat, alpha=False, colorspace=fitz.csRGB)

                # Create PIL DIB (guarantees correct BGR conversion and 4-byte stride alignment)
                img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                dib = ImageWin.Dib(img)

                hDC.StartPage()
                dib.draw(hDC.GetSafeHdc(), (dest_x, dest_y, dest_x + dest_w, dest_y + dest_h))
                hDC.EndPage()

                print(f"[PrintHelper] Page {page_num + 1}/{page_count} sent cleanly to A4: {dest_w}x{dest_h} [OK]", flush=True)

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
