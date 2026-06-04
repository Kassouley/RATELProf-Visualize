class RProfVis {
    constructor(root, {
        trackHeight,
        eventHeight,
        viewPadding,
        onInit,
        onRequestSucceed,
        onEventClick,
        getEventTooltip,
        maxTime,
        maxBucketSize,
        maxLoadedBuckets = 10,
        eventLabelThreshold = 500,
        yOffset = 0,
    }) {
        showLoadingPopup();
        
        this.root = root;
        this.viewPadding = viewPadding;
        this.eventHeight = eventHeight;
        this.trackHeight = trackHeight;
        this.maxLoadedBuckets = maxLoadedBuckets;
        this.onInit = onInit;
        this.maxTime = maxTime;
        this.onRequestSucceed = onRequestSucceed;
        this.eventLabelThreshold = eventLabelThreshold;
        this.onEventClick = onEventClick;

        this.coordinateOrigin = [yOffset, 0, 0];
        
        this.loadedBucket = new Map();
        this.loadedIndex  = new Set();

        this.startIndices = Uint32Array.from({ length: maxBucketSize + 1 }, (_, i) => i * 4);
        
        this.getEventTooltip = getEventTooltip;

        this.handleClick = (bucket) => (info, click) => {
            const event = this.getEvent(bucket, info.index, true);
            this.onEventSelect(event, click);
        }
        this.init();
    }

    onEventSelect(event, click = null) {
        const callchainEvents = this.searchCallchainEvent(event);
        let correlated_events;
        if (click && click.srcEvent.ctrlKey) {
            correlated_events = [callchainEvents.parents[0]];
        } else {
            correlated_events = callchainEvents.childs;
        }

        this.onEventClick(event, correlated_events, click, this.groups[event.group_id], callchainEvents);
    }

    getEvent(bucket, index, withMetadata = false) {
        const buffers = bucket.buffers;
        const metadatas = bucket.metadata;
        const metadata_str = metadatas[index];

        const start = buffers.sb[index];
        const dur = buffers.db[index];
        const stop = start + dur;
        const group_id = buffers.gb[index];
        const track_id = buffers.tb[index];
        const group = this.groups[group_id];
        const domain_mode = group.domain_mode;
        const domain = group.domain;
        const unit = group.name[0];

        const stride = 8;
        const offset = index * stride
        const polygon = buffers.pb.subarray(offset, offset + stride);

        const y = polygon[1];

        const event = {
            name: this.getString(buffers.fb[index]),
            id: buffers.ib[index],
            cid: buffers.jb[index],
            domain, unit,
            bucket,
            start, dur, stop, group_id, track_id, domain_mode, metadata_str, polygon, y
        }

        if (withMetadata) {
            event.metadata = this.decodeEventMetadata(metadata_str, domain_mode)
        }

        return event
    }

    searchCallchainEvent(event) {
        const callchainEvents = {
            childs: this.searchVisibleChildEvents(event),
            self: event,
            parents: []
        };

        const search = (currentEvent) => {
            const parentEvent = this.searchVisibleParentEvent(currentEvent);
            if (parentEvent) {
                callchainEvents.parents.push(parentEvent);
                search(parentEvent);
            }
        };

        search(event);

        return callchainEvents;
    }

    searchVisibleParentEvent(event) {
        const id = event.cid;
        for (const bucket of this.loadedBucket.values()) {
            if (!bucket.ready) continue;

            const ib = bucket.buffers.ib;
            for (let i = 0; i < bucket.count; i++) {
                if (ib[i] == id) {
                    return this.getEvent(bucket, i, true);
                };
            }
        }
        return null;
    }


    searchVisibleChildEvents(event) {
        const cid = event.id;
        const events = [];
        for (const bucket of this.loadedBucket.values()) {
            if (!bucket.ready) continue;

            const jb = bucket.buffers.jb;
            for (let i = 0; i < bucket.count; i++) {
                if (jb[i] == cid) {
                    events.push(this.getEvent(bucket, i, true));
                };
            }
        }
        return events
    }

    decodeEventMetadata(metadata_str, domain_mode) {
        const msgpackDecoder = new MSGPackDecoder(atob(metadata_str));
        const metadata = {};
        if (domain_mode == 0) {
            metadata.memop = msgpackDecoder.decode();
        } if (domain_mode == 1) {
            const kernel_id = msgpackDecoder.decode();
            metadata.kernel_data = this.kernelTable[kernel_id];
        } else if (domain_mode == 2) {
            const api_id = msgpackDecoder.decode();
            const loc_id = msgpackDecoder.decode();
            metadata.api_data = this.apiTable[api_id];
            metadata.location = this.locationTable[loc_id];
        }
     
        const nargs = msgpackDecoder.decode();
        const args  = msgpackDecoder.readArray(nargs);
        metadata.args = args;

        return metadata;
    }

    setMaxLoadedBuckets(value) {
        this.maxLoadedBuckets = value;
    }
    
    setEventLabelThreshold(value) {
        this.eventLabelThreshold = value;
    }

    onBucketLoad(bucket, buffers) {
        bucket.buffers = buffers
        bucket.polygonAttribute = {
            length: bucket.count,
            startIndices: this.startIndices,
            properties: bucket,
            attributes: {
                getPolygon: {value: buffers.pb, size: 2},
                getFillColor: {value: buffers.cb, size: 3, normalized: true}
            }
        };
        this.onRequestSucceed();
    }


    freeBucket(bucket) {       
        bucket.buffers = null; 
        bucket.polygonAttribute = null; 
        delete bucket.buffers;
        delete bucket.polygonAttribute;
    }


    updateTooltip({layer, index}, event) {
        if (!this.getEventTooltip) return;
        const tooltip = document.getElementById('timeline-tooltip');
        if (index < 0) {
            tooltip.style.display = 'none';
            return;
        }
        const e = this.getEvent(layer.props.data.properties, index);
        if (e) {
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
            tooltip.innerHTML = this.getEventTooltip(e);
        } else {
            tooltip.style.display = 'none';
        }
    }


    renderBuckets(viewStart, viewStop) {
        const layers = [];

        for (const bucket of this.loadedBucket.values()) {
            if (!bucket.ready) continue;
            bucket.visible = bucket.maxStop >= viewStart && bucket.minStart <= viewStop;
            layers.push(new deck.SolidPolygonLayer({
                id: `bucket-${bucket.id}`,
                data: bucket.polygonAttribute,
                visible: bucket.visible,
                _normalize: false,
                pickable: true,
                autoHighlight: true,
                onClick: this.handleClick(bucket),
                coordinateOrigin: this.coordinateOrigin,
                onHover: (i, e) => this.updateTooltip(i, e)
            }));
        }

        const data = this.getEventInRange(viewStart, viewStop, this.eventLabelThreshold);
        if (data.length == this.eventLabelThreshold) return layers

        layers.push(new deck.TextLayer({
            id: `label-layer`,
            data,
            getContentBox: d => [ 0, 0, d.dur, this.eventHeight ],
            getPosition: d => [ d.start, d.y ],
            getText: d => d.name,
            getSize: this.eventHeight - 6,
            sizeUnits: "pixels",
            getColor: [0, 0, 0],
            getTextAnchor: 'start',
            getAlignmentBaseline: 'center',
            contentAlignHorizontal: 'start',
            contentAlignVertical: 'center',
            getPixelOffset: [8, 0],
            fontFamily: "monospace",
            fontSettings: {
                sdf: true,
                radius: 32
            }
        }))

        return layers;
    }

    getEventInRange(viewStart, viewStop, limitNumber) {
        const events = [];

        for (const bucket of this.loadedBucket.values()) {
            if (!bucket.ready || bucket.maxStop < viewStart || bucket.minStart > viewStop) continue;
            const buffers = bucket.buffers;
            for (let i = 0; i < bucket.count; i++) {
                const start = buffers.sb[i];
                const stop = start + buffers.db[i];
                if (stop < viewStart || start > viewStop) continue;
                events.push(this.getEvent(bucket, i));
                if (limitNumber != null && events.length >= limitNumber) {
                    return events;
                }
            }
        }

        return events;
    }

    updateBucketIndexAfterInsert(index) {
        // update the extremes
        if (this.currentLeftmostBucketIndex == null || index < this.currentLeftmostBucketIndex ) {
                this.currentLeftmostBucketIndex = index;
        }
        if (this.currentRightmostBucketIndex == null || index > this.currentRightmostBucketIndex ) {
                this.currentRightmostBucketIndex = index;
        }
    }

    updateBucketIndexAfterRemoval() {
        if (this.loadedIndex.size === 0) return;
        this.currentLeftmostBucketIndex  = Math.min(...this.loadedIndex);
        this.currentRightmostBucketIndex = Math.max(...this.loadedIndex);
    }

    enforceMemory(direction, viewRange) {
        // Try to evict from the opposite side if over limit, but only if not in current view
        while (this.loadedBucket.size >= this.maxLoadedBuckets) {
            let indexToRemove;
            if (direction == 1) {
                indexToRemove = this.currentLeftmostBucketIndex;
            } else {
                indexToRemove = this.currentRightmostBucketIndex;
            }
            const bucketToRemove = this.sortedBucketList[indexToRemove];
            // Check if bucket is outside the current view
            if (viewRange && bucketToRemove.maxStop > viewRange[0] && bucketToRemove.minStart < viewRange[1]) {
                // Bucket is in the current view, cannot evict
                return false;
            }
            bucketToRemove.ready = false;
            console.log("Unload bucket " + bucketToRemove.id)
            this.loadedBucket.delete(bucketToRemove.id);
            this.loadedIndex.delete(indexToRemove);
            this.freeBucket(bucketToRemove);
            this.updateBucketIndexAfterRemoval();
        }
        return true;
    }

    async loadBucket(bucket, index, direction, viewRange) {
        // Try to enforce memory before actually loading
        if (this.loadedBucket.size >= this.maxLoadedBuckets) {
            const canEvict = this.enforceMemory(direction, viewRange);
            if (!canEvict) {
                // Cannot evict, so do not load
                return;
            }
        }

        console.log("Load bucket " + bucket.id)
        this.loadedBucket.set(bucket.id, bucket);
        this.loadedIndex.add(index);
        this.updateBucketIndexAfterInsert(index);

        await this.__loadFile(`${this.root}/bucket_${bucket.id}.js`)
        bucket.metadata = window.metadata;
        window.metadata = null;
        window.worker.postMessage({
            eh: this.eventHeight,
            th: this.trackHeight,
            off: this.offsets
        });
        window.worker.onmessage = (e) => {
            bucket.ready = true;
            this.onBucketLoad(bucket, e.data)
        }
    }

    async requestRender(start, end) {
        const paddedStart = start - this.viewPadding;
        const paddedEnd = end + this.viewPadding;
        const viewRange = [paddedStart, paddedEnd];

        for (let i = 0; i < this.sortedBucketList.length; i++) {
            const b = this.sortedBucketList[i];

            if (b.maxStop < paddedStart) continue;
            if (b.minStart > paddedEnd) break;

            if (!this.loadedBucket.has(b.id)) {
                const direction = this.oldView && start >= this.oldView[0] ? 1 : -1;
                this.loadBucket(b, i, direction, viewRange);
            }
        }

        this.oldView = [start, end];
    }

    __loadFile(src){
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    async loadBucketList() {
        await this.__loadFile(`${this.root}/buckets.js`);
        this.bucketDict = window.buckets.bucketList;
        this.sortedBucketList = Object.entries(this.bucketDict)
                .map(([id, value]) => ({ id, ...value })) 
                .sort((a, b) => a.minStart - b.minStart);
        this.maxTime = window.buckets.maxTime;
        this.mainTime = window.buckets.mainTime;
        window.buckets = null;
    }

    async loadGroup() {
        await this.__loadFile(`${this.root}/groups.js`);

        const msgpackDecoder = new MSGPackDecoder(atob(window.groups));
        const ngroups = msgpackDecoder.decode();
        const groups = new Array(ngroups);

        let yOffset = 0;

        for (let g = 0; g < ngroups; g++) {
            const groupOffset = yOffset;
            let   groupHeight = 0;

            const id          = msgpackDecoder.decode();
            const group_label = msgpackDecoder.decode();
            const domain      = msgpackDecoder.decode();
            const domain_mode = msgpackDecoder.decode();
            const unit        = msgpackDecoder.decode();
            const ntracks     = msgpackDecoder.decode();
            const tracks = new Array(ntracks);

            for (let t = 0; t < ntracks; t++) {
                const track_id    = msgpackDecoder.decode();
                const track_label = msgpackDecoder.decode();
                const subunit     = msgpackDecoder.decode();
                const subtracks   = msgpackDecoder.decode();
                const height      = subtracks * this.trackHeight;
                tracks[track_id] = { 
                    name: `${track_label} ${subunit}`,
                    label: track_label,
                    value: subunit,
                    subtracks,
                    off: yOffset,
                    height
                };
                yOffset += height;
                groupHeight += height;
            }
            const histogram = {}
            const nbars = msgpackDecoder.decode();
            for (let b = 0; b < nbars; b++) {
                const barIndex = msgpackDecoder.decode();
                const nsegments = msgpackDecoder.decode();
                const segments = {};
                for (let s = 0; s < nsegments; s++) {
                    const ufunid = msgpackDecoder.decode();
                    const segmentName = this.getString(ufunid);
                    const ratio = msgpackDecoder.decode();
                    segments[segmentName] = { ratio, color: numberToLightColor(ufunid)};
                }
                histogram[barIndex] = segments;
            }

            groups[id] = { 
                name: [`${group_label} ${unit}`, domain],
                label: group_label,
                value: unit,
                domain: domain,
                tracks, 
                off: groupOffset,
                height: groupHeight,
                domain_mode,
                histogram 
            };
        }

        this.groups = groups;
        this.offsets = groups.map(g => g.tracks.map(t => t.off));
        window.groups = null;
    }

    async loadString() {
        await this.__loadFile(`${this.root}/strings.js`);
        this.strings = window.strings;
        this.getString = (id) => this.strings[id];
        window.strings = null;
    }

    async loadLocations() {
        await this.__loadFile(`${this.root}/locations.js`);
        
        const msgpackDecoder = new MSGPackDecoder(atob(window.locations));
        this.locationTable = [];

        msgpackDecoder.advance(-8);
        const nlocs = msgpackDecoder.readU64();
        msgpackDecoder.advance(0);

        for (let i = 0; i < nlocs; i++) {
            this.locationTable.push({
                return_addr: msgpackDecoder.decode(),
                base_addr: msgpackDecoder.decode(),
                objectfile: this.getString(msgpackDecoder.decode()),
                function:   this.getString(msgpackDecoder.decode()),
                filename:   this.getString(msgpackDecoder.decode()),
                line: msgpackDecoder.decode(),
            });
        }

        this.locations = locations;
        window.locations = null;
    }

    async loadAPIData() {
        await this.__loadFile(`${this.root}/api_data.js`);

        const msgpackDecoder = new MSGPackDecoder(atob(window.api_data));
        this.apiTable = [];
        
        msgpackDecoder.advance(-8);
        const napis = msgpackDecoder.readU64();
        msgpackDecoder.advance(0);

        for (let i = 0; i < napis; i++) {
            const name = this.getString(msgpackDecoder.decode());
            const nargs = msgpackDecoder.decode();
            const args = [];
            for (let j = 0; j < nargs; j++) {
                args.push({
                    type: this.getString(msgpackDecoder.decode()),
                    name: this.getString(msgpackDecoder.decode())
                });
            }
            this.apiTable.push({ name, nargs, args });
        }
    }

    async loadKernelData() {
        await this.__loadFile(`${this.root}/kernel_data.js`);

        const msgpackDecoder = new MSGPackDecoder(atob(window.kernel_data));
        this.kernelTable = [];

        msgpackDecoder.advance(-8);
        const nkernels = msgpackDecoder.readU64();
        msgpackDecoder.advance(0);

        for (let i = 0; i < nkernels; i++) {
            this.kernelTable.push({
                name: this.getString(msgpackDecoder.decode()),
                object: msgpackDecoder.decode(),
                group_segment_size: msgpackDecoder.decode(),
                private_segment_size: msgpackDecoder.decode(),
            });
        }
    }


    async init() {
        updateLoadingMessage("Loading bucket list...")
        await this.loadBucketList();
        updateLoadingMessage("Loading strings...")
        await this.loadString();
        updateLoadingMessage("Loading groups...")
        await this.loadGroup();
        updateLoadingMessage("Loading locations data...")
        await this.loadLocations();
        updateLoadingMessage("Loading API data...")
        await this.loadAPIData();
        updateLoadingMessage("Loading kernel data...")
        await this.loadKernelData();

        hideLoadingPopup();

        this.onInit({
            maxTime: this.maxTime,
            groups: this.groups
        });
    }
}