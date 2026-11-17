import sys
import os
import fitz # PyMuPDF

def encode_rle(data: bytes) -> bytes:
    i = 0
    n = len(data)
    out = bytearray()
    while i < n:
        # Check for run of identical bytes
        run_len = 1
        while i + run_len < n and run_len < 128 and data[i + run_len] == data[i]:
            run_len += 1
        if run_len >= 3:
            out.append(257 - run_len)
            out.append(data[i])
            i += run_len
        else:
            lit_start = i
            while i < n and (i - lit_start) < 128:
                if i + 2 < n and data[i] == data[i+1] == data[i+2]:
                    break
                i += 1
            lit_len = i - lit_start
            out.append(lit_len - 1)
            out.extend(data[lit_start:i])
    out.append(128) # PDF RunLengthDecode EOD marker
    return bytes(out)

def generate_pclm(pdf_path, output_pclm_path, dpi=600, strip_height=128):
    doc = fitz.open(pdf_path)
    points_per_inch = 72.0
    scale = points_per_inch / dpi

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
        
        # Render at exact 600 DPI in 8-bit grayscale (DeviceGray)
        pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
        
        width = pix.width
        height = pix.height
        
        # Integral points for MediaBox
        width_points = int(round(width * scale))
        height_points = int(round(height * scale))
        
        page_obj_num = alloc_obj()
        content_obj_num = alloc_obj()
        
        # Split into swaths of exact strip_height (128 rows)
        swaths = []
        raw_samples = pix.samples
        row_stride = width
        
        y = 0
        swath_idx = 0
        while y < height:
            curr_strip_h = min(strip_height, height - y)
            strip_bytes = raw_samples[y * row_stride : (y + curr_strip_h) * row_stride]
            compressed = encode_rle(strip_bytes)
            
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
            xobjects_dict = " ".join([f"/res{s['idx']} {s['xobject_num']} 0 R" for s in p['swaths']])
            write_str(
                f"<<\n/Type /Page\n"
                f"/Parent {pages_num} 0 R\n"
                f"/MediaBox [ 0 0 {p['width_points']} {p['height_points']} ]\n"
                f"/Resources << /XObject << {xobjects_dict} >> >>\n"
                f"/Contents [ {p['content_obj_num']} 0 R ]\n"
                f"/PCLmPageStripHeight {strip_height}\n"
                f"/PCLmPageStripType /RunLengthDecode\n>>\n"
            )
            write_obj_footer()

            # Content Stream
            scale_str = f"{p['scale']:.6f}"
            cs_parts = []
            cs_parts.append(f"{scale_str} 0 0 {scale_str} 0 0 cm\n")
            
            for s in p['swaths']:
                page_y_offset = p['height_pixels'] - s['y_offset'] - s['height']
                cs_parts.append("/P <</MCID 0>> BDC q\n")
                cs_parts.append(f"{p['width_pixels']} 0 0 {s['height']} 0 {page_y_offset} cm\n")
                cs_parts.append(f"/res{s['idx']} Do Q\n")
                
            content_bytes = "".join(cs_parts).encode('ascii')

            write_obj_header(p['content_obj_num'])
            write_str(f"<<\n/Length {len(content_bytes)}\n>>\nstream\n")
            write_bytes(content_bytes)
            write_str("\nendstream\n")
            write_obj_footer()

            # Swath XObjects with RunLengthDecode filter
            for s in p['swaths']:
                write_obj_header(s['xobject_num'])
                write_str(
                    f"<<\n/Type /XObject\n"
                    f"/Subtype /Image\n"
                    f"/Width {s['width']}\n"
                    f"/Height {s['height']}\n"
                    f"/ColorSpace /DeviceGray\n"
                    f"/BitsPerComponent 8\n"
                    f"/Filter /RunLengthDecode\n"
                    f"/Length {len(s['data'])}\n>>\nstream\n"
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

    print(f"PCLm 600 DPI RLE generated: {output_pclm_path} ({os.path.getsize(output_pclm_path)} bytes)")

if __name__ == '__main__':
    pdf = sys.argv[1]
    out = sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) > 3 else 600
    generate_pclm(pdf, out, dpi=dpi)
