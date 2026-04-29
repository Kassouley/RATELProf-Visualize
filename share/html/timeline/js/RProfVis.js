const START = 0;
const STOP = 1;
const GROUP = 2;
const TRACK = 3;
const SUBTRACK = 4;
const METAOFF = 5;
const METASIZE = 6;
const NAME = 7;

const POLYGON_STRIDE = 8;
const COLOR_STRIDE   = 12;

self.onmessage = function(e) {
    if (e.data.action === "init") {
        new RProfVis(self, e.data.file, e.data.options);
    }
};

class RProfVis {
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

        this.init(maxTime);
    }

    async init(maxTime) {
        await this.readHeader();
        await this.readStringSection();
        await this.readLocationSection();
        await this.readAPIdataSection();
        await this.readKernelDataSection();

        this.readBucketMetadataSection();
        const groups = await this.readGroupSection();
        this.offsets = groups.map(g => g.tracks.map(t => t.off));

        this.initWorkerMessage();

        this.worker.postMessage({
            onInit: true,
            groups,
            maxTime: maxTime ?? this.maxTime ?? this.buckets[this.buckets.length - 1].maxStop
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
            } else if (action === "requestMetadata") {
               const { event } = e.data;
                this.readEventMetadata(event).then(metadata => {
                    this.worker.postMessage({
                        onMetadataReady: true,
                        metadata
                    });
                });
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

    async readHeader() {
        const headerSize = 6 * 2 * 8; // 6 groups, each with 2 uint64 (offset and size)
        const buffer = await this.readChunk(0, headerSize);

        if (buffer.byteLength < headerSize) {
            throw new Error(`ArrayBuffer too small: header expected at least ${headerSize} bytes`);
        }

        const view = new DataView(buffer);
        this.header = {};

        const sectionName = ["Group", "BucketMetadata", "APIdata", "KernelData", "Location", "StringTable"];

        for (let i = 0; i < 6; i++) {
            const base = i * 16;

            const offset = Number(view.getBigUint64(base, true));
            const size = Number(view.getBigUint64(base + 8, true));
            this.header[sectionName[i]] = { offset, size };
        }
    }

    async readStringSection() {
        const size = this.header.StringTable.size;
        const buf = await this.readChunk(this.header.StringTable.offset, size);
        const msgpackDecoder = new MSGPackDecoder(buf);

        this.stringTable = [];
        const nstring_off = size - 8; // last 8 bytes contain the number of strings
        msgpackDecoder.advance(nstring_off);
        const nstrings = msgpackDecoder.readU64();
        msgpackDecoder.advance(0);

        for (let i = 0; i < nstrings; i++) {
            this.stringTable.push(msgpackDecoder.decode());
        }
        // debug
        console.log("String table loaded:", this.stringTable);
    }

    getString(id) {
        if (!this.stringTable) {
            this.readStringSection();
        }
        return this.stringTable[id];
    }

    async readLocationSection() {
        const size = this.header.Location.size;
        const buf = await this.readChunk(this.header.Location.offset, size);
        const msgpackDecoder = new MSGPackDecoder(buf);
        this.locationTable = [];

        const nlocs_off = size - 8; // last 8 bytes contain the number of locations
        msgpackDecoder.advance(nlocs_off);
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

        // debug
        console.log("Location table loaded:", this.locationTable);
    }

    async readAPIdataSection() {
        const size = this.header.APIdata.size;
        const buf = await this.readChunk(this.header.APIdata.offset, size);
        const msgpackDecoder = new MSGPackDecoder(buf);
        this.apiTable = [];

        const napis_off = size - 8; // last 8 bytes contain the number of APIs
        msgpackDecoder.advance(napis_off);
        const napis = msgpackDecoder.readU64();
        msgpackDecoder.advance(0);

        for (let i = 0; i < napis; i++) {
            const name = msgpackDecoder.decode();
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

        // debug
        console.log("API table loaded:", this.apiTable);
    }

    async readKernelDataSection() {
        const size = this.header.KernelData.size;
        const buf = await this.readChunk(this.header.KernelData.offset, size);
        const msgpackDecoder = new MSGPackDecoder(buf);
        this.kernelTable = [];

        const nkernels_off = size - 8; // last 8 bytes contain the number of kernels
        msgpackDecoder.advance(nkernels_off);
        const nkernels = msgpackDecoder.readU64();
        msgpackDecoder.advance(0);

        for (let i = 0; i < nkernels; i++) {
            this.kernelTable.push({
                name: msgpackDecoder.decode(),
                object: msgpackDecoder.decode(),
                group_segment_size: msgpackDecoder.decode(),
                private_segment_size: msgpackDecoder.decode(),
            });
        }
        // debug
        console.log("Kernel table loaded:", this.kernelTable);
    }

    async readGroupSection() {
        const size = this.header.Group.size;
        const buf = await this.readChunk(this.header.Group.offset, size);
        const msgpackDecoder = new MSGPackDecoder(buf);
        const ngroups = msgpackDecoder.decode();
        const groups = new Array(ngroups);

        let yOffset = 0;

        for (let g = 0; g < ngroups; g++) {
            const groupOffset = yOffset;
            let   groupHeight = 0;

            const id          = msgpackDecoder.decode();
            const group_label = msgpackDecoder.decode();
            const domain      = msgpackDecoder.decode();
            const track_label = msgpackDecoder.decode();
            const unit        = msgpackDecoder.decode();
            const ntracks     = msgpackDecoder.decode();
            const tracks = new Array(ntracks);

            for (let t = 0; t < ntracks; t++) {
                const track_id  = msgpackDecoder.decode();
                const subunit   = msgpackDecoder.decode();
                const subtracks = msgpackDecoder.decode();
                const height    = subtracks * this.trackHeight;
                tracks[track_id] = { 
                    name: `${track_label} ${subunit}`,
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
                tracks, 
                off: groupOffset,
                height: groupHeight,
                histogram 
            };
        }

        console.log("Groups loaded:", groups);
        return groups;
    }

    async readEventMetadata(event) {
        const buf = await this.readChunk(event[METAOFF], event[METASIZE]);
        const msgpackDecoder = new MSGPackDecoder(buf);
        const metadata = {};
        const what = msgpackDecoder.decode();
        if (what == false) {
            const kernel_id = msgpackDecoder.decode();
            metadata.kernel_data = this.kernelTable[kernel_id];
            metadata.id = msgpackDecoder.decode();
        } else if (what == true) {
            const api_id = msgpackDecoder.decode();
            const loc_id = msgpackDecoder.decode();
            metadata.api_data = this.apiTable[api_id];
            metadata.location = this.locationTable[loc_id];
            metadata.id = msgpackDecoder.decode();
        } else {
            metadata.id = what;
        }
        if (msgpackDecoder.peak() === 0xc4) {
            msgpackDecoder.readU8(); // Skip peak
            metadata.cid = msgpackDecoder.decode();
        } else {
            metadata.cid = 0;
        }

        const nargs = msgpackDecoder.decode();
        const args  = msgpackDecoder.readArray(nargs);
        metadata.args = args;

        return metadata;
    }

    async readBucketMetadataSection() {
        const size = this.header.BucketMetadata.size;
        const buf = await this.readChunk(this.header.BucketMetadata.offset, size);
        const msgpackDecoder = new MSGPackDecoder(buf);
        const buckets = [];
        this.maxTime   = msgpackDecoder.decode();
        const nbuckets = msgpackDecoder.decode();
        for (let b = 0; b < nbuckets; b++) {
            const id        = msgpackDecoder.decode();
            const off       = msgpackDecoder.decode();
            const size      = msgpackDecoder.decode();
            const minStart  = msgpackDecoder.decode();
            const maxStop   = msgpackDecoder.decode();
            const count     = msgpackDecoder.decode();
            buckets.push({ id, off, size, minStart, maxStop, count });
        }
        this.buckets = buckets; // sorted by minStart
        console.log("Buckets loaded:", this.buckets);
    }

    async readEvents(bucket) {
        const eventCount    = bucket.count;
        const colorBuffer   = new Uint8Array(eventCount * COLOR_STRIDE);
        const polygonBuffer = new Float64Array(eventCount * POLYGON_STRIDE);
        const eventBuffer   = new Array(eventCount);

        // const nameBuffer         = new Uint8Array(eventCount * 128); // assuming max name length of 128 chars
        // const namePositionBuffer = new Float64Array(eventCount * 128 * 2);
        // const nameStartIndices   = new Uint32Array(eventCount + 1); // start index of each name in nameBuffer
        
        // nameStartIndices[0] = 0;

        const buf = await this.readChunk(bucket.off, bucket.size);
        const msgpackDecoder = new MSGPackDecoder(buf);
        let i = 0;

        while (msgpackDecoder.off < buf.byteLength) {
            const group_id = msgpackDecoder.decode();
            const track_id = msgpackDecoder.decode();
            while (msgpackDecoder.peak() !== 0xc1) {
                let subtrack = 0
                if (msgpackDecoder.peak() === 0xc4) {
                    msgpackDecoder.readU8(); // Skip peak
                    subtrack = msgpackDecoder.decode();
                }
                const ufunid = msgpackDecoder.decode();
                const start  = msgpackDecoder.decode();
                const dur    = msgpackDecoder.decode();
                const stop   = start + dur;
                const metadata_off = msgpackDecoder.decode();
                const metadata_size = msgpackDecoder.decode();
                const event = [
                    start, stop, group_id, track_id, subtrack, metadata_off, metadata_size, this.getString(ufunid)
                ]
                this.writePolygon(polygonBuffer, i, event);
                this.writeColor(colorBuffer, i, ufunid);
                eventBuffer[i++] = event;
            }
            msgpackDecoder.readU8(); // Skip peak
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


    writeColor(buffer, index, id) {
        let i = index * COLOR_STRIDE;
        const [r, g, b] = numberToLightColor(id);
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

    async loadBucket(bucket, index, direction, viewRange) {
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
            await this.readEvents(bucket);

            this.worker.postMessage({
                onBucketLoad: true, bucket
            // }, [bucket.colorBuffer.buffer, bucket.polygonBuffer.buffer, bucket.nameBuffer.buffer, bucket.nameStartIndices.buffer, bucket.namePositionBuffer.buffer]);
            }, [bucket.colorBuffer.buffer, bucket.polygonBuffer.buffer]);
            delete bucket.events;
            bucket.events = null;
        }
    }

    async requestRange(start, end) {
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
                await this.loadBucket(b, i, direction, viewRange);
            }
        }

        this.oldView = [start, end];
        this.worker.postMessage({ requestSucceeded: true });
        return;
    }
}