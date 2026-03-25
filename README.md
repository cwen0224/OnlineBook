# 動態翻頁繪本

這是一個可直接部署到 GitHub Pages 的單頁繪本站，支援：

- 翻頁動畫
- 內建頁面翻動音效
- 匯入單一 `JSON`
- 匯入 `ZIP` 繪本包

## 使用方式

直接打開 `index.html` 即可看到示範繪本。

## 資料格式

### JSON

匯入的 JSON 會被當成一本繪本。最少需要：

```json
{
  "title": "書名",
  "author": "作者",
  "description": "簡介",
  "pages": [
    {
      "title": "頁面標題",
      "text": "頁面文字",
      "image": "圖片網址或 data URL",
      "audio": "音效網址或 data URL"
    }
  ]
}
```

欄位說明：

- `title`：繪本名稱
- `author`：作者或來源
- `description`：書籍簡介
- `pages`：頁面陣列，至少 1 頁
- `pages[].image`：可選，頁面插圖
- `pages[].audio`：可選，頁面音效
- `pages[].background`：可選，頁面背景圖

### ZIP

ZIP 內需要放一個 `book.json` 或 `manifest.json`。檔案引用採相對路徑，基準是 `book.json` 所在資料夾。

範例結構：

```text
storybook.zip
  book.json
  images/
    cover.png
  audio/
    turn.mp3
```

`book.json` 範例：

```json
{
  "title": "森林夜航",
  "author": "Demo",
  "description": "一段穿過森林的故事。",
  "pages": [
    {
      "title": "封面",
      "text": "故事開始。",
      "image": "images/cover.png",
      "audio": "audio/turn.mp3"
    }
  ]
}
```

## GitHub Pages

把這三個檔案推到 GitHub repository，然後把 Pages 設定成從 `main` 分支的根目錄發佈即可。

## 已實作內容

- 以 CSS 3D 動畫模擬翻頁效果
- 內建 Web Audio page-flip 音效
- 支援鍵盤左右鍵、按鈕、點擊頁面翻頁
- 支援 ZIP 裡的相對資源引用
