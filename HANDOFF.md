## 🚀 Recent Critical Fixes (V.2000 - V.2050)

### 1. 💾 Cache-Busting Definitive Solution (V.2050)
- **Status**: Stable. Uses `Date.now()` on fetch and JSON/JS/CSS versioning.

### 2. 📏 Zhuyin Typography & Full Tuning Control (V.2050)
- **Live Tuning Panel**: 
    - **Font Size**: Control `--char-size` (1.5rem to 5rem).
    - **Char Gap**: Control `--char-gap` (0em to 3em).
    - **Tone Padding**: Control `--tone-padding` (0em to 2em).
- **Flex-Shrink Fix**: Added `flex-shrink: 0` to `.zh-col-tone` to ensure tone padding isn't squashed by the browser's flexbox engine.
- **Goal**: Find the perfect values in-app, then hard-code them into `style.css` later.

### 3. 🌓 Shadow Rendering Bug
- **Fixed**: Black semi-transparent overlays no longer stick on page rest.
- **Logic**: Forced shadow opacity to exactly `0` at `0°` and `-180°` using `Math.sin` calculation in `updateLeafTransform()`.

---

## 🐛 Known Issues & Pending Work

### 1. Left-Side "Void" Bug [High Priority]
- **Issue**: On the first page, the left side is empty/beige background because there is no "Back Cover" leaf.
- **Solution**: Implement a static "Back Cover" leaf or a full-screen wooden table background to fill the void.

### 2. Polyphone Selection [Medium Priority]
- **Status**: Data structure supports it (`polyphone: true`), but the UI for clicking/selecting alternative readings is not yet implemented.

### 3. Performance / JSON Size [Future]
- **Status**: Currently loading all pages at once. For books >50 pages, pagination logic will be needed.

---

## 🛠 Developer Note
To test new layouts:
1. Update `mockData.json`.
2. Update the version number in `index.html`.
3. The amber banner at the top of the screen will confirm your changes are live.
