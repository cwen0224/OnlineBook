document.addEventListener('DOMContentLoaded', () => {
    const book = document.getElementById('book');
    const flipSheet = document.getElementById('flip-sheet');
    const frontShadow = flipSheet.querySelector('.front .shadow-overlay');
    const backShadow = flipSheet.querySelector('.back .shadow-overlay');
    
    let isDragging = false;
    let currentAngle = 0;
    let bookRect = book.getBoundingClientRect();
    
    // Smooth transition enabled when dragging ends, disabled during active drag 1:1 trace
    const setTransition = (active) => {
        const transitionVal = active ? 'transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';
        const shadowTransition = active ? 'opacity 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';
        
        flipSheet.style.transition = transitionVal;
        frontShadow.style.transition = shadowTransition;
        backShadow.style.transition = shadowTransition;
    };

    // Update the rotation and depths/shadows based on rotation angle (0 to -180)
    const updateFlip = (angle) => {
        angle = Math.max(-180, Math.min(0, angle)); // Clamp
        
        // Triggers the CSS class change via style mapping
        flipSheet.style.transform = `rotateY(${angle}deg)`;
        
        // Progress from 0 (closed, right) to 1 (opened, left)
        const progress = Math.abs(angle) / 180; 
        
        // Front shadow is strongest when page is perpendicular/lifted (-90deg or close to 1 progress)
        frontShadow.style.opacity = progress.toFixed(2);
        // Back shadow fades out as the page hits the flat (-180deg) left side
        backShadow.style.opacity = (1 - progress).toFixed(2);
    };

    // Core execution for pointer math to flip book
    const calculateAngleAndFlip = (clientX) => {
        const halfWidth = bookRect.width / 2;
        const spineX = bookRect.left + halfWidth;
        const pointerDistFromSpine = clientX - spineX;
        
        // Mapping pointer distance: right edge = 0 progress, left edge = 1 progress
        let percentage = (halfWidth - pointerDistFromSpine) / (halfWidth * 2);
        percentage = Math.max(0, Math.min(1, percentage)); 
        
        currentAngle = -180 * percentage;
        updateFlip(currentAngle);
    };

    // --- Pointer Events ---

    book.addEventListener('pointerdown', (e) => {
        bookRect = book.getBoundingClientRect();
        const halfWidth = bookRect.width / 2;
        const spineX = bookRect.left + halfWidth;

        // Allow click/drag only if starting on the right side, or from an active flipping sheet
        if (e.clientX > spineX || currentAngle < 0) {
            isDragging = true;
            setTransition(false); // Stop smooth easing for direct drag follow
            book.setPointerCapture(e.pointerId);
            
            // Initial angle calculation
            calculateAngleAndFlip(e.clientX);
        }
    });

    book.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        calculateAngleAndFlip(e.clientX);
    });

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        
        setTransition(true); // Turn on easing for the snap completion
        
        // Snap behavior: If dragged more than halfway (-90deg), turn fully left, else go back right
        if (currentAngle < -90) {
            currentAngle = -180;
            flipSheet.classList.add('flipped');
        } else {
            currentAngle = 0;
            flipSheet.classList.remove('flipped');
        }
        updateFlip(currentAngle);
    };

    book.addEventListener('pointerup', endDrag);
    book.addEventListener('pointercancel', endDrag);
});
