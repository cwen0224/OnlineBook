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
    const renderZhuyin = (z) => {
        if (!z) return '';
        const chars = [...z]; // spread to handle full Unicode
        const body = chars.filter(c => !TONE_MARKS.has(c));
        const tone = chars.find(c => TONE_MARKS.has(c)) || '';
        const bodyHtml = body.map(c => `<span class="zh-c">${c}</span>`).join('');
        const toneHtml = tone ? `<div class="zh-col-tone"><span class="zh-c">${tone}</span></div>` : '';
        return `<div class="zh-col-main">${bodyHtml}</div>${toneHtml}`;
    };

    const generateHTMLFromJson = (pageData) => {
        if (!pageData || !pageData.lines) return '';
        let scale = pageData.ruby_scale || 0.5;
        let html = `<div class="page-text-container" style="--ruby-scale: ${scale};">`;
        pageData.lines.forEach(line => {
            let indent = line.indent ? (line.indent.level + 'em') : '0';
            html += `<div class="text-line ${line.role || 'body'}" style="margin-left: ${indent};">`;
            
            let currentGroup = [];
            let groups = [];
            
            for (let i = 0; i < line.tokens.length; i++) {
                let t = line.tokens[i];
                if (t.type === 'word_boundary') continue; // Bound marker
                
                if (i > 0 && line.tokens[i-1].type !== 'word_boundary') {
                    // Separate unless previous was boundary
                    if (currentGroup.length > 0) {
                        groups.push(currentGroup);
                        currentGroup = [];
                    }
                }
                currentGroup.push(t);
            }
            if (currentGroup.length > 0) groups.push(currentGroup);

            groups.forEach(grp => {
                if (grp.length > 1) html += `<div class="word-group">`;
                grp.forEach(t => {
                    if (t.type === 'char' || t.type === 'punctuation') {
                        let wUnits = t.width_units ? `flex-basis: ${t.width_units}em; min-width: ${t.width_units}em;` : '';
                        html += `<div class="char-block" style="${wUnits}">`;
                        if (t.type === 'char') {
                            // Pinyin sits above as a separate row (hidden by default)
                            html += `<div class="char-rt pinyin">${t.pinyin || ''}</div>`;
                            // char-row: [kanji] + [zhuyin two-column block]
                            html += `<div class="char-row">`;
                            html += `<div class="char-base ${t.polyphone || t.emphasis ? 'polyphone-warning' : ''}">${t.char}</div>`;
                            html += `<div class="char-rt zhuyin">${renderZhuyin(t.zhuyin)}</div>`;
                            html += `</div>`;
                        } else {
                            html += `<div class="char-row"><div class="char-base">${t.char}</div></div>`;
                        }
                        html += `</div>`;
                    } else if (t.type === 'space') {
                        // Using a generic block for space parsing
                        html += `<div class="char-block space" style="min-width: 0.5em;"></div>`;
                    }
                });
                if (grp.length > 1) html += `</div>`;
            });

            html += `</div>`;
        });
        html += `</div>`;
        return html;
    };

    let mockDataJson = null;
    // Add cache-busting to ensure mockData.json is always fresh
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
        }
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
        
        leafObj.isAnimating = true;
        leafObj.timer = setTimeout(() => {
            leafObj.isAnimating = false;
            updateLeafTransform(leafObj, snapAngle); 
        }, 400); 
    };

    book.addEventListener('pointerup', endDrag);
    book.addEventListener('pointercancel', endDrag);

    book.addEventListener('pointerup', endDrag);
    book.addEventListener('pointercancel', endDrag);
});
