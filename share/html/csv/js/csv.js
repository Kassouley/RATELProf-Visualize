

function defaultConfig() {
    return {
        hiddenColumns: {},
        sortState: {col: null, dir: 1},
        currentPage: 1
    }
}

const ROW_PER_PAGE = 50;

function createCSVtree(list) {
    const ul = document.getElementById("treeView");
    if (!ul) return;
    ul.innerHTML = '';


    for (const [fstIdx, item] of Object.entries(list)) {

        const wrapperLi = document.createElement('li');

        /* ---------- TOP LEVEL ---------- */

        const topLi = document.createElement('div');
        topLi.className = 'tree-1st-lvl';
        topLi.setAttribute('data-1st-index', fstIdx);

        // Arrow
        const arrow = document.createElement('span');
      
        // Title
        const title = document.createElement('span');
        title.textContent = item.name;

        if (!CONFIG[item.file]) CONFIG[item.file] = defaultConfig();

        topLi.appendChild(arrow);
        topLi.appendChild(title);

        wrapperLi.appendChild(topLi);

        /* ---------- SECOND LEVEL ---------- */

        if (item.subCSV && Array.isArray(item.subCSV) && item.subCSV.length > 0) {

            const subUl = document.createElement('ul');
            subUl.style.display = "none"; // collapsed by default
            arrow.classList.add('arrow');
            arrow.classList.add('collapsed');

            item.subCSV.forEach((subLvl, subIdx) => {

                const subLi = document.createElement('li');
                subLi.className = 'tree-2nd-lvl';

                subLi.setAttribute('data-1st-index', fstIdx);
                subLi.setAttribute('data-2nd-index', subIdx);

                subLi.textContent = subLvl.name;

                if (!CONFIG[subLvl.file]) CONFIG[subLvl.file] = defaultConfig();

                subUl.appendChild(subLi);
            });

            wrapperLi.appendChild(subUl);

            /* ---------- TOGGLE ---------- */
            arrow.addEventListener('click', (e) => {
                e.stopPropagation();

                const isOpen = subUl.style.display === "block";

                subUl.style.display = isOpen ? "none" : "block";
                arrow.classList.toggle("collapsed");
            });
        }

        ul.appendChild(wrapperLi);
    };

    ul.addEventListener('click', (e) => onTreeClick(e, list));
    
    const firstItem = ul.querySelector('.tree-1st-lvl, .tree-2nd-lvl');
    if (firstItem) firstItem.click();
}

function onTreeClick(event, list) {
    const item = event.target.closest('.tree-1st-lvl, .tree-2nd-lvl');
    if (!item) return;

    document.querySelectorAll('.tree-selected').forEach(el => {
        el.classList.remove('tree-selected');
    });

    if (item.classList.contains('tree-2nd-lvl')) {
        item.classList.add('tree-selected');

        const fstIdx = item.getAttribute('data-1st-index');
        const subIdx = item.getAttribute('data-2nd-index');

        const csvData = list[fstIdx];
        const subcsvData = csvData.subCSV[subIdx];
        const topData = subcsvData.data ?? csvData.data;

        showTopContent(subcsvData, topData, subIdx);
        showCSV(subcsvData);
        return;
    }

    if (item.classList.contains('tree-1st-lvl')) {
        item.classList.add('tree-selected');

        const fstIdx = item.getAttribute('data-1st-index');
        const csvData = list[fstIdx];
        const topData = csvData.data;

        showTopContent(csvData, topData, fstIdx);
        showCSV(csvData);
        return;
    }
}


function loadCSV(url, onLoad) {
    const csvContainer = document.getElementById("csvContainer")
    const script = document.createElement("script");
    if (!url) {
        csvContainer.style.display = "none";
        return;
    }

    script.src = `data/csv/${type}/${url}`;
    script.type = "text/javascript";

    script.onload = () => {
        csvContainer.style.display = "flex";
        console.log("CSV loaded:", url);
        if (onLoad) onLoad();
    };

    script.onerror = () => {
        csvContainer.style.display = "none";
        console.error("Failed to load:", url);
    };

    document.head.appendChild(script);
}

function createCSV(csvData, currentFile, csvMetadata) {
    let onRowClick = null;
    let onRowClickUargs = null;
    if (csvMetadata.onRowClickColIdx) {
        onRowClick = onClickToTimeline;
        onRowClickUargs = csvMetadata.onRowClickColIdx
    }
    const config = CONFIG[currentFile];

    new CSVTableWrapper(csvData, {
        rowPerPage: ROW_PER_PAGE,
        onRowClick, onRowClickUargs,
        hiddenColumns: config.hiddenColumns,
        sortState: config.sortState,
        currentPage: config.currentPage,
        onConfigChange: (newConfig) => {
            CONFIG[currentFile] = newConfig;
        }
    }, {
        tableContainer: "csv-table",
        notationSelect: "notation",
        timeunitSelect: "timeunit",
        sizeunitSelect: "sizeunit",
        searchBar:  "searchBar",
        columnToggleDiv: "columnToggleContainer",
        prevBtn: "prevPage",
        nextBtn: "nextPage",
        pageSelect: "pageSelect",
        pageInfo: "pageInfo",
        pageRowInfo : "pageRowInfo"
    })
}

function onClickToTimeline(row, colIndices) {
    const {
        rank: rankColIdx,
        start: startColIdx,
        stop: stopColIdx,
        dur: durColIdx
    } = colIndices;
    const start = Number(row[startColIdx]);
    const stop = stopColIdx ? Number(row[stopColIdx]) : start + Number(row[durColIdx]);

    const rankText = String(row[rankColIdx] ?? '').trim();
    const rankMatch = rankText.match(/rank\s*(\d+)/i);
    const rank = parseInt(rankMatch[1], 10);
    const url = new URL('timeline.html', window.location.href);
    url.searchParams.set('rank', Number.isFinite(rank) ? rank : -1);
    url.searchParams.set('start', String(start));
    url.searchParams.set('stop', String(stop));
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
}


function showCSV(data) {
    const currentFile = data.file;
    loadCSV(currentFile, () => {
        createCSV(window.currentCSV, currentFile, data);
    });
}

function showTopContent(csvData, data, index) {
    const container = document.getElementById("topPanel");
    container.innerHTML = '';
    if (!data || !csvData.dataRendering) return;
    window[csvData.dataRendering](container, data, index);
}