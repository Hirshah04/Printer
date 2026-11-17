import sys
import os
import json
import time

def print_via_windows_spooler(pdf_path, printer_name, copies=1):
    try:
        import win32ui
        import win32con
        import win32print
        from PIL import Image, ImageWin
        import fitz  # PyMuPDF

        # Find exact printer match or fallback
        printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
        target_printer = None
        for p in printers:
            if "M126nw" in p or "M126" in p:
                target_printer = p
                break

        if not target_printer:
            target_printer = printer_name

        print(f"[WindowsSpooler] Target printer: {target_printer}")

        doc = fitz.open(pdf_path)
        page_count = len(doc)

        for copy_idx in range(copies):
            hdc = win32ui.CreateDC()
            hdc.CreatePrinterDC(target_printer)
            hdc.StartDoc(os.path.basename(pdf_path))

            horz_res = hdc.GetDeviceCaps(win32con.HORZRES)
            vert_res = hdc.GetDeviceCaps(win32con.VERTRES)

            for page_idx in range(page_count):
                page = doc[page_idx]
                hdc.StartPage()

                # Render page at 300 DPI
                pix = page.get_pixmap(dpi=300)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

                # Rotate landscape pages if printer is in portrait mode
                if img.width > img.height and horz_res < vert_res:
                    img = img.rotate(90, expand=True)

                dib = ImageWin.Dib(img)
                dib.draw(hdc.GetHandleOutput(), (0, 0, horz_res, vert_res))

                hdc.EndPage()

            hdc.EndDoc()
            hdc.DeleteDC()

        return {
            "success": True,
            "method": "windows_gdi",
            "printer": target_printer,
            "pages": page_count,
            "copies": copies
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: python print_document.py <pdf_path> [printer_name] [copies]"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    printer_name = sys.argv[2] if len(sys.argv) > 2 else "HP LaserJet Pro MFP M126nw"
    copies = int(sys.argv[3]) if len(sys.argv) > 3 else 1

    result = print_via_windows_spooler(pdf_path, printer_name, copies)
    print(json.dumps(result))
