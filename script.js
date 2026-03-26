document.addEventListener('DOMContentLoaded', () => {
    // 徹底阻擋原生拖曳
    document.addEventListener('dragstart', (e) => e.preventDefault());

    const book = document.getElementById('book');
    let isDragging = false;
    let currentDragLeaf = null;
    let startX = 0;
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

        leaf.innerHTML = `
            <div class="face front" style="background-color: hsl(${pageNumFront*36}, 70%, 95%)">
                <div class="content">
                    <h1>Page ${pageNumFront}</h1>
                    <p>這是一本真實 3D 多重書頁體驗的電子書，你可以同時撥動好幾頁在空中飛舞，完美實現連續狂翻！</p>
                    <div class="page-number">${pageNumFront}</div>
                </div>
                <div class="shadow-overlay"></div>
            </div>
            <div class="face back" style="background-color: hsl(${pageNumBack*36}, 70%, 95%)">
                <div class="content">
                    <h1>Page ${pageNumBack}</h1>
                    <p>獨立的紙張 DOM 元素不受任何動畫延遲拘束！</p>
                    <div class="page-number">${pageNumBack}</div>
                </div>
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
        
        // 使用原生的 Z-index 搭配 TranslateZ 解決 Safari 破圖，堆疊邏輯：
        let currentZ = (TOTAL_LEAVES - leafObj.index); // 右側閉合時，0號在最上面 (5)
        if (angle <= -90) currentZ = leafObj.index; // 左側翻開時，4號在最上面 (4)
        if (angle < 0 && angle > -180) currentZ += 50; // 空中飄浮時，Z軸大幅提升避免穿模
        
        leafObj.el.style.zIndex = currentZ;
        leafObj.el.style.transform = `rotateY(${angle}deg) translateZ(${leafObj.baseZ}px)`;
        
        // 陰影渲染
        const progress = Math.abs(angle) / 180;
        const frontShadow = leafObj.el.querySelector('.front .shadow-overlay');
        const backShadow = leafObj.el.querySelector('.back .shadow-overlay');
        frontShadow.style.opacity = progress.toFixed(2);
        backShadow.style.opacity = (1 - progress).toFixed(2);
    }

    book.addEventListener('pointerdown', (e) => {
        const leafEl = e.target.closest('.leaf');
        if (!leafEl) return;
        
        const leafIndex = parseInt(leafEl.dataset.index);
        const leafObj = leaves[leafIndex];
        
        // 瞬間物理接住這張隨時在空中的實體書頁
        leafObj.el.style.transition = 'none';
        leafObj.el.querySelectorAll('.shadow-overlay').forEach(s => s.style.transition = 'none');
        clearTimeout(leafObj.timer);
        leafObj.isAnimating = false;

        isDragging = true;
        currentDragLeaf = leafObj;
        startX = e.clientX;
        startAngle = leafObj.angle;
        bookRect = book.getBoundingClientRect();
        
        book.setPointerCapture(e.pointerId);
    });

    book.addEventListener('pointermove', (e) => {
        if (!isDragging || !currentDragLeaf) return;
        e.preventDefault();
        
        const deltaX = e.clientX - startX;
        const dragDist = bookRect.width / 2;
        
        // 無論往左往右，皆換算成物理角度推播
        let newAngle = startAngle + (deltaX / dragDist) * 180;
        updateLeafTransform(currentDragLeaf, newAngle);
    });

    const endDrag = () => {
        if (!isDragging || !currentDragLeaf) return;
        isDragging = false;
        
        const leafObj = currentDragLeaf;
        currentDragLeaf = null;
        
        // 自動吸附
        let snapAngle = leafObj.angle < -90 ? -180 : 0;
        
        leafObj.el.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
        leafObj.el.querySelectorAll('.shadow-overlay').forEach(s => s.style.transition = 'opacity 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)');
        
        updateLeafTransform(leafObj, snapAngle);
        
        leafObj.isAnimating = true;
        leafObj.timer = setTimeout(() => {
            leafObj.isAnimating = false;
            updateLeafTransform(leafObj, snapAngle); // 確保最終定位
        }, 400); 
    };

    book.addEventListener('pointerup', endDrag);
    book.addEventListener('pointercancel', endDrag);
});
