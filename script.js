document.addEventListener('DOMContentLoaded', () => {
    // 徹底阻擋任何原生的拖曳行為 (包含選擇文字、拖曳影像)
    document.addEventListener('dragstart', (e) => e.preventDefault());

    const book = document.getElementById('book');
    const flipSheet = document.getElementById('flip-sheet');
    const frontShadow = flipSheet.querySelector('.front .shadow-overlay');
    const backShadow = flipSheet.querySelector('.back .shadow-overlay');
    
    let isDragging = false;
    let isAnimating = false;
    let animationTimer = null;
    let currentAngle = 0;
    let bookRect = book.getBoundingClientRect();
    let startX = 0;
    
    // Create 10 logical pages
    const pages = [];
    for (let i = 1; i <= 10; i++) {
        pages.push({
            title: `Page ${i}`,
            content: `This is the detailed content for page ${i}. Adding dynamic multi-page support makes the 3D flipping effect incredibly satisfying to drag left and right!`,
            color: `hsl(${i * 36}, 70%, 95%)`
        });
    }
    
    let N = 0; 
    let flipDirection = null;

    const staticLeft = document.querySelector('.static-left .content');
    const staticRight = document.querySelector('.static-right .content');
    const frontFace = document.querySelector('.face.front .content');
    const backFace = document.querySelector('.face.back .content');

    const populateFace = (element, pageIndex) => {
        if (pageIndex < 0 || pageIndex >= pages.length) {
            element.innerHTML = '<h2>--</h2>';
            element.parentElement.style.backgroundColor = '#fdfdfd';
            return;
        }
        const page = pages[pageIndex];
        element.innerHTML = `<h1>${page.title}</h1><p>${page.content}</p><div class="page-number">${pageIndex + 1}</div>`;
        element.parentElement.style.backgroundColor = page.color;
    };

    const renderIdleState = () => {
        setTransition(false);
        updateFlip(0);
        
        populateFace(staticLeft, N);
        populateFace(frontFace, N + 1);
        
        populateFace(backFace, -1);
        populateFace(staticRight, -1);
    };

    const setTransition = (active) => {
        // 加速動畫至 0.4 秒，感覺更俐落
        const transitionVal = active ? 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';
        const shadowTransition = active ? 'opacity 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';
        
        flipSheet.style.transition = transitionVal;
        frontShadow.style.transition = shadowTransition;
        backShadow.style.transition = shadowTransition;
    };

    const updateFlip = (angle) => {
        angle = Math.max(-180, Math.min(0, angle));
        flipSheet.style.transform = `rotateY(${angle}deg)`;
        currentAngle = angle;
        
        const progress = Math.abs(angle) / 180; 
        frontShadow.style.opacity = progress.toFixed(2);
        backShadow.style.opacity = (1 - progress).toFixed(2);
    };

    const completeAnimation = () => {
        if (!isAnimating) return;
        clearTimeout(animationTimer);
        isAnimating = false;
        flipDirection = null;
        renderIdleState();
    };

    book.addEventListener('pointerdown', (e) => {
        // 若在動畫中點擊，直接強制完成前一個動畫並接受新的一波拖曳 (高速連續翻頁)
        if (isAnimating) {
            completeAnimation();
        }
        
        bookRect = book.getBoundingClientRect();
        const halfWidth = bookRect.width / 2;
        const spineX = bookRect.left + halfWidth;

        startX = e.clientX; 

        if (e.clientX > spineX) {
            // Drag Right -> Left (Next)
            if (N + 2 >= pages.length) return; 
            flipDirection = 'next';
            
            populateFace(staticLeft, N);
            populateFace(frontFace, N + 1);
            populateFace(backFace, N + 2);
            populateFace(staticRight, N + 3);
            
            updateFlip(0);
        } else {
            // Drag Left -> Right (Prev)
            if (N - 2 < 0) return; 
            flipDirection = 'prev';
            
            populateFace(staticLeft, N - 2);
            populateFace(frontFace, N - 1);
            populateFace(backFace, N);
            populateFace(staticRight, N + 1);
            
            setTransition(false);
            updateFlip(-180);
        }

        isDragging = true;
        setTransition(false);
        book.setPointerCapture(e.pointerId);
    });

    book.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        
        const deltaX = e.clientX - startX;
        const dragDist = bookRect.width / 2;
        let percentage;

        if (flipDirection === 'next') {
            percentage = -deltaX / dragDist;
        } else {
            percentage = 1 - (deltaX / dragDist);
        }
        
        percentage = Math.max(0, Math.min(1, percentage)); 
        updateFlip(-180 * percentage);
    });

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        isAnimating = true;
        
        setTransition(true); 
        
        if (currentAngle < -90) {
            updateFlip(-180);
            if (flipDirection === 'next') N += 2;
        } else {
            updateFlip(0);
            if (flipDirection === 'prev') N -= 2;
        }

        animationTimer = setTimeout(() => {
            completeAnimation();
        }, 400); 
    };

    book.addEventListener('pointerup', endDrag);
    book.addEventListener('pointercancel', endDrag);

    renderIdleState();
});
