// UtilsGL.js

const START = 0;
const STOP = 1;
const GROUP = 2;
const TRACK = 3;
const SUBTRACK = 4;
const METAOFF = 5;
const METASIZE = 6;
const NAME = 7;


const hashColorCache = new Map();

function hashStringToLightColor(str) {
    if (hashColorCache.has(str)) {
        return hashColorCache.get(str);
    }

    // Simple hash function to generate a color
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert hash to RGB array
    let r = (hash >> 0) & 0xFF;
    let g = (hash >> 8) & 0xFF;
    let b = (hash >> 16) & 0xFF;

    // Keep values in light range (127-255)
    r = Math.floor(r / 2 + 127);
    g = Math.floor(g / 2 + 127);
    b = Math.floor(b / 2 + 127);

    const color = [r, g, b];
    hashColorCache.set(str, color);
    return color;
}

function createDivider(container, {
    direction = 'column', // 'column' | 'row'
    first  = document.createElement('div'),
    second = document.createElement('div'),
    linkClass,
    minSize = "10%",
    maxSize = "90%",
    firstSize = "50%",
    callback = null
} = {}) {

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.flexDirection = direction === 'column' ? 'row' : 'column';

    const divider = document.createElement('div');
    divider.style.position = "sticky";
    divider.classList.add('timeline-divider');

    divider.style.display = 'flex';
    divider.style.alignItems = 'center';
    divider.style.justifyContent = 'center';
    if (direction === 'column') {
        divider.style.cursor = 'col-resize';
        divider.style.top = 0;
        divider.style.bottom = 0;
        divider.dataset.orientation = 'vertical';
    } else {
        divider.style.cursor = 'row-resize';
        divider.style.left = 0;
        divider.style.right = 0;
        divider.dataset.orientation = 'horizontal';
    }

    first.classList.add('pane');
    if (linkClass) first.classList.add(linkClass);
    
    first.style.flexBasis = firstSize;
    if (direction === 'column') {
        first.style.minWidth = minSize;
        first.style.maxWidth = maxSize;
    } else {
        first.style.minHeight = minSize;
        first.style.maxHeight = maxSize;
    }

    second.style.flex = '1';
    second.style.minWidth = '0';
    second.style.minHeight = '0';

    wrapper.append(first, divider, second);
    container.appendChild(wrapper);

    const triggerCallback = () => {
        if (typeof callback === 'function') {
            const firstDimension = direction === 'column' ? first.offsetWidth : first.offsetHeight;
            const secondDimension = direction === 'column' ? second.offsetWidth : second.offsetHeight;
            callback(firstDimension, secondDimension);
        }
    };

    divider.addEventListener('mousedown', (e) => {
        e.preventDefault();

        const startPos = direction === 'column' ? e.clientX : e.clientY;
        const startSize = direction === 'column'
            ? first.offsetWidth
            : first.offsetHeight;

        const onMove = (e) => {
            const currentPos = direction === 'column' ? e.clientX : e.clientY;
            const newSize = Math.max(startSize + currentPos - startPos, 0);
            const newSizePx = `${newSize}px`;
            
            if (linkClass) {
                document.querySelectorAll('.' + linkClass).forEach(pane => {
                    pane.style.flexBasis = newSizePx;
                });
            } else {
                first.style.flexBasis = newSizePx;
            }

            triggerCallback();
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    return wrapper;
}