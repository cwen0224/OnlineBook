document.addEventListener('DOMContentLoaded', () => {
    // Version Banner
    const versionBanner = document.getElementById('version-banner');
    if (versionBanner) {
        setTimeout(() => {
            versionBanner.style.top = '0';
            setTimeout(() => { versionBanner.style.top = '-50px'; }, 3000);
        }, 500);
    }

    let tutorialStep = 1;
    const tutNext = document.getElementById('tutorial-next');
    const tutPrev = document.getElementById('tutorial-prev');
    const tutContainer = document.getElementById('tutorial-container');

    const advanceTutorial = (direction) => {
        if (tutorialStep === 1 && direction === 'next') {
            tutorialStep = 2;
            if (tutNext) tutNext.style.opacity = '0';
            setTimeout(() => {
                if (tutNext) tutNext.style.display = 'none';
                if (tutPrev) {
                    tutPrev.style.display = 'flex';
                    tutPrev.style.opacity = '0';
                    setTimeout(() => tutPrev.style.opacity = '1', 50);
                }
            }, 500);
        } else if (tutorialStep === 2 && direction === 'prev') {
            tutorialStep = 3;
            if (tutPrev) tutPrev.style.opacity = '0';
            setTimeout(() => { if (tutContainer) tutContainer.remove(); }, 500);
        }
    };

    document.addEventListener('dragstart', (e) => e.preventDefault());

    // Phonetic Switcher Logic
    const toggleBtn = document.getElementById('phonetic-toggle-btn');
    if (toggleBtn) {
        document.body.dataset.phonetic = 'zhuyin'; // default
        toggleBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); // Avoid triggering book flip
            const curr = document.body.dataset.phonetic;
            if (curr === 'zhuyin') {
                document.body.dataset.phonetic = 'pinyin';
                toggleBtn.textContent = '切換注音';
            } else {
                document.body.dataset.phonetic = 'zhuyin';
                toggleBtn.textContent = '切換拼音';
            }
        });
    }

    const book = document.getElementById('book');
    let isDragging = false;
    let currentDragLeaf = null;
    let startX = 0;
    let lastClientX = 0;
    let startAngle = 0;
    let bookRect = book.getBoundingClientRect();
    const TOTAL_LEAVES = 5; 
    const leaves = [];
    book.innerHTML = ''; 

    // ---- JSON Layout Parse Engine ----
    // Tone marks: ˊ ˇ ˋ ˙ (U+02CA, U+02C7, U+02CB, U+02D9)
    const TONE_MARKS = new Set(['ˊ','ˇ','ˋ','˙']);

    // Render a zhuyin string as a proper two-column flex block:
    //   Left col:  consonant + medial + vowel stacked vertically (each as a <span>)
    //   Right col: tone mark at the top (always stays horizontal, never rotated)
    
    // Initial State: Read from DOM or fallback (V.2450)
    const puncSelector = document.getElementById('punc-engine');
    let currentPuncEngine = puncSelector ? puncSelector.value : 'adobe';

    const renderZhuyin = (z) => {
        if (!z) return '';
        const chars = [...z]; // spread to handle full Unicode
        const body = chars.filter(c => !TONE_MARKS.has(c));
        const tone = chars.find(c => TONE_MARKS.has(c)) || '';
        const bodyHtml = body.map(c => `<span class="zh-c">${c}</span>`).join('');
        const toneHtml = tone ? `<div class="zh-col-tone"><span class="zh-c">${tone}</span></div>` : '';
        return `<div class="zh-col-main">${bodyHtml}</div>${toneHtml}`;
    };

    const renderToken = (t) => {
        if (t.type === 'char' || t.type === 'punctuation') {
            let wUnits = t.width_units ? `flex-basis: ${t.width_units}em; min-width: ${t.width_units}em;` : '';
            let html = `<div class="char-block" style="${wUnits}">`;
            if (t.type === 'char') {
                html += `<div class="char-rt pinyin">${t.pinyin || ''}</div>`;
                html += `<div class="char-row">`;
                html += `<div class="char-base ${t.polyphone || t.emphasis ? 'polyphone-warning' : ''}">${t.char}</div>`;
                html += `<div class="char-rt zhuyin">${renderZhuyin(t.zhuyin)}</div>`;
                html += `</div>`;
            } else {
                html += `<div class="char-row"><div class="char-base">${t.char}</div></div>`;
            }
            html += `</div>`;
            return html;
        } else if (t.type === 'space') {
            return `<div class="char-block space" style="min-width: 0.5em;"></div>`;
        }
        return '';
    };

    const generateHTMLFromJson = (pageData) => {
        if (!pageData || !pageData.lines) return '';
        let scale = pageData.ruby_scale || 0.5;
        
        // Mode detection
        let lineClass = 'text-line';
        if (currentPuncEngine === 'justified') lineClass += ' is-justified';
        if (currentPuncEngine === 'adobe') lineClass += ' is-adobe-justified';
        
        let html = `<div class="page-text-container" style="--ruby-scale: ${scale};">`;
        
        pageData.lines.forEach(line => {
            let indent = line.indent ? (line.indent.level + 'em') : '0';
            // V.2450: Use padding-left instead of margin-left to keep width: 100% safe
            html += `<div class="${lineClass} ${line.role || 'body'}" style="padding-left: ${indent};">`;
            
            let tokens = line.tokens;

            for (let i = 0; i < tokens.length; i++) {
                let t = tokens[i];
                if (t.type === 'word_boundary') continue;

                // LOGIC: Punctuation Sticky Hook (Supported in Sticky, Justified, and Adobe modes)
                if (currentPuncEngine !== 'normal' && t.type === 'char' && i + 1 < tokens.length && tokens[i+1].type === 'punctuation') {
                    // Wrap Char + Punctuation in a sticky pair
                    html += `<div class="sticky-pair">`;
                    html += renderToken(t);
                    html += renderToken(tokens[i+1]);
                    html += `</div>`;
                    i++; // skip the punctuation token
                } else {
                    html += renderToken(t);
                }
            }
            html += `</div>`;
        });
        html += `</div>`;
        return html;
    };

    /**
     * JS Adobe Master Engine (V.2440)
     * Professional Picture Book Justification.
     */
    function groupIntoRows(elements) {
        const rows = [];
        let cur = [], curTop = null;
        elements.forEach(el => {
            const top = el.offsetTop;
            const tol = el.offsetHeight * 0.4; // 40% tolerance for vertical variations
            if (curTop === null || Math.abs(top - curTop) > tol) {
                if (cur.length) rows.push(cur);
                cur = [];
                curTop = top;
            }
            cur.push(el);
        });
        if (cur.length) rows.push(cur);
        return rows;
    }

    function justifyBlocks(lineDiv) {
        if (currentPuncEngine !== 'adobe') return;
        const selectors = '.char-block, .sticky-pair';
        const blocks = [...lineDiv.querySelectorAll(selectors)];
        
        // 1. Initial State: Clear any JS margins
        blocks.forEach(b => { 
            b.style.marginRight = ''; 
        });

        // Trigger Layout Refresh
        lineDiv.offsetHeight;

        // 2. Identify Rows within the paragraph/line div
        const rows = groupIntoRows(blocks);
        
        // 3. Precise width via getComputedStyle (ignores 3D transform distortion)
        const lineWidth = parseFloat(getComputedStyle(lineDiv).width);

        rows.forEach((row, i) => {
            // Rule: Don't justify paragraph last lines or single-item rows
            if (i === rows.length - 1 || row.length <= 1) {
                row.forEach(b => b.style.marginRight = '');
                return;
            }
            
            // Total width of characters in this row
            let totalW = 0;
            row.forEach(b => {
                totalW += parseFloat(getComputedStyle(b).width);
            });
            
            // V.2470: Balanced Threshold Rule
            // Only skip justification if the row is extremely sparse (less than 30% width).
            // This ensures meaningful rows are stretched as requested.
            if (totalW < lineWidth * 0.3) {
                row.forEach(b => b.style.marginRight = '');
                return;
            }
            
            // Calculate pixel gap to fill the remainder
            const extra = (lineWidth - totalW) / (row.length - 1);
            
            row.forEach((b, j) => {
                if (j < row.length - 1) {
                    b.style.marginRight = `${extra}px`;
                } else {
                    b.style.marginRight = ''; // Line end is flushed right
                }
            });
        });
    }

    function applyAllJustification() {
        // V.2460 Security: Don't run logic while user is interacting with 3D elements
        // This prevents the "jumping" effect during page flip or dragging.
        if (isDragging) return;
        
        if (currentPuncEngine !== 'adobe') {
            document.querySelectorAll('.char-block, .sticky-pair').forEach(b => b.style.marginRight = '');
            return;
        }
        // Apply to each .text-line container specifically
        document.querySelectorAll('.text-line').forEach(line => {
            justifyBlocks(line);
        });
    }

    let mockDataJson = null;
    fetch('mockData.json?v=' + Date.now())
        .then(res => res.json())
        .then(data => {
            mockDataJson = data;
            buildBook();
        })
        .catch(err => {
            console.error("No MockData Found:", err);
            buildBook();
        });

    function buildBook() {
        for (let i = 0; i < TOTAL_LEAVES; i++) {
            const leaf = document.createElement('div');
            leaf.className = 'leaf';
            leaf.dataset.index = i;
            
            const pageNumFront = i * 2 + 1;
            const pageNumBack = i * 2 + 2;

            const imgUrlFront = `https://picsum.photos/seed/book${pageNumFront*7}/1080/1920`;
            const imgUrlBack = `https://picsum.photos/seed/book${pageNumBack*7}/1080/1920`;

            const getPageContent = (n) => {
                if (mockDataJson && mockDataJson.find(p => p.page === n)) {
                    return generateHTMLFromJson(mockDataJson.find(p => p.page === n));
                }
                return '';
            };

            leaf.innerHTML = `
                <div class="face front" style="background-image: url('${imgUrlFront}'); background-size: cover; background-position: center;">
                    ${getPageContent(pageNumFront)}
                    <div class="page-number" style="position: absolute; bottom: 20px; right: 20px; font-size: 1.2rem; font-family: monospace; color: rgba(255,255,255,0.5); text-shadow: 0 1px 3px rgba(0,0,0,0.8);">${pageNumFront}</div>
                    <div class="shadow-overlay"></div>
                </div>
                <div class="face back" style="background-image: url('${imgUrlBack}'); background-size: cover; background-position: center;">
                    ${getPageContent(pageNumBack)}
                    <div class="page-number" style="position: absolute; bottom: 20px; left: 20px; font-size: 1.2rem; font-family: monospace; color: rgba(255,255,255,0.5); text-shadow: 0 1px 3px rgba(0,0,0,0.8);">${pageNumBack}</div>
                    <div class="shadow-overlay"></div>
                </div>
            `;
            book.appendChild(leaf);
            
            const leafObj = { el: leaf, index: i, baseZ: TOTAL_LEAVES - i, angle: 0, isAnimating: false, timer: null };
            leaves.push(leafObj);
            updateLeafTransform(leafObj, 0); 
            
            // Listen for 3D flip animation end to re-justify
            leaf.addEventListener('transitionend', (e) => {
                if (e.propertyName === 'transform' && e.target === leaf) {
                    applyAllJustification();
                }
            });
        }
        
        // Initial Justification with Double RAF and Font Readiness
        if (document.fonts) {
            document.fonts.ready.then(() => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        applyAllJustification();
                    });
                });
            });
        } else {
            setTimeout(applyAllJustification, 300);
        }
        
        window.addEventListener('resize', applyAllJustification);
    }

    function updateLeafTransform(leafObj, angle) {
        angle = Math.max(-180, Math.min(0, angle));
        leafObj.angle = angle;
        
        let currentZ = (TOTAL_LEAVES - leafObj.index); 
        if (angle <= -90) currentZ = leafObj.index; 
        if (angle < 0 && angle > -180) currentZ += 50; 
        
        leafObj.el.style.zIndex = currentZ;
        leafObj.el.style.transform = `rotateY(${angle}deg) translateZ(${leafObj.baseZ}px)`;
        
        // Shadow: ONLY active during mid-flip. Explicitly 0 at both rest positions.
        const absAngle = Math.abs(angle);
        // At exactly 0° or 180°, shadow is always strictly 0 (no floating point risk)
        const shadowVal = (absAngle === 0 || absAngle === 180)
            ? '0'
            : (Math.sin(absAngle * Math.PI / 180) * 0.25).toFixed(2);
        leafObj.el.querySelector('.front .shadow-overlay').style.opacity = shadowVal;
        leafObj.el.querySelector('.back .shadow-overlay').style.opacity = shadowVal;
    }

    book.addEventListener('pointerdown', (e) => {
        const leafEl = e.target.closest('.leaf');
        if (!leafEl) return;
        
        const leafIndex = parseInt(leafEl.dataset.index);
        const leafObj = leaves[leafIndex];
        
        leafObj.el.style.transition = 'none';
        leafObj.el.querySelectorAll('.shadow-overlay').forEach(s => s.style.transition = 'none');
        clearTimeout(leafObj.timer);
        leafObj.isAnimating = false;

        isDragging = true;
        currentDragLeaf = leafObj;
        startX = e.clientX;
        lastClientX = e.clientX;
        startAngle = leafObj.angle;
        bookRect = book.getBoundingClientRect();
        
        book.setPointerCapture(e.pointerId);
    });

    book.addEventListener('pointermove', (e) => {
        if (!isDragging || !currentDragLeaf) return;
        e.preventDefault();
        
        lastClientX = e.clientX;
        const deltaX = e.clientX - startX;
        const dragDist = bookRect.width / 2;
        
        let newAngle = startAngle + (deltaX / dragDist) * 180;
        updateLeafTransform(currentDragLeaf, newAngle);
    });

    const endDrag = () => {
        if (!isDragging || !currentDragLeaf) return;
        isDragging = false;
        
        const leafObj = currentDragLeaf;
        currentDragLeaf = null;
        
        const deltaX = lastClientX - startX;
        let snapAngle;
        
        if (Math.abs(deltaX) < 10) {
            if (startAngle === 0) {
                snapAngle = -180;
                advanceTutorial('next');
            } else if (startAngle === -180) {
                snapAngle = 0;   
                advanceTutorial('prev');
            } else {
                snapAngle = leafObj.angle < -90 ? -180 : 0;
            }
        } else {
            snapAngle = leafObj.angle < -90 ? -180 : 0;
            if (startAngle === 0 && snapAngle === -180) advanceTutorial('next');
            if (startAngle === -180 && snapAngle === 0) advanceTutorial('prev');
        }
        
        leafObj.el.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
        leafObj.el.querySelectorAll('.shadow-overlay').forEach(s => s.style.transition = 'opacity 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)');
        
        updateLeafTransform(leafObj, snapAngle);
        
        // V.2470: Trigger immediate justification for the target position
        setTimeout(applyAllJustification, 50);

        leafObj.isAnimating = true;
        leafObj.timer = setTimeout(() => {
            leafObj.isAnimating = false;
            updateLeafTransform(leafObj, snapAngle); 
        }, 400); 
    };

    book.addEventListener('pointerup', endDrag);
    book.addEventListener('pointercancel', endDrag);

    // Tuning Slider Logic (V.2220)
    const sizeSlider = document.getElementById('size-slider');
    const sizeVal = document.getElementById('size-val');
    const gapSlider = document.getElementById('gap-slider');
    const gapVal = document.getElementById('gap-val');
    const lineSlider = document.getElementById('line-slider');
    const lineVal = document.getElementById('line-val');
    
    const widthSlider = document.getElementById('width-slider');
    const widthVal = document.getElementById('width-val');
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityVal = document.getElementById('opacity-val');
    const blurSlider = document.getElementById('blur-slider');
    const blurVal = document.getElementById('blur-val');
    const radiusSlider = document.getElementById('radius-slider');
    const radiusVal = document.getElementById('radius-val');

    if (sizeSlider && sizeVal) {
        sizeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            sizeVal.textContent = val;
            document.documentElement.style.setProperty('--char-size', val + 'rem');
            applyAllJustification();
        });
    }

    if (gapSlider && gapVal) {
        gapSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            gapVal.textContent = val;
            document.documentElement.style.setProperty('--char-gap', val + 'em');
            applyAllJustification();
        });
    }

    if (lineSlider && lineVal) {
        lineSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            lineVal.textContent = val;
            document.documentElement.style.setProperty('--line-gap', val + 'px');
            applyAllJustification();
        });
    }

    if (widthSlider && widthVal) {
        widthSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            widthVal.textContent = val;
            document.documentElement.style.setProperty('--box-width', val + '%');
            setTimeout(applyAllJustification, 50);
        });
    }

    if (opacitySlider && opacityVal) {
        opacitySlider.addEventListener('input', (e) => {
            const val = e.target.value;
            opacityVal.textContent = val;
            document.documentElement.style.setProperty('--box-opacity', val);
        });
    }

    if (blurSlider && blurVal) {
        blurSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            blurVal.textContent = val;
            document.documentElement.style.setProperty('--box-blur', val + 'px');
        });
    }

    if (radiusSlider && radiusVal) {
        radiusSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            radiusVal.textContent = val;
            document.documentElement.style.setProperty('--box-radius', val + 'px');
        });
    }

    // Punctuation Engine Selector Logic (V.2450)
    const puncEngineSelector = document.getElementById('punc-engine');
    if (puncEngineSelector) {
        // Sync engine choice on change
        puncEngineSelector.addEventListener('change', (e) => {
            currentPuncEngine = e.target.value;
            console.log("Punctuation Engine Switched to:", currentPuncEngine);
            buildBook(); // Re-render triggers JS Justification
        });
        
        // Initial build trigger
        currentPuncEngine = puncEngineSelector.value;
    }
});
