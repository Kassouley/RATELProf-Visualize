
// replace "./timeline/js/worker.js" by 
// URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
const workerCode = "./timeline/js/worker.js"

class BucketManager {
    constructor(file, {
        onInit,
        onRequestSucceed,
        onEventClick,
        onMetadataReady,
        trackHeight,
        eventHeight,
        maxLoadedBuckets,
        viewPadding,
        getEventTooltip,
        maxTime,
        maxBucketSize,
        yOffset = 0,
    }) {
        this.loadedBucket = {};

        this.startIndices = Uint32Array.from({ length: maxBucketSize + 1 }, (_, i) => i * 4);
        
        this.getEventTooltip = getEventTooltip;
        this.onMetadataReady = onMetadataReady;

        this.handleClick = (bucket) => (info, event) => {
            const object = bucket.events[info.index];
            onEventClick(object, info.index, bucket, event);
        }

        this.worker = new Worker(workerCode);

        this.worker.onmessage = (e) => {
            if (e.data.onInit) {
                onInit(e.data);
            } else if (e.data.onBucketLoad) {
                delete e.data.onBucketLoad;
                this.loadBucket(e.data);
                console.log("Loaded bucket", e.data.bucket.id);
            } else if (e.data.onBucketFree) {
                this.freeBucket(e.data.bucketId);
                console.log("Free bucket", e.data.bucketId);
            } else if (e.data.requestSucceeded) {
                this.isRequestingRender = false;
                onRequestSucceed();
            } else if (e.data.onMetadataReady) {
                const { metadata } = e.data;
                if (this.onMetadataReady) {
                    this.onMetadataReady(metadata);
                }
            }
        };

        this.coordinateOrigin = [yOffset, 0, 0];


        this.worker.postMessage({ action: "init", file, options: {
            trackHeight,
            eventHeight,
            maxLoadedBuckets,
            viewPadding,
            maxTime
        } });
    }

    setMaxLoadedBuckets(value) {
        this.worker.postMessage({ action: "setMaxLoadedBuckets",
            maxLoadedBuckets: value});
    }

    requestRender(viewStart, viewStop) {
        if (this.isRequestingRender) return;
        this.isRequestingRender = true;

        this.worker.postMessage({ action: "requestRender", 
            start: viewStart, end: viewStop });
    }

    requestMetadata(event) {
        this.worker.postMessage({ action: "requestMetadata", 
            event: event });
    }


    loadBucket(data) {
        const bucket = data.bucket;
        data.polygonAttribute = {
            length: bucket.count,
            startIndices: this.startIndices,
            properties: bucket.events,
            attributes: {
                getPolygon: {value: bucket.polygonBuffer, size: 2},
                getFillColor: {value: bucket.colorBuffer, size: 3, normalized: true}
            }
        };
        // data.textAttribute = {
        //     length: data.eventCount,
        //     startIndices: data.nameStartIndices,
        //     properties: data.events,
        //     attributes: {
        //         getText: {value: data.nameBuffer},
        //         getPosition: {value: data.namePositionBuffer, size: 2},
        //     }
        // };
        this.loadedBucket[bucket.id] = data;
    }


    freeBucket(bucketId) {       
        const bucket = this.loadedBucket[bucketId];
        bucket.colorBuffer = null;
        bucket.polygonBuffer = null; 
        delete bucket.colorBuffer;
        delete bucket.polygonBuffer;
        delete this.loadedBucket[bucketId];
    }


    updateTooltip({layer, index}, event) {
        if (!this.getEventTooltip) return;
        const tooltip = document.getElementById('timeline-tooltip');
        if (index < 0) {
            tooltip.style.display = 'none';
            return;
        }
        const e = layer.props.data.properties[index];
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
        return Object.values(this.loadedBucket).map(
            ({ bucket, polygonAttribute }) => {
                const visible = bucket.maxStop  >= viewStart &&
                                bucket.minStart <= viewStop;
                return new deck.SolidPolygonLayer({
                    id: `bucket-${bucket.id}`,
                    data: polygonAttribute,
                    visible,
                    _normalize: false,
                    pickable: true,
                    autoHighlight: true,
                    onClick: this.handleClick(bucket),
                    coordinateOrigin: this.coordinateOrigin,
                    onHover: (i, e) => this.updateTooltip(i, e)
                });
        });
    }

}