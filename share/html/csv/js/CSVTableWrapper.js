class CSVTableWrapper {
    constructor(
        data,
        {
            rowPerPage = 10,
            onRowClick,
            onRowClickUargs,
            currentPage,
            hiddenColumns,
            sortState,
            onConfigChange
        } = {},
        containers = {}
    ) {
        this.notationSelect   = document.getElementById(containers.notationSelect);
        this.timeunitSelect   = document.getElementById(containers.timeunitSelect);
        this.sizeunitSelect   = document.getElementById(containers.sizeunitSelect);
        this.searchBar        = document.getElementById(containers.searchBar);
        this.columnToggleDiv  = document.getElementById(containers.columnToggleDiv)
        this.prevBtn          = document.getElementById(containers.prevBtn);
        this.nextBtn          = document.getElementById(containers.nextBtn);
        this.pageSelect       = document.getElementById(containers.pageSelect);
        this.pageInfo         = document.getElementById(containers.pageInfo);
        this.pageRowInfo      = document.getElementById(containers.pageRowInfo);

        this.csvTable = new CSVTable(containers.tableContainer, data, {
            rowPerPage,
            defaultTimeunit: this.timeunitSelect?.value,
            defaultSizeunit: this.sizeunitSelect?.value,
            defaultNotation: this.notationSelect?.value,
            currentPage, hiddenColumns, sortState,
            onRowClick, onRowClickUargs, onConfigChange
        });

        this.initColumnToggles();
        this.setEvent();
        this.updatePagination();
    }

    __appendCheckbox(container, label, checked, event) {
        const wrapper = document.createElement('label');
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '4px';
        wrapper.style.fontWeight = 'normal';
        wrapper.style.userSelect = 'none';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.addEventListener('change', (e) => event(e.target.checked));

        wrapper.appendChild(checkbox);
        wrapper.appendChild(document.createTextNode(label.replace(/\(.*\)/, "")));
        container.appendChild(wrapper);
        return checkbox;
    }

    initColumnToggles() {
        const container = this.columnToggleDiv;
        if (!container) return;
        container.innerHTML = '';

        this.__appendCheckbox(container, "All", !this.csvTable.isAllHidden(), (checked) => {
            const inputs = container.querySelectorAll('input[type=checkbox]');
            inputs.forEach((checkbox, index) => {
                checkbox.checked = checked;
                this.csvTable.toggleColumn(index, checked);
            });
        });

        this.csvTable.header.forEach((label, index) => {
            this.__appendCheckbox(container, label, !this.csvTable.isHidden(index), (checked) => {
                this.csvTable.toggleColumn(index, checked);
            });
        });
    }

    setEvent() {
        this.timeunitSelect?.addEventListener('change', (e) => {
            this.csvTable.setTimeunit(e.target.value);
            this.csvTable.renderData();
        });

        this.sizeunitSelect?.addEventListener('change', (e) => {
            this.csvTable.setSizeunit(e.target.value);
            this.csvTable.renderData();
        });

        this.notationSelect?.addEventListener('change', (e) => {
            this.csvTable.setNotation(e.target.value);
            this.csvTable.renderData();
        });

        this.searchBar?.addEventListener('input', (e) => {
            this.csvTable.filterData(e.target.value);
            this.csvTable.renderData();
            this.updatePagination();
        });

        this.prevBtn?.addEventListener("click", () => {
            this.changePage(this.csvTable.config.currentPage - 1);
        });

        this.nextBtn?.addEventListener("click", () => {
            this.changePage(this.csvTable.config.currentPage + 1)
        });

        this.pageSelect?.addEventListener('change', (e) => {
            this.changePage(e.target.value);
        });
    }

    updateInfo() {
        const totalPages = this.csvTable.getTotalPages();
        if (this.pageInfo) this.pageInfo.textContent = `of ${totalPages}`;
        const startRow = (this.csvTable.config.currentPage - 1) * this.csvTable.rowPerPage + 1;
        const endRow = Math.min(this.csvTable.config.currentPage * this.csvTable.rowPerPage, this.csvTable.dataRendered.length);
        if (this.pageRowInfo) this.pageRowInfo.textContent = `Showing rows ${startRow}-${endRow} of ${this.csvTable.dataRendered.length}`;
    }

    changePage(page) {
        this.csvTable.setPage(page);
        this.csvTable.renderData();
        this.updateInfo();
        if (this.pageSelect) this.pageSelect.value = page;
        if (this.prevBtn) this.prevBtn.disabled = this.csvTable.isFirstPage();
        if (this.nextBtn) this.nextBtn.disabled = this.csvTable.isLastPage();
    }

    updatePagination() {
        if (!this.pageSelect) return;
        const totalPages = this.csvTable.getTotalPages();
        this.pageSelect.innerHTML = "";
        this.updateInfo();

        for (let i = 1; i <= totalPages; i++) {
            const option = document.createElement("option");
            option.value = i;
            option.textContent = i;
            this.pageSelect.appendChild(option);
        }
    }
}