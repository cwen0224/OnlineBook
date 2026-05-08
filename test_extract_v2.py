import fitz
import json

doc = fitz.open("社會1-藻礁保衛戰.pdf")
page = doc[1] # 第 2 頁

# 使用 "dict" 模式可以獲取字體、顏色與座標資訊
text_dict = page.get_text("dict")

# 輸出前幾個文字塊看看
for block in text_dict["blocks"]:
    if "lines" in block:
        for line in block["lines"]:
            for span in line["spans"]:
                print(f"Text: {span['text']} | Font: {span['font']} | Size: {span['size']}")

doc.close()
