## 🚀 Recent Critical Fixes (V.2000 - V.2201)

### 1. 💾 Cache-Busting Definitive Solution (V.2201)
- **Status**: Production Ready with schema-fix for mockData.

### 2. 📏 Visual Atmosphere & Typography Master (V.2201)
- **Visual Mastering Dashboard**: 
    - **Typography**: Size and Gap.
    - **Container Atmosphere**: Width, BG Opacity, Backdrop Blur, Border Radius.
- **Stress-Testing Data**: `mockData.json` now includes diverse text lengths across 4 pages to test scalability.
- **Flexbox Engine**: Pure Flexbox, 100% responsive within the page container.
- **Cleanup**: Tuning sliders and debug variables have been removed.

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
