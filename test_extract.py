import fitz
import json
import os

pdf_path = "社會1-藻礁保衛戰.pdf"
doc = fitz.open(pdf_path)

# 測試提取第一張有文字的頁面 (假設第 2 頁開始有內容)
page = doc[1] 
words = page.get_text("words") # 取得所有單詞及其座標 (x0, y0, x1, y1, "word", block_no, line_no, word_no)

print(f"Extracted {len(words)} words from page 2:")
for w in words[:10]: # 顯示前10個參考
    print(w)

doc.close()
