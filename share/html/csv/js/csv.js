

function defaultConfig() {
    return {
        hiddenCols: {},
        searchTerm: null,
        sortState: {col: -1, dir: 0},
        currentPage: 1
    }
}

const unitScales = [1, 1e-3, 1e-6, 1e-9];

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
        arrow.className = 'tree-arrow';
        arrow.textContent = '▶';
        if (!item.subCSV || item.subCSV.length == 0) {
            arrow.textContent = '';
        }

        // Title
        const title = document.createElement('span');
        title.textContent = item.name;

        if (!CONFIG[item.file]) CONFIG[item.file] = defaultConfig();

        topLi.appendChild(arrow);
        topLi.appendChild(title);

        wrapperLi.appendChild(topLi);

        /* ---------- SECOND LEVEL ---------- */

        if (item.subCSV && Array.isArray(item.subCSV)) {

            const subUl = document.createElement('ul');
            subUl.style.display = "none"; // collapsed by default

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
                arrow.textContent = isOpen ? "▶" : "▼";
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

    script.src = "../" + url;
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


function searchTerm(data, term) {
    if (!term) return data;
    term = term.trim().toLowerCase();
    return data.filter(row =>
        row.some(cell => String(cell).toLowerCase().includes(term))
    );
}

function sortData(data, sortState) {
    if (!sortState) return data;
    const { col, dir } = sortState;
    data.sort((a, b) => {
        const aVal = a[col];
        const bVal = b[col];

        const aStr = typeof aVal === 'string' ? aVal.trim() : aVal ?? "";
        const bStr = typeof bVal === 'string' ? bVal.trim() : bVal ?? "";

        const aNum = parseFloat(aStr);
        const bNum = parseFloat(bStr);
        let cmp;
        if (!isNaN(aNum) && !isNaN(bNum)) {
            cmp = aNum - bNum;
        } else {
            cmp = aStr.localeCompare(bStr);
        }
        return dir * cmp;
    });
    return data;
}

function createToggleButtons(header, config, displayHeader, displayRows) {
    // Column toggle buttons
    const toggleButtonsContainer = configPanel.querySelector('.hidden-toggle-buttons');
    const { hiddenCols } = config;
    toggleButtonsContainer.innerHTML = '';

    header.forEach((header, index) => {
        const btn = document.createElement('button');
        btn.classList.add(...(hiddenCols[index] ? ['collapsed', 'light'] : ['expanded']));
        btn.textContent = header;
        btn.onclick = () => {
            const isCollapsed = hiddenCols[index];

            if (isCollapsed) {
                hiddenCols[index] = undefined;
            } else {
                hiddenCols[index] = true;
            }

            // Update classes
            btn.classList.toggle('collapsed', !isCollapsed);
            btn.classList.toggle('expanded', isCollapsed);
            btn.classList.toggle('light', !isCollapsed);

            displayHeader();
            displayRows();
        };

        toggleButtonsContainer.appendChild(btn);
    });
}


function createCSV(csvData, config) {
    const headerArr = csvData[0]
    const rows = csvData.slice(1)
    
    function displayHeader() {
        const { sortState, hiddenCols } = config;
        const headerRow = document.getElementById('headerRow');
        headerRow.innerHTML = '';
        headerArr.forEach((header, index) => {
            if (hiddenCols[index]) return;
            const th = document.createElement('th');

            if (header.includes('(ns)')) {
                th.textContent = header.replace('(ns)', `(${timeunitSelect.value})`);
            } else if (header.includes('(B)')) {
                th.textContent = header.replace('(B)',  `(${sizeunitSelect.value})`);
            } else {
                th.textContent = header;
            }

            th.classList.add('sortable');
            th.onclick = () => {
                const allHeaders = headerRow.querySelectorAll('th');
                const isSameCol = sortState.col === index;

                sortState.col = index;
                sortState.dir = isSameCol ? -sortState.dir : 1;

                allHeaders.forEach(header => {
                    if (header !== th) {
                        header.classList.remove("asc", "desc");
                    }
                });

                th.classList.toggle("asc", sortState.dir === 1);
                th.classList.toggle("desc", sortState.dir === -1);

                displayRows();
            };
            if (index == sortState.col) {
                th.classList.toggle("asc", sortState.dir === 1);
                th.classList.toggle("desc", sortState.dir === -1);
            }
            headerRow.appendChild(th);
        });
    }

    function displayRows() {
        const filteredRows = searchTerm(rows, config.searchTerm);
        const sortedRows = sortData(filteredRows, config.sortState);

        // Pagination slice
        const start = (config.currentPage - 1) * ROW_PER_PAGE;
        const end = Math.min(start + ROW_PER_PAGE, rows.length);
        const pageRows = sortedRows.slice(start, end);

        const tbody = document.getElementById('dataRows');
        tbody.innerHTML = '';
        pageRows.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach((cell, index) => {
                if (config.hiddenCols[index]) return;
                const td = document.createElement('td');

                if (typeof cell === 'number') {
                    if (headerArr[index].includes('(ns)')) {
                        cell *= unitScales[timeunitSelect.selectedIndex];
                    } else if (headerArr[index].includes('(KB)')) {
                        cell *= unitScales[sizeunitSelect.selectedIndex];
                    }

                    if (headerArr[index].includes('(%)')) {
                        cell = cell.toFixed(2);
                    } else {
                        if (notationSelect.value === "Thousand Separator") {
                            cell = cell.toLocaleString('en-US'); 
                        } else if (notationSelect.value === "Scientific") {
                            cell = cell.toExponential(3);
                        }
                    }
                }

                let displayCell = cell;
                if (cell.length > 64) {
                    displayCell = cell.slice(0, 64) + '...';
                    td.title = cell; // Full cell shown on hover
                }

                td.textContent = displayCell;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    createToggleButtons(headerArr, config, displayHeader, displayRows);

    function onSearchTerm({target}) {
        config.searchTerm = target.value;
        config.currentPage = 1;
        displayRows();
    }

    function onPageLoad(page) {
        config.currentPage = page;
        displayRows();
    }

    notationSelect.addEventListener("change", displayRows);
    timeunitSelect.addEventListener("change", displayHeader);
    sizeunitSelect.addEventListener("change", displayHeader);
    timeunitSelect.addEventListener("change", displayRows);
    sizeunitSelect.addEventListener("change", displayRows);
    searchBar.addEventListener("input", onSearchTerm);
    searchBar.value = config.searchTerm;
    
    initPagination(Math.ceil(rows.length/ROW_PER_PAGE), config.currentPage, onPageLoad);
    displayHeader();
    displayRows();
}

function showCSV(data) {
    const currentFile = data.file;
    const config = CONFIG[currentFile];
    loadCSV(currentFile, () => {
        createCSV(window.currentCSV, config);
    });
}

function showTopContent(csvData, data, index) {
    const container = document.getElementById("topPanel");
    container.innerHTML = '';
    if (!data || !csvData.dataRendering) return;
    window[csvData.dataRendering](container, data, index);
}