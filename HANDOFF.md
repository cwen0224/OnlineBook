# Project Handoff: True 3D Page Flip Book

## Overview
This is a Vanilla JavaScript, CSS, and HTML implementation of a highly realistic, full-bleed 3D electronic picture book. It uses native CSS 3D transforms (`rotateY`, `translateZ`, `preserve-3d`) to simulate the physical thickness and curling of paper.

## Core Architecture
The project has completely moved away from a static 2-page replacement model to a **True 3D Leaf Engine**.

*   **`style.css`**:
    *   The `#book` container spans `100vw` and `100vh` (`perspective: 3500px`).
    *   `.leaf` elements are absolutely positioned on the right half of the screen (`width: 50%`) with `transform-origin: left center` (the spine).
    *   Faces (front/back) are styled to fill the container and hide backfaces. The back face has `transform: rotateY(180deg)` which naturally fixes any mirrored text/images.
    *   Full disablement of native dragging and text highlighting via global `*` selectors (`user-select: none`, `-webkit-user-drag: none`, etc.).
*   **`script.js`**:
    *   **Dynamic Generation**: Wipes the `#book` DOM and dynamically injects `TOTAL_LEAVES` (currently 5 leaves = 10 pages).
    *   **Content**: Uses `picsum.photos` to fetch full-bleed `background-image` covers for every page.
    *   **3D Stacking (`translateZ` & `zIndex`)**: Every leaf is assigned a `baseZ` value. During an idle state or flipping, `translateZ` physics naturally handle left/right stacking. A dynamic `zIndex` fallback guarantees Safari/Chrome don't clip overlaps mid-air.
    *   **Interaction Model**:
        *   Uses `pointerdown/move/up` over the entire `#book`.
        *   Supports **overlapping concurrent interactions**: You can grab a leaf mid-air, interrupt its animation, and seamlessly control multiple leaves at once.
        *   **Relative Dragging**: Dragging calculates angle via `deltaX` from the starting click position (`startAngle + (deltaX / dragDist) * 180`). This completely prevents page-jumping anomalies.
        *   **Click-to-Flip**: If the user strictly clicks ( `Math.abs(deltaX) < 10` ), the engine automatically triggers a full flip to the next/previous page based on which half of the screen was clicked.
*   **`index.html`**:
    *   Contains the `#book` mounting point.
    *   **Tutorial Overlay (`#tutorial-container`)**: A step-by-step UX onboarding overlay with `pointer-events: none`. The JS engine tracks `tutorialStep` and automatically suppresses the right-side glowing box when the user completes a "next" turn, revealing the left-side "prev" turn box.
    *   **Version Banner**: Drops down from the top (`#version-banner`) on `DOMContentLoaded` and retracts after 3 seconds. Current version is `V.2603261437`.

## Features
- Fully responsive `100vw`/`100vh` layout.
- Native 3D physics mapping for overlapping pages.
- Smart uninterrupted animations (no cooldown gaps for mouse actions).
- Guided `pointer-events: none` overlay for instant onboarding.
- Automated cache-busting implementation.

## Next Steps / Notes for Context Relay
- If adjusting the number of pages, look for `const TOTAL_LEAVES = 5;` in `script.js`.
- If modifying styling or adding text over the images, remember that `.page-number` serves as the current anchor for foreground elements. 
- The background elements are configured via inline `style="background-image: url()"` during the leaf construction loop in `script.js`.
