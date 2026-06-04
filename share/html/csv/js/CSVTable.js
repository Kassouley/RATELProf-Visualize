class CSVTable {
    constructor(containerId, data, {
        rowPerPage = undefined,
        originTimeunit = 'ns',
        originSizeunit = 'B',
        defaultTimeunit = 'ns',
        defaultSizeunit = 'B',
        defaultNotation = 'scientific',
        onRowClick = null,
        onRowClickUargs = null,
        currentPage = 1,
        hiddenColumns = new Array(data[0].length + 1).fill(false), // +1 for "All" toggle
        sortState = {col: null, dir: 1},
        onConfigChange
    } = {}) {
        this.container = document.getElementById(containerId);
        this.container.innerHTML = '';
        
        this.rowPerPage = rowPerPage;

        this.originTimeunit = originTimeunit;
        this.originSizeunit = originSizeunit;
        this.defaultNotation = defaultNotation;
        this.setTimeunit(defaultTimeunit);
        this.setSizeunit(defaultSizeunit);
        this.setNotation(defaultNotation);

        this.onRowClick = onRowClick;
        this.onRowClickUargs = onRowClickUargs;

        this.config = {
            sortState, hiddenColumns, currentPage
        }

        this.onConfigChange = onConfigChange;

        this.header = data[0];
        this.data = data.slice(1);
        this.dataRendered = this.data;

        this.createTable();
    }

    createTable() {
        this.table = document.createElement('table');
        this.container.appendChild(this.table);
        this.thead = document.createElement('thead');
        this.table.appendChild(this.thead);
        this.tbody = document.createElement('tbody');
        this.table.appendChild(this.tbody);
        this.renderHeader();
        this.renderData();
    }

    filterData(searchTerm) {
        this.setPage(1);

        if (!searchTerm || !searchTerm.trim()) {
            this.dataRendered = this.data;
            return;
        }

        const terms = (
            searchTerm.match(/"([^"]+)"|\S+/g) || []
        ).map(term =>
            term.replace(/^"|"$/g, '').toLowerCase()
        );

        this.dataRendered = this.data.filter(row =>
            terms.every(term =>
                row.some(cell =>
                    String(cell).toLowerCase().includes(term)
                )
            )
        );
    }

    setPage(page) {
        this.updateConfig(
            { currentPage: Math.max(1, Math.min(page, this.getTotalPages())) }
        )
    }

    isLastPage() {
        return this.config.currentPage === this.getTotalPages();
    }

    isFirstPage() {
        return this.config.currentPage === 1;
    }

    getTotalPages() {
        if (isNaN(this.rowPerPage)) return 1;
        return Math.ceil(this.dataRendered.length / this.rowPerPage);
    }

    pageData() {
        if (isNaN(this.rowPerPage)) return this.dataRendered;
        const start = (this.config.currentPage - 1) * this.rowPerPage;
        const end = Math.min(start + this.rowPerPage, this.dataRendered.length);
        return this.dataRendered.slice(start, end);
    }

    isHidden(index) {
        return this.config.hiddenColumns[index];
    }

    isAllHidden() {
        return this.config.hiddenColumns[this.config.hiddenColumns.length - 1];
    }

    toggleColumn(index, visible) {
        this.config.hiddenColumns[index] = !visible;
        this.updateConfig();
        this.renderHeader();
        this.renderData();
    }
    
    sortData({col, dir = 1} = {}) {
        if (isNaN(col)) {
            this.dataRendered = this.data;
        } else {
            this.dataRendered = this.dataRendered.sort((a, b) => {
                const valA = a[col];
                const valB = b[col];
                const aNum = parseFloat(valA);
                const bNum = parseFloat(valB);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return dir * (aNum - bNum);
                }
                return dir * String(valA).localeCompare(String(valB));
            });
        }
    }

    updateConfig(newConfig = {}) {
        Object.assign(this.config, newConfig);
        if (this.onConfigChange) this.onConfigChange(this.config);
    }

    renderHeader() {
        this.thead.innerHTML = '';
        const headerRow = document.createElement('tr');
        this.headerRow = headerRow;
        this.header.forEach((cell, index) => {
            const th = document.createElement('th');
            th.classList.add('sortable');
            if (this.config.hiddenColumns[index]) {
                th.style.display = 'none';
            }
            th.onclick = () => {
                const isSameCol = this.config.sortState.col === index;
                const sortState = {
                    col : index,
                    dir : isSameCol ? -this.config.sortState.dir : 1
                }
                this.updateConfig({sortState});
                
                headerRow.querySelectorAll("th.asc, th.desc")
                         .forEach(h => h.classList.remove("asc", "desc"));

                th.classList.toggle("asc",  this.config.sortState.dir === 1);
                th.classList.toggle("desc", this.config.sortState.dir === -1);

                this.sortData(sortState);
                this.renderData();
            };
            th.textContent = cell
                .replace(`(${this.originTimeunit})`, `(${this.currentTimeunit})`)
                .replace(`(${this.originSizeunit})`, `(${this.currentSizeunit})`);

            if (this.config.sortState.col === index) {
                th.classList.add(this.config.sortState.dir === 1 ? 'asc' : 'desc');
            }
            headerRow.appendChild(th);
        });

        if (this.config.sortState.col !== null) {
            this.sortData(this.config.sortState);
        }
        this.thead.appendChild(headerRow);
    }

    changeHeaderUnit(oldUnit, newUnit) {
        this.headerRow?.querySelectorAll("th").forEach(th => {
            th.textContent = th.textContent.replace(`(${oldUnit})`, `(${newUnit})`);
        });
    }

    setTimeunit(unit) {
        this.changeHeaderUnit(this.currentTimeunit, unit);
        this.currentTimeunit = unit;
        const from = this.originTimeunit;
        const to = this.currentTimeunit;
        const units = {'ns': 0, 'µs': 1, 'ms': 2, 's': 3}
        this.timeunitMod = Math.pow(1000, units[from] - units[to])
    }

    setSizeunit(unit) {
        this.changeHeaderUnit(this.currentSizeunit, unit);
        this.currentSizeunit = unit;
        const from = this.originSizeunit;
        const to = this.currentSizeunit;
        const units = {'B': 0, 'KB': 1, 'MB': 2, 'GB': 3}
        this.sizeunitMod = Math.pow(1024, units[from] - units[to]);
    }

    setNotation(notation) {
        this.currentNotation = notation;
    }

    formatTime(value) {
        return this.formatNumber(value * this.timeunitMod);
    }

    formatSize(value) {
        return this.formatNumber(value * this.sizeunitMod);
    }

    formatNumber(value) {
        if (this.currentNotation === 'scientific') {
            return value.toExponential(3);
        } else if (this.currentNotation === 'thousand_separator') {
            return value.toLocaleString('en-US');
        }
        return value;
    }


    renderData() {
        this.tbody.innerHTML = '';
        this.pageData().forEach(row => {
            const tr = document.createElement('tr');
            if (this.onRowClick) {
                tr.style.cursor = 'pointer';
                tr.addEventListener('click', () => {
                        this.onRowClick(row, this.onRowClickUargs);
                });
            }
            row.forEach((cell, index) => {
                const headerCell = this.header[index];
                if (typeof cell === 'number') {
                    if (headerCell.includes(`(${this.originTimeunit})`)) {
                        cell = this.formatTime(cell);
                    } else if (headerCell.includes(`(${this.originSizeunit})`)) {
                        cell = this.formatSize(cell);
                    } else if (headerCell.includes('(%)')) {
                        cell = cell.toFixed(3);
                    } else {
                        cell = this.formatNumber(cell);
                    }
                }

                const td = document.createElement('td');
                if (this.config.hiddenColumns[index]) {
                    td.style.display = 'none';
                }
                let displayCell = cell;
                if (typeof cell === 'string' && cell.length > 64) {
                    displayCell = cell.slice(0, 64) + '...';
                    td.title = cell; // Full cell shown on hover
                }

                td.textContent = displayCell;
                tr.appendChild(td);
            });
            this.tbody.appendChild(tr);
        });
    }
}