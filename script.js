document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('instruction-overlay');
    const closeBtn = document.getElementById('close-instruction');

    const closeOverlay = () => {
        if (overlay && overlay.style.opacity !== '0') {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 400);
        }
    };

    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

    // 徹底阻擋原生拖曳
    document.addEventListener('dragstart', (e) => e.preventDefault());

    const book = document.getElementById('book');
    let isDragging = false;
    let currentDragLeaf = null;
    let startX = 0;
    let lastClientX = 0;
    let startAngle = 0;
    let bookRect = book.getBoundingClientRect();
    
    // 設定高規格的全 3D 厚度架構 (多重樹狀葉面)
    const TOTAL_LEAVES = 5; // 5 張雙面實體紙 = 10 頁
    const leaves = [];
    
    book.innerHTML = ''; // 清除舊版靜態渲染

    for (let i = 0; i < TOTAL_LEAVES; i++) {
        const leaf = document.createElement('div');
        leaf.className = 'leaf';
        leaf.dataset.index = i;
        
        const pageNumFront = i * 2 + 1;
        const pageNumBack = i * 2 + 2;

        const imgUrlFront = `https://picsum.photos/seed/book${pageNumFront*7}/1080/1920`;
        const imgUrlBack = `https://picsum.photos/seed/book${pageNumBack*7}/1080/1920`;

        leaf.innerHTML = `
            <div class="face front" style="background-image: url('${imgUrlFront}'); background-size: cover; background-position: center;">
                <div class="page-number" style="position: absolute; bottom: 30px; right: 40px; font-size: 3rem; font-weight: bold; color: white; text-shadow: 0 2px 15px rgba(0,0,0,1);">${pageNumFront}</div>
                <div class="shadow-overlay"></div>
            </div>
            <div class="face back" style="background-image: url('${imgUrlBack}'); background-size: cover; background-position: center;">
                <div class="page-number" style="position: absolute; bottom: 30px; left: 40px; font-size: 3rem; font-weight: bold; color: white; text-shadow: 0 2px 15px rgba(0,0,0,1);">${pageNumBack}</div>
                <div class="shadow-overlay"></div>
            </div>
        `;
        book.appendChild(leaf);
        
        const leafObj = {
            el: leaf,
            index: i,
            baseZ: TOTAL_LEAVES - i,
            angle: 0,
            isAnimating: false,
            timer: null
        };
        
        leaves.push(leafObj);
        updateLeafTransform(leafObj, 0); 
    }

    function updateLeafTransform(leafObj, angle) {
        angle = Math.max(-180, Math.min(0, angle));
        leafObj.angle = angle;
        
        let currentZ = (TOTAL_LEAVES - leafObj.index); 
        if (angle <= -90) currentZ = leafObj.index; 
        if (angle < 0 && angle > -180) currentZ += 50; 
        
        leafObj.el.style.zIndex = currentZ;
        leafObj.el.style.transform = `rotateY(${angle}deg) translateZ(${leafObj.baseZ}px)`;
        
        const progress = Math.abs(angle) / 180;
        const frontShadow = leafObj.el.querySelector('.front .shadow-overlay');
        const backShadow = leafObj.el.querySelector('.back .shadow-overlay');
        frontShadow.style.opacity = progress.toFixed(2);
        backShadow.style.opacity = (1 - progress).toFixed(2);
    }

    book.addEventListener('pointerdown', (e) => {
        closeOverlay();
        
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
        
        // 若單純點擊（位移 < 10px），自動全頁翻轉
        if (Math.abs(deltaX) < 10) {
            if (startAngle === 0) {
                snapAngle = -180; // 點擊右側，自動翻向左
            } else if (startAngle === -180) {
                snapAngle = 0;    // 點擊左側，自動翻回右
            } else {
                snapAngle = leafObj.angle < -90 ? -180 : 0;
            }
        } else {
            snapAngle = leafObj.angle < -90 ? -180 : 0;
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
});
