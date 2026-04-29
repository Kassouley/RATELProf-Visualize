// GroupGL.js

class GroupGL {
    constructor(timeline, group, {
                getHistogramTooltip,
                groupLabelHeight = 100,
                barWidth = 0.9,
            } = {}) {
        this.timeline = timeline;
        this.id   = group.id;
        this.name = group.name;
        this.tracks = group.tracks;
        this.histogram = group.histogram;
        this.groupLabelHeight = groupLabelHeight;
        this.barWidth = barWidth;

        this.height = group.height;

        // collapse state: when true, tracks are hidden and group's track-area height becomes zero
        this.collapsed = false;
        this.trackLabelElement = null;
        this.arrowElement = null;

        this.histogramCenterY = this.groupLabelHeight/2
        this.groupCenterY = group.off + this.height/2;

        this.getHistogramTooltip = getHistogramTooltip;
    }

    getId() {
        return this.id || this.name
    }

    getHeight() {
        return this.groupLabelHeight + (this.collapsed ? 0 : this.height);
    }

    createTrackLabels() {
        const trackLabels = document.createElement('div');

        this.tracks.forEach(track => {
            const label = document.createElement('div');
            label.className = 'track-label';
            label.textContent = track.name;
            label.style.height = `${track.height}px`;
            trackLabels.appendChild(label);
        });

        return trackLabels;
    }

    createCollapseArrow(trackLabels) {
        // Collapse arrow
        const arrow = document.createElement('div');
        arrow.className = 'collapse-arrow';

        arrow.classList.toggle('collapsed', this.collapsed);
        trackLabels.classList.toggle('collapsed', this.collapsed);
        
        arrow.addEventListener('click', (e) => {
            e.stopPropagation();
            this.collapsed = !this.collapsed;
                
            arrow.classList.toggle('collapsed', this.collapsed);
            trackLabels.style.display = this.collapsed ? 'none' : 'block';

            this.timeline.hideGroup();
        });

        return arrow;
    }

    createDragHandle(labelContainer) {
        // Drag handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.addEventListener('mousedown', (e) => {
            const draggedContainer = labelContainer;
            draggedContainer.classList.add('dragging');
            this.timeline.draggedContainer = draggedContainer;
        });

        document.addEventListener('mouseup', () => {
            if (this.timeline.draggedContainer) {
                this.timeline.draggedContainer.classList.remove('dragging');
                this.timeline.draggedContainer = null;
            }
        });

        return dragHandle;
    }

    createGroupLabel() {
        const groupLabel = document.createElement('div');
        groupLabel.className = 'group-label';
        groupLabel.style.height = `${this.groupLabelHeight}px`;

        const text = document.createElement('div');
        text.className = 'group-label-text';
        text.textContent = this.name ?? `Group ${this.id}`;

        groupLabel.appendChild(text);

        return groupLabel;
    }

    createLabelContainer(container) {
        const labelContainer = document.createElement('div');
        labelContainer.style.direction = "ltr";

        const groupLabel = this.createGroupLabel();

        const trackLabels = this.createTrackLabels();

        const arrow      = this.createCollapseArrow(trackLabels);
        const dragHandle = this.createDragHandle(labelContainer);

        groupLabel.appendChild(dragHandle);
        groupLabel.appendChild(arrow);

        labelContainer.appendChild(groupLabel);
        labelContainer.appendChild(trackLabels);

        this.labelContainer = labelContainer;

        container.appendChild(labelContainer);
    }


    updateTooltip({object}, event) {
        if (!this.getHistogramTooltip) return;
        const tooltip = document.getElementById('timeline-tooltip');
        if (object) {
            const tooltipRect = tooltip.getBoundingClientRect();
            const off = 10;
            let x = event.center.x + off;
            let y = event.center.y + off;
            if (x + tooltipRect.width > window.innerWidth) {
                x = window.innerWidth - tooltipRect.width - off;
            } // Prevent right overflow
            tooltip.style.display = 'block';
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
            tooltip.innerHTML = this.getHistogramTooltip(object.segments)
        } else {
            tooltip.style.display = 'none';
        }
    }

    renderHistogram() {
        return new HistogramLayer({
            id: `${this.getId()}-histogram`,
            data: this.histogram,
            pickable: true,
            autoHighlight: true,
            height: this.groupLabelHeight,
            barWidth: this.barWidth,
            onHover: (i, e) => this.updateTooltip(i, e)
        });
    }

    getViewID() { return `${this.getId()}-view` }
    getHistogramViewID() { return `${this.getId()}-histogram-view` }

    updateView(globalViewHeight, posY, off) {
        const viewHeight = this.collapsed ? 0 : this.height ;
        const yStart = posY - off + this.groupLabelHeight;
        const yStop = yStart + viewHeight;
        if (this.collapsed || (yStart < 0 && yStop < 0) || 
                yStart > globalViewHeight && yStop > globalViewHeight) 
            return null;

        return new deck.OrthographicView({
            id: this.getViewID(),
            controller: {
                type: ControllerGL,
                zoomAxis : 'X'
            },
            x: 0, width: '100%',
            y: yStart, height: this.height + "px",
        })
    }
    
    updateHistogramView(globalViewHeight, posY, off) {
        const yStart = posY - off;
        const yStop = yStart + this.groupLabelHeight;

        if ((yStart < 0 && yStop < 0) || 
                yStart > globalViewHeight && yStop > globalViewHeight) 
            return null;
            
        return new deck.OrthographicView({
            id: this.getHistogramViewID(),
            controller: {
                type: ControllerGL,
                zoomAxis : 'X'
            },
            x: 0, width: '100%',
            y: yStart, height: this.groupLabelHeight + "px",
        })
    }
}