const NAME = 0
const START = 1;
const STOP = 2;
const TRACK = 3;
const SUBTRACK = 4;
const GROUP = 5;

const POLYGON_STRIDE = 8;
const COLOR_STRIDE   = 12;

self.onmessage = function(e) {
    if (e.data.action === "init") {
        new RProf_Vis(self, e.data.file, e.data.options);
    }
};

class RProf_Vis {
    constructor(worker, file, {
        trackHeight = 20,
        eventHeight = 16,
        maxLoadedBuckets = 100,
        viewPadding = 10000,
        maxTime = null
    } = {}) {
        this.worker = worker;
        this.file = file;
        this.oldView = null;
        this.loaded = new Map(); // key: bucket id, value: bucket
        this.loadedIndex = new Set();
        this.currentLeftmostBucketIndex = null;  // index of leftmost loaded bucket
        this.currentRightmostBucketIndex = null; // index of rightmost loaded bucket

        this.viewPadding      = viewPadding;
        this.maxLoadedBuckets = maxLoadedBuckets;
        this.trackHeight      = trackHeight;
        this.eventHeight      = eventHeight;
        this.eventPadding     = (trackHeight - eventHeight) / 2;

        this.readBucketMetadata();
        const groups = this.readGroupData();
        this.offsets = groups.map(g => g.tracks.map(t => t.off));

        this.initWorkerMessage();

        this.worker.postMessage({
            onInit: true,
            groups,
            maxTime: maxTime ?? this.buckets[this.buckets.length - 1].maxStop
        });
    }


    initWorkerMessage() {
        this.worker.onmessage = function(e) {
            const { action } = e.data;
            if (action === "requestRender") {
                const { start, end } = e.data;
                this.requestRange(start, end);
            } else if (action === "setMaxLoadedBuckets") {
                this.maxLoadedBuckets = e.data.maxLoadedBuckets ?? this.maxLoadedBuckets;
            }
        }.bind(this);
    }

    // ============================
    // DATA READER
    // ============================

    async readChunk(offset, size) {
        const chunk = this.file.slice(offset, offset + size);
        return await chunk.arrayBuffer();
    }

    readHeader() {
        
    }

    readGroupData() {
        return generateGroupData(this.trackHeight);
    }

    readBucketMetadata() {
        this.buckets = generateBucketMetadata(); // sorted by minStart
    }

    readEvents(bucket) {
        const eventCount    = bucket.count;
        const colorBuffer   = new Uint8Array(eventCount * COLOR_STRIDE);
        const polygonBuffer = new Float64Array(eventCount * POLYGON_STRIDE);
        const eventBuffer   = new Array(eventCount);

        // const nameBuffer         = new Uint8Array(eventCount * 128); // assuming max name length of 128 chars
        // const namePositionBuffer = new Float64Array(eventCount * 128 * 2);
        // const nameStartIndices   = new Uint32Array(eventCount + 1); // start index of each name in nameBuffer
        
        // nameStartIndices[0] = 0;

        const min = bucket.minStart;
        const max = bucket.maxStop;
        for (let i = 0; i < eventCount; i++) {
            const event = generateEvent(i, min, max);
         
            this.writePolygon(polygonBuffer, i, event);
            this.writeColor(colorBuffer, i, event[NAME]);
            // this.writeName(nameBuffer, namePositionBuffer, nameStartIndices, i, event);
            eventBuffer[i] = event;
        }

        bucket.events = eventBuffer;
        bucket.colorBuffer = colorBuffer;
        bucket.polygonBuffer = polygonBuffer;
        
        // bucket.nameBuffer = nameBuffer;
        // bucket.nameStartIndices = nameStartIndices;
        // bucket.namePositionBuffer = namePositionBuffer;
    }

    // ============================
    // BUFFER WRITTER
    // ============================

    // writeName(buffer, positions, startIndices, index, event) {
    //     const start = startIndices[index];
    //     const name = event[NAME];
    //     const length = Math.min(name.length, 128);
    //     const { x1, x2, y1, y2 } = this.getEventCoord(event);
    //     const x = (x1 + x2) / 2;
    //     const y = (y1 + y2) / 2;

    //     let posOffset = start * 2;
    //     let bufOffset = start;

    //     for (let i = 0; i < length; i++) {
    //         positions[posOffset] = x;
    //         positions[posOffset + 1] = y;
    //         buffer[bufOffset] = name.charCodeAt(i);

    //         posOffset += 2;
    //         bufOffset += 1;
    //     }

    //     startIndices[index + 1] = start + length;
    // }


    writePolygon(buffer, index, event) {
        let i = index * POLYGON_STRIDE;
        const { x1, x2, y1, y2 } = this.getEventCoord(event);
        buffer[i++] = x1;
        buffer[i++] = y1;
        buffer[i++] = x2;
        buffer[i++] = y1;
        buffer[i++] = x2;
        buffer[i++] = y2;
        buffer[i++] = x1;
        buffer[i++] = y2;
    }


    writeColor(buffer, index, name) {
        let i = index * COLOR_STRIDE;
        const [r, g, b] = hashStringToLightColor(name);
        buffer[i++] = r;
        buffer[i++] = g;
        buffer[i++] = b;
        buffer[i++] = r;
        buffer[i++] = g;
        buffer[i++] = b;
        buffer[i++] = r;
        buffer[i++] = g;
        buffer[i++] = b;
        buffer[i++] = r;
        buffer[i++] = g;
        buffer[i++] = b;
    }


    getEventCoord(e) {
        const off = this.offsets[e[GROUP]][e[TRACK]];
        const y1 = off + e[SUBTRACK] * this.trackHeight + this.eventPadding;
        const y2 = y1 + this.eventHeight;
        return { 
            x1: e[START], x2: e[STOP], y1, y2
        };
    }

    freeBucket(bucket) {
        this.worker.postMessage({
            onBucketFree: true,
            bucketId: bucket.id
        });
        delete bucket.colorBuffer;
        delete bucket.polygonBuffer;
        bucket.colorBuffer = null;
        bucket.polygonBuffer = null;
    }

    updateBucketIndexAfterInsert(index) {
        // update the extremes
        if ( this.currentLeftmostBucketIndex === null ||
            index < this.currentLeftmostBucketIndex ) {
                this.currentLeftmostBucketIndex = index;
        }
        if (this.currentRightmostBucketIndex === null ||
            index > this.currentRightmostBucketIndex ) {
                this.currentRightmostBucketIndex = index;
        }
    }

    updateBucketIndexAfterRemoval() {
        if (this.loadedIndex.size === 0) {
            this.currentLeftmostBucketIndex = null;
            this.currentRightmostBucketIndex = null;
            return;
        }

        this.currentLeftmostBucketIndex  = Math.min(...this.loadedIndex);
        this.currentRightmostBucketIndex = Math.max(...this.loadedIndex);
    }

    enforceMemory(direction, viewRange) {
        // Try to evict from the opposite side if over limit, but only if not in current view
        while (this.loaded.size >= this.maxLoadedBuckets) {
            let indexToRemove;
            if (direction == 1) {
                indexToRemove = this.currentLeftmostBucketIndex;
            } else {
                indexToRemove = this.currentRightmostBucketIndex;
            }
            const bucketToRemove = this.buckets[indexToRemove];
            // Check if bucket is outside the current view
            if (viewRange && bucketToRemove.maxStop > viewRange[0] && bucketToRemove.minStart < viewRange[1]) {
                // Bucket is in the current view, cannot evict
                return false;
            }
            this.loaded.delete(bucketToRemove.id);
            this.loadedIndex.delete(indexToRemove);
            this.freeBucket(bucketToRemove);
            this.updateBucketIndexAfterRemoval();
        }
        return true;
    }

    loadBucket(bucket, index, direction, viewRange) {
        if (!this.loaded.has(bucket.id)) {
            // Try to enforce memory before actually loading
            if (this.loaded.size >= this.maxLoadedBuckets) {
                const canEvict = this.enforceMemory(direction, viewRange);
                if (!canEvict) {
                    // Cannot evict, so do not load
                    return;
                }
            }
            this.loaded.set(bucket.id, bucket);
            this.loadedIndex.add(index);
            this.updateBucketIndexAfterInsert(index);
            this.readEvents(bucket);

            this.worker.postMessage({
                onBucketLoad: true, bucket
            // }, [bucket.colorBuffer.buffer, bucket.polygonBuffer.buffer, bucket.nameBuffer.buffer, bucket.nameStartIndices.buffer, bucket.namePositionBuffer.buffer]);
            }, [bucket.colorBuffer.buffer, bucket.polygonBuffer.buffer]);
            delete bucket.events;
            bucket.events = null;
        }
    }

    requestRange(start, end) {
        const paddedStart = start - this.viewPadding;
        const paddedEnd = end + this.viewPadding;
        const viewRange = [paddedStart, paddedEnd];

        for (let i = 0; i < this.buckets.length; i++) {
            const b = this.buckets[i];

            if (b.maxStop < paddedStart) continue;
            if (b.minStart > paddedEnd) break;

            if (!this.loaded.has(i)) {
                const direction =
                    this.oldView && start >= this.oldView[0] ? 1 : -1;
                this.loadBucket(b, i, direction, viewRange);
            }
        }

        this.oldView = [start, end];
        this.worker.postMessage({ requestSucceeded: true });
        return;
    }
}