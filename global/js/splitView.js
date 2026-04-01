function enableSplitView(
    containerId, dividerId,
    splitOrientation, 
    onResize, minSize = 100
) {
    const container = document.getElementById(containerId);
    const divider   = document.getElementById(dividerId);
    let isDragging = false;

    const isVertical = splitOrientation == "vertical";
    const cursor = isVertical ? "col-resize" : "row-resize"
    const axis = isVertical ? 'clientX' : 'clientY';
    const start = isVertical ? 'left' : 'top';
    const sizeProp = isVertical ? 'width' : 'height';
    divider.style.cursor = cursor;

    const style = getComputedStyle(container);
    const paddingStart = parseFloat(isVertical ? style.paddingLeft : style.paddingTop);

    document.addEventListener('pointerup', () => {
        isDragging = false;
        document.body.style.cursor = "default";
        document.body.style.userSelect = 'auto';
    });

    divider.addEventListener('pointerdown', () => {
        isDragging = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = cursor;
    });

    document.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const rect = container.getBoundingClientRect();

        let newSize = e[axis] - rect[start] - 2 * paddingStart;
        const maxSize = rect[sizeProp] - minSize;
        newSize = Math.min(maxSize, Math.max(minSize, newSize));
        onResize(newSize);
    });

}