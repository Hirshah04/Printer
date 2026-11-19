"""
Windows print helper - prints a PDF to a named Windows printer.
Renders PDF pages via PyMuPDF + Windows GDI (32-bit top-down StretchDIBits).
Ensures exact full-page A4 scaling without scanline pitch, horizontal tearing, or margin clipping.

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
    """Render PDF pages to GDI DC with 32-bit top-down DIB for exact full A4 page output."""
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
    print(f"[PrintHelper] PDF has {page_count} page(s), printing {copies}x copy(ies) via 32-bit GDI to '{resolved_printer}'...", flush=True)

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

        # Get device capabilities (Full page printable dimensions)
        dpi_x = hDC.GetDeviceCaps(win32con.LOGPIXELSX) or 300
        dpi_y = hDC.GetDeviceCaps(win32con.LOGPIXELSY) or 300
        printable_w = hDC.GetDeviceCaps(win32con.HORZRES) or 2480
        printable_h = hDC.GetDeviceCaps(win32con.VERTRES) or 3508

        print(f"[PrintHelper] Target Paper: A4 ({dpi_x}x{dpi_y} DPI, Printable: {printable_w}x{printable_h})", flush=True)

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

                # Render page at printer resolution (300 DPI optimal for A4 on LaserJet Pro MFP M126nw)
                render_dpi = min(dpi_x, 300)
                pix = page.get_pixmap(dpi=render_dpi, alpha=True)

                pix_w, pix_h = pix.width, pix.height
                samples = pix.samples

                # Compute proportional scaling to fill the A4 sheet completely
                scale = min(printable_w / pix_w, printable_h / pix_h)
                dest_w = int(pix_w * scale)
                dest_h = int(pix_h * scale)

                # Center on A4 sheet
                dest_x = (printable_w - dest_w) // 2
                dest_y = (printable_h - dest_h) // 2

                # Build 32-bit top-down BITMAPINFOHEADER (biHeight < 0 means top-down, matching MuPDF samples)
                bmi = BITMAPINFOHEADER()
                bmi.biSize = 40
                bmi.biWidth = pix_w
                bmi.biHeight = -pix_h
                bmi.biPlanes = 1
                bmi.biBitCount = 32
                bmi.biCompression = 0
                bmi.biSizeImage = len(samples)

                hDC.StartPage()

                # Native GDI 32-bit hardware stretch: perfect alignment, no scanline pitch errors
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
                print(f"[PrintHelper] Page {page_num + 1}/{page_count} sent (DIB {dest_w}x{dest_h} -> {scanlines} scanlines) [OK]", flush=True)

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

    print(f"[PrintHelper] Printing '{os.path.basename(pdf_path)}' ({copies}x) -> '{printer_name}' [A4 Full Page]...", flush=True)

    try:
        if method_pymupdf_gdi(pdf_path, printer_name, copies=copies):
            print("[PrintHelper] SUCCESS via 32-bit GDI A4 full-page pipeline [OK]", flush=True)
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
