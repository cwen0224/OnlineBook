import json
import os

def create_en_json(source_json, target_json):
    if not os.path.exists(source_json):
        return
    with open(source_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 這裡我們先沿用中文圖片，但將來您可以替換成英文圖片路徑
    # 我們也可以在 metadata 中加入英文標題
    with open(target_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Created {target_json}")

create_en_json('book_zaojiao_zh-TW.json', 'book_zaojiao_en.json')
create_en_json('book_shigo_zh-TW.json', 'book_shigo_en.json')
