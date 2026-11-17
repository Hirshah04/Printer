import sys
import os
import json

def render_pdf(pdf_path, out_dir, dpi=300):
    try:
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz

        if not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)

        doc = fitz.open(pdf_path)
        pages = []

        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi)
            out_file = os.path.join(out_dir, f"page_{i:03d}.jpg")
            pix.save(out_file)
            pages.append({
                "index": i,
                "file": out_file,
                "width": pix.width,
                "height": pix.height
            })

        result = {
            "success": True,
            "pageCount": len(pages),
            "pages": pages
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: render_pdf.py <input.pdf> <output_dir> [dpi]"}))
        sys.exit(1)

    pdf_file = sys.argv[1]
    output_dir = sys.argv[2]
    target_dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 300

    render_pdf(pdf_file, output_dir, target_dpi)
