import sys
import os
import zlib
import fitz # PyMuPDF

def generate_pclm(pdf_path, output_pclm_path, dpi=600, strip_height=128, paper_size='A4', orientation='AUTO'):
    doc = fitz.open(pdf_path)
    points_per_inch = 72.0
    scale = points_per_inch / dpi

    # Exact physical dimensions at target DPI (default 600 DPI required by HP LaserJet hardware)
    paper_upper = paper_size.upper()
    if paper_upper == 'LETTER':
        target_w = int(round(8.5 * dpi))   # 2550 @ 300 DPI
        target_h = int(round(11.0 * dpi))  # 3300 @ 300 DPI
        width_points = 612
        height_points = 792
    else: # Default A4 (210 x 297 mm)
        target_w = int(round((210.0 / 25.4) * dpi))  # 2480 @ 300 DPI
        target_h = int(round((297.0 / 25.4) * dpi))  # 3508 @ 300 DPI
        width_points = 595
        height_points = 842

    objects = {}
    next_obj_num = 1

    def alloc_obj():
        nonlocal next_obj_num
        n = next_obj_num
        next_obj_num += 1
        return n

    catalog_num = alloc_obj()
    pages_num = alloc_obj()

    page_records = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]

        # Orientation handling:
        # HP LaserJet feeds paper portrait (narrow side first).
        # Landscape documents must be rotated 90 degrees to fit the sheet.
        orient_upper = orientation.upper()
        if orient_upper == 'LANDSCAPE':
            if page.rect.width < page.rect.height:
                page.set_rotation((page.rotation + 90) % 360)
        elif orient_upper == 'PORTRAIT':
            if page.rect.width > page.rect.height:
                page.set_rotation((page.rotation + 90) % 360)
        else: # AUTO
            if page.rect.width > page.rect.height:
                page.set_rotation((page.rotation + 90) % 360)

        # Scale calculation:
        # If document already matches standard target paper (within 3%), preserve exact 1:1 (100%) scale.
        page_w_px = page.rect.width * (dpi / points_per_inch)
        page_h_px = page.rect.height * (dpi / points_per_inch)

        fit_x = target_w / page_w_px
        fit_y = target_h / page_h_px
        min_fit = min(fit_x, fit_y)

        # If it's already within 3% of the target page, render at 1:1 scale
        if abs(min_fit - 1.0) < 0.03:
            zoom = 1.0
        elif min_fit < 1.0:
            # Document is larger than target paper: scale down cleanly to fit without cropping
            zoom = min_fit
        else:
            # Document is smaller than paper: fit proportionally without over-stretching
            zoom = min(min_fit, 1.0)

        mat = fitz.Matrix(zoom * (dpi / points_per_inch), zoom * (dpi / points_per_inch))
        rendered_pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)

        # Create exact target page canvas (pure white: 255)
        canvas = fitz.Pixmap(fitz.csGRAY, fitz.IRect(0, 0, target_w, target_h), 0)
        canvas.clear_with(255)

        # Center the rendered page accurately on the physical sheet
        ox = max(0, (target_w - rendered_pix.width) // 2)
        oy = max(0, (target_h - rendered_pix.height) // 2)

        cw = min(rendered_pix.width, target_w - ox)
        ch = min(rendered_pix.height, target_h - oy)
        canvas.copy(rendered_pix, fitz.IRect(ox, oy, ox + cw, oy + ch))

        width = target_w
        height = target_h
        raw_samples = canvas.samples
        row_stride = width

        page_obj_num = alloc_obj()
        content_obj_num = alloc_obj()

        # Split into swaths of exact strip_height (128 rows for standard PCLm)
        swaths = []
        y = 0
        swath_idx = 0
        while y < height:
            curr_strip_h = min(strip_height, height - y)
            strip_bytes = raw_samples[y * row_stride : (y + curr_strip_h) * row_stride]
            compressed = zlib.compress(strip_bytes, level=6)

            xobject_num = alloc_obj()
            swaths.append({
                'idx': swath_idx,
                'xobject_num': xobject_num,
                'y_offset': y,
                'height': curr_strip_h,
                'data': compressed,
                'width': width
            })

            y += curr_strip_h
            swath_idx += 1

        page_records.append({
            'page_obj_num': page_obj_num,
            'content_obj_num': content_obj_num,
            'width_points': width_points,
            'height_points': height_points,
            'width_pixels': width,
            'height_pixels': height,
            'scale': scale,
            'swaths': swaths
        })

    with open(output_pclm_path, 'wb') as f:
        offsets = {}

        def write_bytes(b):
            f.write(b)

        def write_str(s):
            f.write(s.encode('ascii'))

        def write_obj_header(n):
            offsets[n] = f.tell()
            write_str(f"{n} 0 obj\n")

        def write_obj_footer():
            write_str("endobj\n")

        # 1. Header conforming to HP PCLmS v1.0
        write_str("%PDF-1.7\n%PCLm 1.0\n")

        # 2. Write Catalog
        write_obj_header(catalog_num)
        write_str(f"<<\n/Type /Catalog\n/Pages {pages_num} 0 R\n>>\n")
        write_obj_footer()

        # 3. Write Pages Tree
        write_obj_header(pages_num)
        kids_str = " ".join([f"{p['page_obj_num']} 0 R" for p in page_records])
        write_str(f"<<\n/Type /Pages\n/Count {len(page_records)}\n/Kids [ {kids_str} ]\n>>\n")
        write_obj_footer()

        # 4. Write Pages, Contents, and Swath XObjects
        for p in page_records:
            write_obj_header(p['page_obj_num'])
            xobjects_dict = " ".join([f"/Image{s['idx']} {s['xobject_num']} 0 R" for s in p['swaths']])
            write_str(
                f"<<\n/Type /Page\n"
                f"/Parent {pages_num} 0 R\n"
                f"/Resources << /XObject << {xobjects_dict} >> >>\n"
                f"/MediaBox [ 0 0 {p['width_points']} {p['height_points']} ]\n"
                f"/Contents [ {p['content_obj_num']} 0 R ]\n"
                f"/PCLmPageStripHeight {strip_height}\n"
                f"/PCLmStripHeight {strip_height}\n"
                f"/PCLmPageStripType /FlateDecode\n"
                f"/PCLmSourceResolution {dpi}\n>>\n"
            )
            write_obj_footer()

            # Content Stream conforming to Wi-Fi Direct / Mopria PCLm standard
            scale_str = f"{p['scale']:.6f}"
            cs_parts = []
            cs_parts.append(f"{scale_str} 0 0 {scale_str} 0 0 cm\n")

            for s in p['swaths']:
                page_y_offset = p['height_pixels'] - s['y_offset'] - s['height']
                cs_parts.append("/P <</MCID 0>> BDC q\n")
                cs_parts.append(f"{p['width_pixels']} 0 0 {s['height']} 0 {page_y_offset} cm\n")
                cs_parts.append(f"/Image{s['idx']} Do Q EMC\n")

            content_bytes = "".join(cs_parts).encode('ascii')

            write_obj_header(p['content_obj_num'])
            write_str(f"<<\n/Length {len(content_bytes)}\n>>\nstream\n")
            write_bytes(content_bytes)
            write_str("\nendstream\n")
            write_obj_footer()

            # Swath XObjects with FlateDecode filter (HP PCLm standard)
            for s in p['swaths']:
                write_obj_header(s['xobject_num'])
                write_str(
                    f"<<\n/Type /XObject\n"
                    f"/Subtype /Image\n"
                    f"/Width {s['width']}\n"
                    f"/Height {s['height']}\n"
                    f"/ColorSpace /DeviceGray\n"
                    f"/BitsPerComponent 8\n"
                    f"/Filter /FlateDecode\n"
                    f"/Length {len(s['data'])}\n"
                    f"/Name /ColorStrip\n>>\nstream\n"
                )
                write_bytes(s['data'])
                write_str("\nendstream\n")
                write_obj_footer()

        # 5. XRef Table
        xref_offset = f.tell()
        total_objs = next_obj_num
        write_str(f"xref\n0 {total_objs}\n")
        write_str("0000000000 65535 f \n")
        for i in range(1, total_objs):
            off = offsets.get(i, 0)
            write_str(f"{off:010d} 00000 n \n")

        # 6. Trailer
        write_str(
            f"trailer\n<<\n/Size {total_objs}\n/Root {catalog_num} 0 R\n>>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        )

    print(f"PCLm {dpi} DPI ({paper_size}) generated: {output_pclm_path} ({os.path.getsize(output_pclm_path)} bytes)")

if __name__ == '__main__':
    pdf = sys.argv[1]
    out = sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 600
    paper = sys.argv[4] if len(sys.argv) > 4 else 'A4'
    orient = sys.argv[5] if len(sys.argv) > 5 else 'AUTO'
    generate_pclm(pdf, out, dpi=dpi, paper_size=paper, orientation=orient)
