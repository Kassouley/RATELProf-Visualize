class Table {
    constructor(container, {
        id, subgroupPadding = 36, max_len = 64
    } = {}) {
        this.subgroupPadding = subgroupPadding;
        this.groupCounter = 1;
        this.pendingGroup = [];
        this.max_len = max_len;


        this.table = document.createElement("table");

        if (id) this.table.id = id;

        this.thead = document.createElement("thead");
        this.tbody = document.createElement("tbody");
        this.table.appendChild(this.thead);
        this.table.appendChild(this.tbody);
        container.appendChild(this.table);
    }

    addRow(cells, props = {}) {
        const { 
            isHeader = false,
            colspan = [], 
            tooltip = null, 
            numberSubrow = 0, 
            collapsed = false, 
            onClick = null } = props;

        const tr = document.createElement("tr");
        tr.style.backgroundColor = ""
        let groupId = null;
        let depth = 0;

        // Handle subrow for pending group
        if (!isHeader && this.pendingGroup.length) {
            const current = this.pendingGroup.at(-1);
            groupId = current.groupId;
            depth = current.depth;
            tr.classList.add(`group-${groupId}`);
            tr.style.display = current.collapsed ? "none" : "table-row";

            if (--current.count <= 0) this.pendingGroup.pop();
        }

        // Handle new group
        if (!isHeader && numberSubrow > 0) {
            groupId = this.groupCounter++;
            tr.dataset.group = groupId;
            if (!collapsed) tr.classList.add("expanded");
            this.pendingGroup.push({ count: numberSubrow, groupId, collapsed, depth: this.pendingGroup.length + 1 });
        }

        // Click handler
        if (typeof onClick === "function") {
            tr.style.cursor = "pointer";
            tr.addEventListener("click", e => {
                if (!e.target.closest(".info-icon")) onClick(tr, e);
            });
        }

        // Build cells
        cells.forEach((content, idx) => {
            const cell = isHeader ? document.createElement("th") : document.createElement("td");
            cell.colSpan = colspan[idx] || 1;
            cell.style.paddingLeft = `${5 + this.subgroupPadding * depth}px`;

            let displayContent = content;
            if (content.length > this.max_len) {
                displayContent = content.slice(0, this.max_len) + '...';
                cell.title = content; // Full content shown on hover
            }

            if (idx === 0) {
                const fragment = document.createDocumentFragment();
                const placeholder = document.createElement("span");
                placeholder.style.display = "inline-block";
                placeholder.style.width = "1em";
                placeholder.style.marginRight = "8px";

                if (!isHeader && numberSubrow > 0) placeholder.appendChild(this.__getCollapseArrow(tr, collapsed, groupId));

                fragment.appendChild(placeholder);

                if (tooltip) {
                    const tooltipSpan = document.createElement("span");
                    tooltipSpan.className = "info-icon";
                    tooltipSpan.title = tooltip;
                    fragment.append(tooltipSpan, document.createTextNode(" "));
                }

                fragment.appendChild(document.createTextNode(displayContent));
                cell.appendChild(fragment);
            } else cell.textContent = displayContent;

            tr.appendChild(cell);
        });

        if (isHeader) this.thead.appendChild(tr);
        else this.tbody.appendChild(tr);

        if (!isHeader) this.__applyAlternateColors();
    }

    forEachRow(callback) {
        Array.from(this.tbody.rows).forEach(callback);
    }

    updateRow(rowIndex, newValues) {
        const tr = this.tbody.rows[rowIndex];
        if (!tr) return;

        newValues.forEach((val, idx) => {
            if (val === null || val === undefined) return;

            const td = tr.cells[idx];
            if (!td) return;

            if (idx === 0) {
                const textNode = Array.from(td.childNodes).reverse().find(n => n.nodeType === Node.TEXT_NODE);
                if (textNode) textNode.textContent = val;
                else td.appendChild(document.createTextNode(val));
            } else td.textContent = val;
        });
    }

    __applyAlternateColors() {
        Array.from(this.tbody.rows)
            .filter(r => r.style.display !== "none")
            .forEach((r, i) => {
                r.classList.remove("even", "odd");
                r.classList.add(i % 2 === 0 ? "even" : "odd");
            });
    }

    __getCollapseArrow(tr, collapsed, groupId) {
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        Object.assign(arrow.style, {
            display: "inline-block",
            width: "1em",
            marginLeft: "4px",
        });

        if (collapsed) arrow.classList.add("collapsed");

       arrow.addEventListener("click", e => {
            e.stopPropagation();

            arrow.classList.toggle("collapsed");
            tr.classList.toggle("expanded");

            const groupRows = this.tbody.querySelectorAll(`.group-${groupId}`);
            const shouldShow = !arrow.classList.contains("collapsed");

            groupRows.forEach(r => r.style.display = shouldShow ? "table-row" : "none");

            this.__applyAlternateColors();
        });

        return arrow;
    }
}