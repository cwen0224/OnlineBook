# 📖 Project Handoff: True 3D Page Flip Book (With Phonetic Ruby System)

## 📌 Project Overview
This repository contains a vanilla HTML/CSS/JS implementation of a highly realistic, full-bleed 3D page-flip interactive electronic picture book.
It now seamlessly deeply integrates a **Dual-System Phonetic Text Engine (注音/拼音雙軌系統)** parsed dynamically from a rigidly structured JSON schema.

## 🏗 Core Architecture

### 1. The 3D Leaf Engine (`script.js` & `style.css`)
- **Structure**: Uses `perspective: 3500px` on `#book`. Each page is a `.leaf` containing two `.face`s (front and back). Left/Right flipping is mapped natively using CSS 3D Transforms (`rotateY`, `translateZ`) to simulate paper thickness.
- **Interactions**: Continuous pointer events (`pointerdown`, `pointermove`, `pointerup`). Allows rapid, interrupted, asynchronous drag streams mappings (you can simultaneously catch multiple pages mid-air).
- **Sub-pixel Seam Fix**: The `.face` elements are extended slightly (`width: calc(100% + 1px); left: -0.5px;`) to eliminate any floating-point centerline rendering gaps when the book lies open.

### 2. The Phonetic Parsing Engine (`AugTitle.md` Schema)
We have implemented the rigorous JSON formatting rule defined in `AugTitle.md`.
- **Parsing Data**: `script.js` executes `fetch('mockData.json')` first. For each page injected into the 3D DOM, JS checks if `mockDataJson` has data for that specific `pageNum`. 
- **DOM Transformation**: The `generateHTMLFromJson` function iterates through `lines` -> `tokens`. It translates the strictly semantic JSON into HTML wrappers.
- **Why no `<ruby>` tag?** Native `<ruby>` only supports ruby text on one edge (typical top). Because we require instantaneous toggling between **Zhuyin (Bopomofo)** and **Pinyin**, we utilize a custom CSS flex wrapper block instead.
  
```html
<div class="char-block">
    <div class="char-rt zhuyin">ㄅㄠˇ</div>
    <div class="char-rt pinyin">bǎo</div>
    <div class="char-base polyphone-warning">寶</div>
</div>
```

### 3. State Management & Phonetic Toggle (`index.html` & `script.js`)
- The document `<body>` acts as the global state machine utilizing a data attribute: `data-phonetic="zhuyin"` or `"pinyin"`.
- This controls visibility synchronously via CSS. There is absolutely NO Javascript DOM wiping/replacement when toggling:
```css
body[data-phonetic="zhuyin"] .pinyin { display: none !important; }
body[data-phonetic="pinyin"] .zhuyin { display: none !important; }
```
- An absolute positioned toggle button `#phonetic-toggle-btn` toggles the body dataset and text label. `e.stopPropagation()` prevents toggling the button from triggering a page grab.

### 4. Advanced NLP Layout Specs Implemented
- **`word_boundary`**: Implemented. Automatically surrounds bounding characters with a `<div class="word-group">` mapped to `white-space: nowrap;` so browser wrap doesn't shatter a word with Phonetics.
- **`indent.level`**: Implemented using inline CSS `margin-left` in `em` units mapping correctly to line indent space.
- **`width_units`**: Implemented. Ellipses parsing logic utilizes `flex-basis: Nem` to manually widen punctuation.
- **`polyphone: true`**: Handled. Renders the `.char-base.polyphone-warning` class, which attaches heavily stylized text/dots specifically warning human editors.

## 🎯 Important Checklists for the Next Agent AI (Context Continuity)
1. **Mock Data Limit**: Currently `TOTAL_LEAVES` is locked at 5 in `script.js` but the `mockData.json` only contains sample mapping for `page: 1` ("小兔子找朋友"). If you see blank text pages for pages 2-10, that is expected.
2. **Text Positional Layering**: Text is placed inside a highly styled `.page-text-container` overlaying the Unsplash image background. Text logic currently floats at the `bottom: 10%;` anchor points. Adjust `.page-text-container` in `style.css` if you are implementing new `layout` states like `text_top` or `text_overlay`.
3. **Ruby Scale Constraint**: The CSS utilizes `--ruby-scale` variable derived from the JSON `ruby_scale` (defaults to 0.5) to keep the sizing tightly governed.

## 🕒 Current Version Status
- **Cache-Busting Variable**: `?v=202603301640`
- GitHub Pages is fully deployed. Link exists as `GitHub Pages.url` on Desktop.
