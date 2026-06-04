class Table {
    constructor(container, {
        id, subgroupPadding = 36, max_len = 64, 
        subgroupPaddingOnlyFirstCol = false, subgroupTreeview = false
    } = {}) {
        this.subgroupPadding = subgroupPadding;
        this.subgroupPaddingOnlyFirstCol = subgroupPaddingOnlyFirstCol;
        this.subgroupTreeview = subgroupTreeview;

        this.groupCounter = 0;
        this.pendingGroup = [];
        this.newGroup(Infinity);
        this.max_len = max_len;

        if (typeof container === "string") {
            this.container = document.getElementById(container);
        } else if (container instanceof HTMLElement) {
            this.container = container;
        } else {
            throw new Error("Container must be an HTMLElement or an element ID");
        }
        this.container.innerHTML = '';

        this.table = document.createElement("table");

        if (id) this.table.id = id;

        this.thead = document.createElement("thead");
        this.tbody = document.createElement("tbody");
        this.table.appendChild(this.thead);
        this.table.appendChild(this.tbody);
        this.container.appendChild(this.table);
    }

    newGroup(count, collapsed = false) {
        const groupId = this.groupCounter++;
        const group = { count, groupId, collapsed, depth: this.pendingGroup.length }
        this.pendingGroup.push(group);
        return group;
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
        let current = null

        // Handle subrow for pending group
        if (!isHeader) {
            current = this.pendingGroup.at(-1);

            if (current && (current.count--) <= 0) {
                do {
                    this.pendingGroup.pop();
                    current = this.pendingGroup.at(-1);
                } while (current && current.count <= 0);
            }

            groupId = current.groupId;
            depth = current.depth;

            tr.classList.add(`group-${groupId}`);
            tr.style.display = current.collapsed ? "none" : "table-row";
        }

        // Handle new group
        if (!isHeader && numberSubrow > 0) {
            const newGroup = this.newGroup(numberSubrow, collapsed);
            groupId = newGroup.groupId;
            tr.dataset.group = groupId;
            if (!collapsed) tr.classList.add("expanded");
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
            if (this.subgroupPaddingOnlyFirstCol) {
                if (idx === 0) cell.style.paddingLeft = `${5 + this.subgroupPadding * depth}px`;
            } else {
                cell.style.paddingLeft = `${5 + this.subgroupPadding * depth}px`;
            }

            const isElement = content instanceof Node;
            const isString = typeof content === "string";

            let displayContent = content;

            if (isString && content.length > this.max_len) {
                displayContent = content.slice(0, this.max_len) + "...";
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

                if (this.subgroupTreeview && !isHeader) {
                    const treeSymbol = document.createTextNode("└─ ");
                    if (current.prevTreeSymbol) {
                        current.prevTreeSymbol.textContent = "├─ ";
                    }
                    current.prevTreeSymbol = treeSymbol;
                    fragment.appendChild(treeSymbol);
                }

                if (isElement) {
                    fragment.appendChild(content);
                } else {
                    fragment.appendChild(
                        document.createTextNode(displayContent)
                    );
                }

                if (typeof onClick === "function") {
                    const clickOnMe = document.createElement('div');
                    clickOnMe.className = "click-on-me";
                    fragment.appendChild(clickOnMe)
                }
                cell.appendChild(fragment);
            } else {
                if (isElement) {
                    cell.appendChild(content);
                } else {
                    cell.textContent = displayContent;
                }
            }

            tr.appendChild(cell);
        });

        if (isHeader) this.thead.appendChild(tr);
        else this.tbody.appendChild(tr);

        if (!isHeader) this.__applyAlternateColors();

        return tr;
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