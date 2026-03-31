# Project Handoff: OnlineBook Interactive 3D Engine
**Last Update: 2026-03-31 20:10 (V.202603312010)**

## 🚀 Recent Critical Fixes (V.2000 - V.2020)

### 1. 💾 Cache-Busting Definitive Solution (V.2010)
- **Problem**: Browser cached `mockData.json`.
- **Solution**: Added `Date.now()` timestamp to fetch and Amber Version Banner.

### 2. 📏 Zhuyin Typography Engine & Overlap Fix (V.2020)
- **Tone Overlap Fix**: Forced `.zh-col-tone` to have `min-width: 0.8em` and `padding-right: 0.4em`. This prevents wide marks (like BiauKai's `ˇ`) from bleeding into the next character's space.
- **Architecture**: Flexbox engine (no `writing-mode`).
- **Baseline Fix**: `align-items: flex-end`.
- **Spacing**: Global `gap` is **1.2em**.

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
