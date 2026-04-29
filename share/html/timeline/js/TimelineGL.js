// TimelineGL.js


class TimelineGL {
    constructor(containerId, {
                trackHeight = 20,
                eventHeight = 16,
                groupLabelHeight = 100,
                gridColor = [128, 128, 128, 100],
                axisOptions = {},
                padding = 0,
                minTime = 0,
                maxTime = null,
                minZoom = maxTime,
                maxZoom = 20,
                getEventTooltip,
                getHistogramTooltip,
                onEventClick,
                onTimelineInit,
                initialView = [minTime, maxTime],
                maxLoadedBuckets = 100,
                maxBucketSize = 10000,
                viewPadding = 10000
            } = {}) {

        this.minTime = minTime; 
        this.maxTime = maxTime; 
        this.padding = padding;
        this.trackHeight = trackHeight;
        this.eventHeight = eventHeight;
        this.gridColor = gridColor;
        this.groupLabelHeight = groupLabelHeight;
        this.minUserZoom = minZoom;
        this.maxUserZoom = maxZoom;
        this.maxBucketSize = maxBucketSize;
        this.getEventTooltip = getEventTooltip;
        this.getHistogramTooltip = getHistogramTooltip;
        this.initialView = initialView;
        this.maxLoadedBuckets = maxLoadedBuckets;
        this.viewPadding = viewPadding;
        this.onEventClick = onEventClick;
        this.onTimelineInit = onTimelineInit;
        this.viewStart = this.initialView[0];
        this.viewStop  = this.initialView[1];

        this.scrollOffset = 0;
        this.lastClickedEvent = null;

        this.createTooltip();
        
        this.highlightPolygons = [{polygon: new Array(8).fill(-1)}];

        this.createMainContainer(containerId);
        this.createTimeAxis(axisOptions);

        // set up mouse-based drag & drop for groups
        this.setDragEvent();
    }

    // onResize = (entries) => {
    //     const { width } = entries[0].contentRect;
    //     this.setTimelineWidth(width);
    // };

    destroy() {
         if (this.deckgl) this.deckgl.finalize();
        // this.resizeObserver.disconnect();
    }

    getView() {
        return [this.viewStart, this.viewStop];
    }

    loadFile(file) {
        this.destroy();

        const { 
            getEventTooltip,
            getHistogramTooltip, 
            gridColor,
            groupLabelHeight, 
            trackHeight, 
            eventHeight,
            maxLoadedBuckets,
            viewPadding,
            maxTime,
            maxBucketSize
        } = this;

        const groupOpt = {
            getHistogramTooltip,
            gridColor,
            groupLabelHeight,
            trackHeight,
            eventHeight
        };

        this.bucketManager = new BucketManager(file, {
            trackHeight,
            eventHeight,
            maxLoadedBuckets,
            viewPadding,
            getEventTooltip,
            maxTime,
            maxBucketSize,
            onInit: ({maxTime, groups}) => {
                this.maxTime = maxTime;
                this.maxVisibleRange = this.minUserZoom ?? maxTime;
                this.minVisibleRange = this.maxUserZoom;

                this.setInitialViewstate(this.viewStart, this.viewStop);

                this.groups = groups.map(g => new GroupGL(this, g, groupOpt));
                
                this.horizontalLineLayout = this.getLineLayout();
                this.timelineHeight = this.getTimelineHeight();
                this.originalHeight = this.timelineHeight;

                this.initializeGL();
                if (this.onTimelineInit) this.onTimelineInit(this);
            },

            onRequestSucceed: () => {
                this.renderLayers();
            },

            onMetadataReady: (metadata) => {
                if (this.onEventClick) this.onEventClick(this.lastClickedEvent, metadata);
            },

            onEventClick: (object, index, bucket, event) => {
                if (!object) return;
                if (event.type === "dblclick") {
                    this.gotoView(object[START], object[STOP]);
                }
                
                // Store the clicked event for metadata handling
                this.lastClickedEvent = object;
                
                // Request metadata from the worker
                this.bucketManager.requestMetadata(object);
                
                // Highlight the polygon
                const eventStride = 8;
                const eventOffset = index * eventStride
                const polygon = bucket.polygonBuffer.subarray(eventOffset, eventOffset + eventStride);
                this.highlightPolygons = [{polygon}];
                this.renderLayers();
            },
        })
    }

    createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.id = "timeline-tooltip"
        tooltip.style.position = 'absolute';
        tooltip.style.zIndex = 1;
        tooltip.style.pointerEvents = 'none';
        document.body.append(tooltip);
    }


    getGridLines() {
        // Visible range in world units
        const centerX = this.viewCenter;
        const halfWidth = this.timelineWidth / this.currZoomScale
        const start = centerX - halfWidth;
        const end   = centerX + halfWidth;
        const range = end - start;

        // Fast "nice step" calculation (1 / 2 / 5 × 10ⁿ)
        const log10 = Math.log10(range * 0.1);
        const pow10 = Math.pow(10, Math.floor(log10));
        const norm  = range / (pow10 * 10);

        const step =
            norm > 5 ? pow10 * 5 :
            norm > 2 ? pow10 * 2 :
                    pow10;

        // Align first tick
        let t = Math.ceil(start / step) * step;

        // Preallocate (upper bound)
        const count = Math.ceil(range / step) + 1;
        if (!count || count == NaN || count == 0) return [];
        const lines = new Array(count);

        let i = 0;
        for (; t <= end; t += step) {
            lines[i++] = { time: t, x: t };
        }

        lines.length = i; // trim
        return lines;
    }

    setTimelineWidth(width) {
        width = width ?? this.axisCanvas.clientWidth;
        this.timelineWidth = width;
        this.axisCanvas.width = width;

        this.setBoundedZoom();
        this.viewZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.viewZoom));
        this.histogramZoom = Math.max(this.minHistogramZoom, Math.min(this.maxHistogramZoom, this.histogramZoom));
        this.syncView();
        this.syncHistogram();
    }

    setTimelineHeight(height) {
        height = height ?? this.mainContainer.clientHeight;
        this.mainContainer.style.height = `${height}px`;
        height -= this.axisOptions.height; 
        this.globalViewHeight = height;
        this.trackLabelContainer.style.height = `${height}px`;
        this.deckContainer.style.height = `${height}px`;
        this.deckgl.setProps({height});
        this.updateViews();
    }

    hideGroup() {
        this.updateViews();
    }

    // Swap two groups (by id) and update DOM order and views
    reorderGroups(source, target) {
        const children = Array.from(this.trackLabelContainer.children);
        const draggedIndex = children.indexOf(source);
        const targetIndex = children.indexOf(target);

        if (draggedIndex < targetIndex) {
            this.trackLabelContainer.insertBefore(source, target.nextSibling);
        } else {
            this.trackLabelContainer.insertBefore(source, target);
        }

        // update groups array to match new DOM order
        const newOrder = Array.from(this.trackLabelContainer.children)
                                .map(container => {
            return this.groups.find(g => g.labelContainer === container);
        });
        this.groups = newOrder;

        // update views
        this.updateViews();
    }

    // Mouse-based drag & drop for reordering groups with visual feedback
    setDragEvent() {
        document.addEventListener('mousemove', (e) => {
            const source = this.draggedContainer
            if (!source) return;

            const element = document.elementFromPoint(e.clientX, e.clientY);
            let groupLabel = element.closest('.group-label');
            if (!groupLabel) return; // not over a group label, skip reorder
            
            const target = groupLabel.parentElement;
            if (!target) return;

            this.reorderGroups(source, target);
        });
    }



    getLineLayout() {
        const layout = [];
        for (const group of Object.values(this.groups)) {
            for (const track of Object.values(group.tracks)) {
                layout.push(track.off);
            }
        }
        return layout;
    }


    onDragStart(info, event) {
        if (event.rightButton && info && info.coordinate) {
            this.rangeSelectionLayer = null;
            const rangeStart = info.coordinate[0];
            this.rangeSelection = [ [rangeStart, rangeStart] ];
        }
    }

    getRangePolygon(e, y1, y2) {
        const x1 = e[0];
        const x2 = e[1];
        return [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]   
    }

    onDrag(info, event) {
        if (event.rightButton && info && info.coordinate) {
            const rangeStop = info.coordinate[0];
            this.rangeSelection[0][1] = rangeStop;

            this.rangeSelectionLayer = new deck.SolidPolygonLayer({
                id: '__internal-range-selection',
                data: this.rangeSelection,
                getPolygon: e => this.getRangePolygon(e, 0, this.originalHeight),
                getFillColor: [0, 0, 0, 40],
                updateTriggers: {
                    getPolygon: rangeStop
                }
            })

            this.drawTimeAxis();
            this.renderLayers();
        }
    }

    onDragEnd(info, event) {
        this.requestRender();
        this.renderLayers();
        if (event.rightButton) {
            this.onDrag(info, event);
            console.log("TODO: Compute the number of events in the range")
        }
    }


    initializeGL() {
        this.createTimelineContainer();

        this.deckgl = new deck.DeckGL({
            container: this.deckContainer,
            useDevicePixels: false,
            onDragStart: (i, e) => this.onDragStart(i, e),
            onDrag:      (i, e) => this.onDrag(i, e),
            onDragEnd:   (i, e) => this.onDragEnd(i, e),
            onClick: (info, event) => {
                if (!info || !info.viewport) return;
                if (info.viewport.id.includes("histogram")) {
                    const center = this.scaleXFromHistogramToTimeline(info.coordinate[0]);
                    this.syncView(center);
                    this.requestRender();
                    return;
                }
                if (event.rightButton) {
                    this.rangeSelection = null;
                    this.rangeSelectionLayer = null;
                    this.drawTimeAxis();
                    this.renderLayers();
                    return;
                }
                if (info.index >= 0) return;
                this.highlightPolygons = [{polygon: new Array(8).fill(-1)}];
                this.renderLayers();
            },
            onViewStateChange: ({viewState, viewId}) => {
                if (viewId && viewId.includes("histogram"))
                    this.syncHistogram(viewState.target[0], viewState.zoom[0]);
                else
                    this.syncView(viewState.target[0], viewState.zoom[0]);
            },

            onInteractionStateChange: (interactionState) => {
                if (interactionState.isZooming) {
                    this.requestRender();
                }
            },

            layerFilter: ({layer, viewport}) => {
                const lid  = layer.id;
                const vid  = viewport.id;
                if (lid !== "__internal-preview-range"
                    && vid.includes('histogram') && !lid.includes('histogram')) {
                    return false;
                }
                return true;
            },

        });

        let defaultHeight = this.mainContainer.clientHeight;
        let idealHeight = this.timelineHeight + this.axisOptions.height;
        if (defaultHeight > idealHeight) {
            defaultHeight = idealHeight;
        }
        this.setTimelineWidth();
        this.setTimelineHeight(defaultHeight);
        
        this.updateViews();
        this.requestRender();

    }

    requestMetadata(event) {
        this.bucketManager.requestMetadata(event);
    }

    requestRender() {
        this.bucketManager.requestRender(this.viewStart, this.viewStop);
    }

    renderHighlightEvent() {
        return new deck.PolygonLayer({
            id: '__internal-event-highlight',
            positionFormat: 'XY',
            data: this.highlightPolygons,
            getPolygon: d => d.polygon,
            filled: false,
            getLineColor: [255, 255, 0], // yellow
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            coordinateOrigin: [ this.groupLabelHeight, 0, 0 ],
        })
    }

    renderPreviewRange() {
        const y = this.groupLabelHeight;
        const scaledStart = this.scaleXFromTimelineToHistogram(this.viewStart);
        const scaledStop  = this.scaleXFromTimelineToHistogram(this.viewStop);
        return new deck.PolygonLayer({
            id: '__internal-preview-range',
            data: [[scaledStart, scaledStop]],
            getPolygon: e => this.getRangePolygon(e, 0, -y),
            lineWidthUnits: "pixels",
            getLineColor: [255, 255, 0],
            getFillColor: [255, 255, 0, 32],
        })
    }

    renderBackgroundGrid() {
        const h = this.originalHeight;
        return [
            new deck.LineLayer({
                id: '__internal-vertical-grid',
                data: this.currGrid,
                getSourcePosition: d => [d.x, 0],
                getTargetPosition: d => [d.x, h],
                getColor: this.gridColor,
                coordinateOrigin: [ this.groupLabelHeight, 0, 0 ],
                getWidth: 1
            }),
            new deck.LineLayer({
                id: '__internal-horizontal-grid',
                data: this.horizontalLineLayout,
                getSourcePosition: y => [this.viewStart , y],
                getTargetPosition: y => [this.viewStop , y],
                getColor: this.gridColor,
                getWidth: 1,
                coordinateOrigin: [ this.groupLabelHeight, 0, 0 ],
                updateTriggers: {
                    getSourcePosition: this.viewStart,
                    getTargetPosition: this.viewStop
                }
            })
        ]
    }

    renderLayers() {
        const layers = [
            this.groups.map(g => g.renderHistogram()),
            this.renderPreviewRange(),
            this.renderBackgroundGrid(),
            this.bucketManager.renderBuckets(this.viewStart, this.viewStop),
            this.renderHighlightEvent(),
            this.rangeSelectionLayer
        ];
        this.deckgl.setProps({layers});
    }

    scaleXFromTimelineToHistogram(x) {
        return (
            (x - this.minTime) /
            (this.maxTime - this.minTime)
        ) * 1000;
    }

    scaleXFromHistogramToTimeline(x) {
        return (
            x / 1000
        ) * (this.maxTime - this.minTime) +
        this.minTime;
    }

    getZoomFromTime(time, padding = this.padding) {
        return Math.log2((this.timelineWidth - 2 * padding) / time);
    }

    computeViewState() {
        const vs = {}
        for (const group of this.groups) {
            vs[group.getViewID()] = {
                target: [this.viewCenter, group.groupCenterY, 0],
                zoom:   [this.viewZoom, 0],
                minZoom: this.minZoom,
                maxZoom: this.maxZoom
            };

            vs[group.getHistogramViewID()] = {
                target: [this.histogramCenter, -group.histogramCenterY, 0],
                zoom:   [this.histogramZoom, 0],
                minZoom: this.minHistogramZoom,
                maxZoom: this.maxHistogramZoom
            }
        }
        return vs;
    }

    updateViews() {
        const views = [];
        let yOffset = 0;
        for (const group of this.groups) {
            views.push(group.updateView(this.globalViewHeight, yOffset, this.scrollOffset));
            views.push(group.updateHistogramView(this.globalViewHeight, yOffset, this.scrollOffset));
            yOffset += group.getHeight();
        }

        this.deckgl.setProps({ views });
    }

    setBoundedZoom() {
        this.maxZoom = this.getZoomFromTime(this.minVisibleRange);
        this.minZoom = this.getZoomFromTime(this.maxVisibleRange);
        this.maxHistogramZoom = this.getZoomFromTime(100, 0);
        this.minHistogramZoom = this.getZoomFromTime(1000, 0);
    }

    setInitialViewstate(initialStart, initialEnd) {
        initialStart = Math.max(initialStart, this.minTime);
        initialEnd   = Math.min(initialEnd, this.maxTime);

        let padding = undefined;
        if (initialStart != this.minTime && initialEnd != this.maxTime) {
            padding = 0;
        }
  
        this.setBoundedZoom();
        const {center, zoom} = this.computeViewFromRange(initialStart, initialEnd, padding);
        const defaultZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));

        this.maxPadding = this.padding / Math.pow(2, this.minZoom);

        this.setBoundedViewstate(center, defaultZoom);
        this.setBoundedHistogram(500, this.minHistogramZoom);
    }

    computeBoundedCenter(center, zoom, padding, min, max) {
        const visibleWorldHalfWidth = (this.timelineWidth - padding) / (2 * zoom);
        const minCenterX = min + visibleWorldHalfWidth;
        const maxCenterX = max - visibleWorldHalfWidth;
        const viewCenter = Math.max(minCenterX, Math.min(maxCenterX, center));
        return {
            viewCenter,
            viewStart: viewCenter - visibleWorldHalfWidth,
            viewStop: viewCenter + visibleWorldHalfWidth
        };
    }

    setBoundedViewstate(center, zoom) {
        this.currZoomScale = Math.pow(2, zoom);

        const {
            viewCenter, viewStart, viewStop
        } = this.computeBoundedCenter(
            center, this.currZoomScale, this.padding,
            this.minTime, this.maxTime
        );

        this.viewCenter = viewCenter;
        this.viewStart  = viewStart;
        this.viewStop   = viewStop;
        this.viewZoom   = zoom;
    }

    setBoundedHistogram(center, zoom) {
        const { viewCenter } = this.computeBoundedCenter(
            center, Math.pow(2, zoom), 0,
            0, 1000
        );

        this.histogramCenter = viewCenter;
        this.histogramZoom   = zoom;
    }

    computeViewFromRange(start, stop, padding = this.padding) {
        const center = (start + stop) / 2;
        const range = stop - start;
        const zoom = this.getZoomFromTime(range, padding);
        return { center, zoom };
    }


    syncView(center = this.viewCenter, zoom = this.viewZoom) {
        this.setBoundedViewstate(center, zoom);

        this.deckgl.setProps({viewState: this.computeViewState()});

        this.currGrid = this.getGridLines();
        this.drawTimeAxis();
        this.renderLayers();
    }

    syncHistogram(center = this.histogramCenter, zoom = this.histogramZoom) {
        this.setBoundedHistogram(center, zoom);
        this.deckgl.setProps({viewState: this.computeViewState()});
    }

    gotoView(start, stop) {
        const {center, zoom} = this.computeViewFromRange(start, stop);
        // this.currViewState.transitionDuration = 1000;
        // this.currViewState.transitionInterpolator = new deck.LinearInterpolator({transitionProps: ['target', 'zoom']});
        this.syncView(center, zoom);
    }

    toggleFPS(checked) {
        if (!this.deckgl) return;
        let widgets = [];
        if (checked)
            widgets = [new deck._FpsWidget({placement: 'top-right'})]
        this.deckgl.setProps({ widgets });
    }

    setMaxLoadedBuckets(value) {
        this.bucketManager.setMaxLoadedBuckets(value);
        this.requestRender();
    }

    createMainContainer(containerId) {
        this.mainContainer = document.getElementById(containerId);
        this.mainContainer.style.flexDirection = 'column';

        this.timelineContainer = document.createElement('div');
        this.mainContainer.appendChild(this.timelineContainer)
    }

    createTimelineContainer() {
        this.trackLabelContainer = document.createElement('div'); 
        this.trackLabelContainer.className = "track-container";
        this.trackLabelContainer.addEventListener('scroll', () => {
            this.scrollTimeline(this.trackLabelContainer.scrollTop);
        });
        this.trackLabelContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                this.scrollTimeline(this.scrollOffset + e.deltaY/2);
            }, { passive: false }
        );
        this.trackLabelContainer.style.overflowY = "scroll";
        this.trackLabelContainer.style.direction = "rtl";


        for (const group of this.groups) {
            group.createLabelContainer(this.trackLabelContainer);
        }

        this.deckContainer = document.createElement('div');
        this.deckContainer.style.width = "100%";
        this.deckContainer.style.flex = 1;
        this.deckContainer.addEventListener("contextmenu", (e) => { e.preventDefault() });
        this.deckContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                if (e.ctrlKey) return;
                this.scrollTimeline(this.scrollOffset + e.deltaY/2);
            }, { passive: false }
        );

        this.timelineContainer.innerHTML = '';
        createDivider(this.timelineContainer, {
            first: this.trackLabelContainer,
            second: this.deckContainer,
            linkClass: "link-divider",
            firstSize: "10%",
            minSize: "0%",
            maxSize: "50%",
            callback: (_, timelineWidth) => {
                this.setTimelineWidth(timelineWidth);
            }
        });

    }


    scrollTimeline(offset) {
        const maxScroll = this.trackLabelContainer.scrollHeight - this.globalViewHeight;
        this.scrollOffset = Math.max(0, Math.min(maxScroll, offset));
        this.updateViews();
        this.trackLabelContainer.scrollTop = this.scrollOffset;
    }

    getTimelineHeight() {
        let total = 0;
        for (const g of this.groups) total += g.getHeight();
        return total;
    }

    createTimeAxis(axisOptions = {}) {
        const {
            axisAlign = 'bottom',
            axisHeight = 50,
            axisTimeFormat = (t) => t,
            axisColor = '#ffffff',
            axisFont = 'Arial',
            axisFontSize = 12,
        } = axisOptions;

        this.axisCanvas = document.createElement('canvas');
        this.axisCanvas.classList.add('timeline-axis');

        this.axisCtx = this.axisCanvas.getContext('2d');

        const axisContainer = createDivider(this.mainContainer, {
            second: this.axisCanvas,
            linkClass: "link-divider",
            firstSize: "10%",
            minSize: "0%",
            maxSize: "50%",
            callback: (_, timelineWidth) => {
                this.setTimelineWidth(timelineWidth);
            }
        });

        const css = getComputedStyle(this.axisCanvas);
        const height   = parseInt(css.getPropertyValue('--axis-height')) || axisHeight;
        const color    = css.getPropertyValue('--axis-color').trim() || axisColor;
        const font     = css.getPropertyValue('--axis-font').trim() || axisFont;
        const fontSize = parseInt(css.getPropertyValue('--axis-font-size')) || axisFontSize;
        const tickSize = parseInt(css.getPropertyValue('--axis-tick-size')) || 6;
        const align    = css.getPropertyValue('--axis-align').trim() || axisAlign;

        this.axisOptions = {
            height: height,
            align: align,
            format: axisTimeFormat,
            color: color,
            font: font,
            fontSize: fontSize,
            tickSize: tickSize,
        };

        axisContainer.style.height = height + 'px';
        axisContainer.style.order = align === 'top' ? 0 : 999;
        
        this.axisCanvas.height = height;
        this.axisCanvas.style.height = height + 'px';

        this.timelineWidth = this.axisCanvas.clientWidth;
    }

    drawTimeAxis() {
        const centerX = this.viewCenter;
        const ctx = this.axisCtx;
        const h   = this.axisCanvas.height;
        const w   = this.axisCanvas.width;

        const { tickSize, align, color, font, fontSize, format } = this.axisOptions;

        ctx.clearRect(0, 0, w, h);

        const isTop = align === 'top';

        // Y positions
        const axisY      = isTop ? h - 1 : 0;
        const tickStartY = axisY;
        const tickEndY   = isTop ? axisY - tickSize : axisY + tickSize;
        const labelY     = tickEndY + (isTop ? -10 : 10 );

        // Axis line
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, axisY);
        ctx.lineTo(w, axisY);
        ctx.stroke();

        // Text style
        ctx.font = `${fontSize}px ${font}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Grid / ticks
        const halfWidth = this.timelineWidth / 2;
        for (const l of this.currGrid) {
            const sx = (l.x - centerX) * this.currZoomScale + halfWidth;

            ctx.beginPath();
            ctx.moveTo(sx, tickStartY);
            ctx.lineTo(sx, tickEndY);
            ctx.stroke();

            ctx.fillText(format(Math.round(l.time)), sx, labelY);
        }

        // ============================
        // Range arrow 
        // ============================
        if (this.rangeSelection) {
            const range = this.rangeSelection[0];
            const start = Math.min(range[0], range[1]);
            const stop  = Math.max(range[0], range[1]);

            const halfWidth = this.timelineWidth / 2;

            const x1 = (start - centerX) * this.currZoomScale + halfWidth;
            const x2 = (stop  - centerX) * this.currZoomScale + halfWidth;

            const arrowOffset = 32;
            const arrowY = isTop
                ? axisY - tickSize - arrowOffset
                : axisY + tickSize + arrowOffset;

            const head = 6;

            const label = format(stop - start);

            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 1.5;
            ctx.font = `${fontSize}px ${font}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const midX = (x1 + x2) / 2;
            const textWidth = ctx.measureText(label).width;
            const gap = 6;

            const wideEnough = x2 - x1 > textWidth + 2 * (gap + head)

            function drawArrowHead(x, y, direction) {
                const base = x + direction * head;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(base, y - head);
                ctx.lineTo(base, y + head);
                ctx.closePath();
                ctx.fill();
            }

            function drawArrow(x1, x2, y, d) {
                drawLine({x1, x2, y1: y})
                drawArrowHead(x1, y, d);
            }


            function drawLine({x1, x2 = x1, y1, y2 = y1}) {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            let leftEnd  = midX;
            let rightEnd = midX;

            if (wideEnough) {
                leftEnd  -= (textWidth / 2 + gap);
                rightEnd += (textWidth / 2 + gap);
                // Duration text
                ctx.fillText(label, midX, arrowY);
            }

            // Left arrow
            drawArrow(x1, leftEnd, arrowY, 1);

            // Right arrow
            drawArrow(x2, rightEnd, arrowY, -1);


            // Vertical delimiter lines
            drawLine({x1: x1, y1: arrowY, y2: axisY});
            drawLine({x1: x2, y1: arrowY, y2: axisY});
        }
    }
}
