document.addEventListener('DOMContentLoaded', () => {
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
            setTimeout(() => {
                if (tutContainer) tutContainer.remove();
            }, 500);
        }
    };

    // 徹底阻擋原生拖曳
    document.addEventListener('dragstart', (e) => e.preventDefault());

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
});
