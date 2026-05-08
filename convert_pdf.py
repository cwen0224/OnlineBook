import fitz  # PyMuPDF
import os
import json

BOOKS = [
    {
        "key": "zaojiao",
        "versions": [
            { "lang": "zh-TW", "pdf": "社會1-藻礁保衛戰.pdf", "folder": "pages_zaojiao_tw" },
            # { "lang": "en", "pdf": "Social1-Algal_Reef.pdf", "folder": "pages_zaojiao_en" } # 預留英文版
        ]
    },
    {
        "key": "shigo",
        "versions": [
            { "lang": "zh-TW", "pdf": "親子1-海客石滬.pdf", "folder": "pages_shigo_tw" },
            # { "lang": "en", "pdf": "Parenting1-Shigo.pdf", "folder": "pages_shigo_en" } # 預留英文版
        ]
    }
]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

for book in BOOKS:
    for ver in book["versions"]:
        pdf_path = os.path.join(BASE_DIR, ver["pdf"])
        out_dir = os.path.join(BASE_DIR, ver["folder"])
        os.makedirs(out_dir, exist_ok=True)

        print(f"\nProcessing: {book['key']} [{ver['lang']}] - {ver['pdf']}")

        doc = fitz.open(pdf_path)
        total = len(doc)
        print(f"  Total pages: {total}")

        pages_data = []

        for i in range(total):
            page = doc[i]
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)
            img_filename = f"page_{i+1:03d}.webp"
            img_path = os.path.join(out_dir, img_filename)
            
            from PIL import Image
            import io
            img_data = pix.tobytes("ppm")
            img_pil = Image.open(io.BytesIO(img_data))
            img_pil.save(img_path, "WEBP", quality=85, method=4)
            w, h = img_pil.size
            print(f"  Page {i+1}/{total} -> {img_filename} ({w}x{h})")

            pages_data.append({
                "page": i + 1,
                "image": f"{ver['folder']}/{img_filename}",
                "width": w,
                "height": h,
                "lines": []
            })

        doc.close()

        json_path = os.path.join(BASE_DIR, f"book_{book['key']}_{ver['lang']}.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(pages_data, f, ensure_ascii=False, indent=2)
        print(f"  Saved: {json_path}")

print("\nDone! Both books converted.")
