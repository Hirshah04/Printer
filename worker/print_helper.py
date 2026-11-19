"""
Windows print helper - prints a PDF to a named Windows printer.
Renders PDF pages via PyMuPDF + Windows GDI (PIL ImageWin.Dib on Win32 Printer DC).
Works reliably with WSD (network IPP) and USB printers without needing external PDF viewers.

Usage: python print_helper.py <pdf_path> <printer_name> [copies]
Exit codes: 0=success, 1=failure
"""
import sys
import os
import io

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


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
                print(f"[PrintHelper] Exact '{printer_name}' not found. Matched '{p}'", flush=True)
                return p

        print(f"ERROR: Printer '{printer_name}' not found. Available: {installed}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[PrintHelper] Warning enumerating printers: {e}", file=sys.stderr)
        return printer_name


def method_pymupdf_gdi(pdf_path, printer_name, copies=1):
    """Render PDF pages to GDI DC via PIL ImageWin.Dib."""
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz

    import win32print
    import win32ui
    import win32con
    from PIL import Image, ImageWin

    resolved_printer = find_printer(printer_name)
    if not resolved_printer:
        return False

    doc = fitz.open(pdf_path)
    page_count = doc.page_count
    print(f"[PrintHelper] PDF has {page_count} page(s), printing {copies}x copy(ies) via GDI to '{resolved_printer}'...", flush=True)

    try:
        # Create printer Device Context
        hDC = win32ui.CreateDC()
        hDC.CreatePrinterDC(resolved_printer)

        # Get printer capabilities
        dpi_x = hDC.GetDeviceCaps(win32con.LOGPIXELSX) or 300
        dpi_y = hDC.GetDeviceCaps(win32con.LOGPIXELSY) or 300
        printable_w = hDC.GetDeviceCaps(win32con.HORZRES)
        printable_h = hDC.GetDeviceCaps(win32con.VERTRES)

        print(f"[PrintHelper] Printer DPI: {dpi_x}x{dpi_y}, Printable Area: {printable_w}x{printable_h}", flush=True)

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

                # Render at printer resolution (300 DPI optimal for LaserJet MFP M126nw)
                render_dpi = min(dpi_x, 300)
                pix = page.get_pixmap(dpi=render_dpi, alpha=False)

                img_w, img_h = pix.width, pix.height

                # Scale to fit printable area while maintaining aspect ratio
                scale = min(printable_w / img_w, printable_h / img_h)
                dest_w = int(img_w * scale)
                dest_h = int(img_h * scale)

                # Center on page
                dest_x = (printable_w - dest_w) // 2
                dest_y = (printable_h - dest_h) // 2

                # Convert to PIL Image
                img = Image.frombytes("RGB", (img_w, img_h), pix.samples)
                if dest_w != img_w or dest_h != img_h:
                    img = img.resize((dest_w, dest_h), Image.LANCZOS)

                dib = ImageWin.Dib(img)

                hDC.StartPage()
                dib.draw(hDC.GetSafeHdc(), (dest_x, dest_y, dest_x + dest_w, dest_y + dest_h))
                hDC.EndPage()

                print(f"[PrintHelper] Page {page_num + 1}/{page_count} sent successfully.", flush=True)

            hDC.EndDoc()

        hDC.DeleteDC()

    finally:
        doc.close()

    print(f"[PrintHelper] All {page_count * copies} page(s) successfully sent to Windows spooler!", flush=True)
    return True


def print_pdf(pdf_path, printer_name, copies=1):
    if not os.path.exists(pdf_path):
        print(f"ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[PrintHelper] Initiating print for '{os.path.basename(pdf_path)}' ({copies}x) -> '{printer_name}'...", flush=True)

    try:
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
