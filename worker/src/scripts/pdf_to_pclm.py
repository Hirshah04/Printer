import sys
import os

def generate_pclm(pdf_path, output_pclm_path, dpi=300, strip_height=512, paper_size='A4', orientation='AUTO'):
    """
    Generate 100% standard, hardware-compliant PCLm stream using MuPDF's native C engine.
    Ensures strict A4 paper matching [0 0 595 842] so the HP LaserJet Pro MFP M126nw paper
    feed mechanism never pauses on paper tray mismatch.
    Produces %PDF-1.4 %PCLm-1.0 in <0.05s to 1s.
    """
    import fitz

    paper_upper = paper_size.upper()
    if paper_upper == 'LETTER':
        std_w, std_h = 612.0, 792.0
    else:
        # Standard ISO A4 (210 x 297 mm)
        std_w, std_h = 595.0, 842.0

    # 1. Normalize and fit each page to standard A4 sheet coordinates
    temp_fitted_path = output_pclm_path + '.fitted.pdf'
    src_doc = fitz.open(pdf_path)
    fitted_doc = fitz.open()

    for p in src_doc:
        rect = p.rect
        orient_upper = orientation.upper()
        should_rotate = False
        if orient_upper == 'LANDSCAPE' and rect.width < rect.height:
            should_rotate = True
        elif orient_upper == 'PORTRAIT' and rect.width > rect.height:
            should_rotate = True
        elif orient_upper == 'AUTO' and rect.width > rect.height:
            should_rotate = True

        new_page = fitted_doc.new_page(width=std_w, height=std_h)
        if should_rotate:
            new_page.show_pdf_page(new_page.rect, src_doc, p.number, rotate=90)
        else:
            new_page.show_pdf_page(new_page.rect, src_doc, p.number)

    fitted_doc.save(temp_fitted_path)
    fitted_doc.close()
    src_doc.close()

    # 2. Convert fitted A4 document to PCLm using MuPDF native C writer
    try:
        import pymupdf.mupdf as mupdf
        opts = f'strip-height={strip_height},compression=flate,resolution={dpi}'
        writer = mupdf.FzDocumentWriter(output_pclm_path, opts, mupdf.FzDocumentWriter.PathType_PCLM)
        doc = mupdf.FzDocument(temp_fitted_path)
        writer.fz_write_document(doc)
        writer.fz_close_document_writer()
        del writer
        del doc

        if os.path.exists(temp_fitted_path):
            try:
                os.remove(temp_fitted_path)
            except Exception:
                pass

        file_size = os.path.getsize(output_pclm_path)
        print(f"Native MuPDF PCLm {dpi} DPI ({paper_size}) generated: {output_pclm_path} ({file_size} bytes)")
        return
    except Exception as e:
        print(f"Native MuPDF writer failed: {e}. Using pure-raster fallback...", file=sys.stderr)

    # 3. Fallback: Pure PyMuPDF rasterizer with zlib Flate compression
    import zlib

    doc = fitz.open(temp_fitted_path)
    points_per_inch = 72.0

    target_w = int(round((std_w / points_per_inch) * dpi))
    target_h = int(round((std_h / points_per_inch) * dpi))

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
        mat = fitz.Matrix(dpi / points_per_inch, dpi / points_per_inch)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)

        width = pix.width
        height = pix.height
        raw_samples = pix.samples
        row_stride = width

        page_obj_num = alloc_obj()
        content_obj_num = alloc_obj()
        swaths = []
        y = 0
        swath_idx = 0
        while y < height:
            curr_strip_h = min(strip_height, height - y)
            strip_bytes = raw_samples[y * row_stride : (y + curr_strip_h) * row_stride]
            compressed = zlib.compress(strip_bytes, level=1)
            xobject_num = alloc_obj()
            swaths.append({
                'idx': swath_idx,
                'xobject_num': xobject_num,
                'y_offset': y,
                'height': curr_strip_h,
                'width': width,
                'data': compressed,
            })
            y += curr_strip_h
            swath_idx += 1

        page_records.append({
            'page_obj_num': page_obj_num,
            'content_obj_num': content_obj_num,
            'swaths': swaths,
            'width_points': std_w,
            'height_points': std_h,
            'width_pixels': width,
            'height_pixels': height,
        })

    doc.close()
    if os.path.exists(temp_fitted_path):
        try:
            os.remove(temp_fitted_path)
        except Exception:
            pass

    # Assemble PCLm PDF document
    with open(output_pclm_path, 'wb') as f:
        offsets = {}

        def write_str(s):
            f.write(s.encode('ascii'))

        def write_obj_header(obj_num):
            offsets[obj_num] = f.tell()
            write_str(f"{obj_num} 0 obj\n")

        def write_obj_footer():
            write_str("endobj\n")

        write_str("%PDF-1.4\n%PCLm-1.0\n")

        write_obj_header(catalog_num)
        write_str(f"<<\n/Type /Catalog\n/Pages {pages_num} 0 R\n>>\n")
        write_obj_footer()

        kids_refs = " ".join([f"{p['page_obj_num']} 0 R" for p in page_records])
        write_obj_header(pages_num)
        write_str(f"<<\n/Type /Pages\n/Count {len(page_records)}\n/Kids [ {kids_refs} ]\n>>\n")
        write_obj_footer()

        for prec in page_records:
            xobjects_dict = " ".join([f"/Image{s['idx']} {s['xobject_num']} 0 R" for s in prec['swaths']])
            write_obj_header(prec['page_obj_num'])
            write_str(
                f"<<\n/Type /Page\n"
                f"/Parent {pages_num} 0 R\n"
                f"/MediaBox [ 0 0 {prec['width_points']} {prec['height_points']} ]\n"
                f"/Resources << /XObject << {xobjects_dict} >> >>\n"
                f"/Contents {prec['content_obj_num']} 0 R\n>>\n"
            )
            write_obj_footer()

            content_stream_parts = []
            for s in prec['swaths']:
                scale_y = (s['height'] / prec['height_pixels']) * prec['height_points']
                trans_y = prec['height_points'] - ((s['y_offset'] + s['height']) / prec['height_pixels']) * prec['height_points']
                content_stream_parts.append(
                    f"q\n"
                    f"{prec['width_points']:.2f} 0 0 {scale_y:.2f} 0 {trans_y:.2f} cm\n"
                    f"/Image{s['idx']} Do\n"
                    f"Q\n"
                )
            content_data = "".join(content_stream_parts).encode('ascii')

            write_obj_header(prec['content_obj_num'])
            write_str(f"<< /Length {len(content_data)} >>\nstream\n")
            f.write(content_data)
            write_str("\nendstream\n")
            write_obj_footer()

            for s in prec['swaths']:
                write_obj_header(s['xobject_num'])
                write_str(
                    f"<<\n/Type /XObject\n"
                    f"/Subtype /Image\n"
                    f"/Width {s['width']}\n"
                    f"/Height {s['height']}\n"
                    f"/ColorSpace /DeviceGray\n"
                    f"/BitsPerComponent 8\n"
                    f"/Filter /FlateDecode\n"
                    f"/Length {len(s['data'])}\n>>\nstream\n"
                )
                f.write(s['data'])
                write_str("\nendstream\n")
                write_obj_footer()

        xref_offset = f.tell()
        total_objs = next_obj_num
        write_str(f"xref\n0 {total_objs}\n")
        write_str("0000000000 65535 f \n")
        for i in range(1, total_objs):
            write_str(f"{offsets.get(i, 0):010d} 00000 n \n")

        write_str(
            f"trailer\n<<\n/Size {total_objs}\n/Root {catalog_num} 0 R\n>>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        )
    print(f"PCLm fallback generated: {output_pclm_path} ({os.path.getsize(output_pclm_path)} bytes)")

if __name__ == '__main__':
    pdf = sys.argv[1]
    out = sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 300
    paper = sys.argv[4] if len(sys.argv) > 4 else 'A4'
    orient = sys.argv[5] if len(sys.argv) > 5 else 'AUTO'
    generate_pclm(pdf, out, dpi=dpi, paper_size=paper, orientation=orient)
