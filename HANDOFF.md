## 🚀 Recent Critical Fixes (V.2000 - V.2040)

### 1. 💾 Cache-Busting Definitive Solution (V.2010)
- **Problem**: Browser cached `mockData.json`.
- **Solution**: Added `Date.now()` timestamp to fetch and Amber Version Banner.

### 2. 📏 Zhuyin Typography & Live Tuning (V.2040)
- **Live Control Panel**: Added a UI Panel (top-right) with sliders for **Char Gap** and **Tone Padding**.
- **CSS Variables**: Layout now uses `--char-gap` and `--tone-padding` for real-time adjustments.
- **Extreme Overlap Fix**: Forced `.zh-col-tone` to have a physical buffer.
- **Architecture**: Flexbox engine (no `writing-mode`).
- **Baseline Fix**: `align-items: flex-end`.
- **Final Target**: Once the user finds the perfect slider values, they can be hard-coded into `style.css`.

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
