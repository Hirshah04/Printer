"""
Windows print helper - prints a PDF to a named Windows printer.
Renders PDF pages via PyMuPDF + Windows GDI (win32ui/win32print).
Works with WSD (network) printers without needing Acrobat or SumatraPDF.

Usage: python print_helper.py <pdf_path> <printer_name>
Exit codes: 0=success, 1=failure
"""
import sys
import os
import ctypes
import io

def method_pymupdf_gdi(pdf_path, printer_name, copies=1):
    """Render PDF pages to GDI DC and print - works with any Windows printer including WSD."""
    import pymupdf as fitz
    import win32print
    import win32ui
    import win32con
    from PIL import Image

    doc = fitz.open(pdf_path)
    page_count = doc.page_count
    print(f"[PrintHelper] PDF has {page_count} page(s), printing {copies}x copy(ies) via GDI to '{printer_name}'...", flush=True)

    try:
        # Create printer DC
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(printer_name)

        # Get printer capabilities
        dpi_x = hDC.GetDeviceCaps(win32con.LOGPIXELSX)
        dpi_y = hDC.GetDeviceCaps(win32con.LOGPIXELSY)
        printable_w = hDC.GetDeviceCaps(win32con.HORZRES)
        printable_h = hDC.GetDeviceCaps(win32con.VERTRES)

        print(f"[PrintHelper] Printer DPI: {dpi_x}x{dpi_y}, Printable: {printable_w}x{printable_h}", flush=True)

        gdi32 = ctypes.windll.gdi32
        DIB_RGB_COLORS = 0
        SRCCOPY = 0x00CC0020

        for copy_idx in range(copies):
            if copies > 1:
                print(f"[PrintHelper] Processing copy {copy_idx + 1} of {copies}...", flush=True)

            hDC.StartDoc(f"{os.path.basename(pdf_path)} (Copy {copy_idx + 1})")

            for page_num in range(page_count):
                page = doc[page_num]

                # Auto-rotate landscape documents so they fit the printer's portrait paper feed
                if page.rect.width > page.rect.height:
                    page.set_rotation((page.rotation + 90) % 360)

                # Render at printer DPI
                mat = fitz.Matrix(dpi_x / 72.0, dpi_y / 72.0)
                pix = page.get_pixmap(matrix=mat, alpha=False)

                img_w, img_h = pix.width, pix.height

                # Scale to fit printable area while maintaining aspect ratio (never shrink unnecessarily)
                scale = min(printable_w / img_w, printable_h / img_h)
                dest_w = int(img_w * scale)
                dest_h = int(img_h * scale)

                # Center on page
                dest_x = (printable_w - dest_w) // 2
                dest_y = (printable_h - dest_h) // 2

                hDC.StartPage()

                # Build BMP in memory
                img = Image.frombytes("RGB", (img_w, img_h), pix.samples)
                img_resized = img.resize((dest_w, dest_h), Image.LANCZOS)

                bmp_buffer = io.BytesIO()
                img_resized.save(bmp_buffer, format='BMP')
                bmp_data = bmp_buffer.getvalue()

                # BMP header offset
                bmi_offset = 14
                pixels_offset = int.from_bytes(bmp_data[10:14], 'little')
                bmi_data = bmp_data[bmi_offset:]
                pixels = bmp_data[pixels_offset:]

                result = gdi32.StretchDIBits(
                    hDC.GetSafeHdc(),
                    dest_x, dest_y, dest_w, dest_h,
                    0, 0, dest_w, dest_h,
                    pixels,
                    ctypes.cast(ctypes.c_char_p(bmi_data), ctypes.c_void_p),
                    DIB_RGB_COLORS,
                    SRCCOPY
                )

                hDC.EndPage()
                print(f"[PrintHelper] Page {page_num + 1}/{page_count} sent (StretchDIBits={result})", flush=True)

            hDC.EndDoc()

        hDC.DeleteDC()

    finally:
        doc.close()

    print(f"[PrintHelper] All {page_count * copies} page(s) successfully sent to Windows printer spooler!", flush=True)
    return True


def method_ghostscript(pdf_path, printer_name):
    """Fallback: Use Ghostscript mswinpr2 device."""
    import subprocess
    for gs in [
        r"C:\Program Files\gs\gs10.04.0\bin\gswin64c.exe",
        r"C:\Program Files\gs\gs10.03.0\bin\gswin64c.exe",
        r"C:\Program Files\gs\gs9.56.1\bin\gswin64c.exe",
    ]:
        if os.path.exists(gs):
            try:
                result = subprocess.run([
                    gs, "-dBATCH", "-dNOPAUSE", "-dNOSAFER",
                    f"-sOutputFile=%printer%{printer_name}",
                    "-sDEVICE=mswinpr2", "-dNoCancel",
                    pdf_path
                ], capture_output=True, timeout=60)
                if result.returncode == 0:
                    return True
            except (FileNotFoundError, subprocess.TimeoutExpired):
                continue
    return False


def print_pdf(pdf_path, printer_name, copies=1):
    if not os.path.exists(pdf_path):
        print(f"ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    # Verify printer exists
    try:
        import win32print
        printers = [p[2] for p in win32print.EnumPrinters(2)]
        if printer_name not in printers:
            print(f"ERROR: Printer '{printer_name}' not found.", file=sys.stderr)
            print(f"Available: {printers}", file=sys.stderr)
            sys.exit(1)
    except ImportError:
        pass

    print(f"[PrintHelper] Printing '{os.path.basename(pdf_path)}' ({copies}x) to '{printer_name}'...", flush=True)

    try:
        if method_pymupdf_gdi(pdf_path, printer_name, copies=copies):
            print("[PrintHelper] SUCCESS via GDI renderer", flush=True)
            sys.exit(0)
    except Exception as e:
        print(f"[PrintHelper] GDI method failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

    try:
        for _ in range(copies):
            if not method_ghostscript(pdf_path, printer_name):
                raise Exception("Ghostscript print failed")
        print("[PrintHelper] SUCCESS via Ghostscript", flush=True)
        sys.exit(0)
    except Exception as e:
        print(f"[PrintHelper] Ghostscript failed: {e}", file=sys.stderr)

    print("ERROR: All print methods failed.", file=sys.stderr)
    sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python print_helper.py <pdf_path> <printer_name> [copies]", file=sys.stderr)
        sys.exit(1)
    num_copies = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    print_pdf(sys.argv[1], sys.argv[2], copies=num_copies)
