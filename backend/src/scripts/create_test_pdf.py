import fitz # pymupdf

# Create a clean 1-page A4 PDF (595 x 842 points)
doc = fitz.open()
page = doc.new_page(width=595, height=842)

# Add some text and a border
rect = fitz.Rect(50, 50, 545, 792)
page.draw_rect(rect, color=(0, 0, 0), width=2)

page.insert_text(fitz.Point(70, 100), "HP LaserJet Pro MFP M126nw", fontsize=24, color=(0, 0, 0))
page.insert_text(fitz.Point(70, 140), "Direct Wi-Fi Network Printing Test", fontsize=16, color=(0, 0, 0))
page.insert_text(fitz.Point(70, 180), "Printer IP: 192.168.1.37 (Port 631 / 9100)", fontsize=12, color=(0, 0, 0))
page.insert_text(fitz.Point(70, 210), "Resolution: 600 DPI | Format: PCLm / URF", fontsize=12, color=(0, 0, 0))
page.insert_text(fitz.Point(70, 240), "Protocol: Direct IPP over Wi-Fi Interface", fontsize=12, color=(0, 0, 0))
page.insert_text(fitz.Point(70, 280), "SUCCESS: This document was printed directly across your Wi-Fi network!", fontsize=12, color=(0, 0, 0))

doc.save("test_direct.pdf")
print("Saved test_direct.pdf successfully")
