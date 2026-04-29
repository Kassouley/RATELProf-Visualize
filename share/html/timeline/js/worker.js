// ============================
// CONFIGURATION
// ============================

const CONFIG = {
  bucketSize: 10_000,
  eventCount: 10_000,
  groupCount: 5,
  trackCount: 3,
  subtrackCount: 2,
  minTime: 0,
  maxTime: 1_000_000_000_000,
  bucketCount: function() { return Math.ceil(CONFIG.eventCount / CONFIG.bucketSize) }
};

// ============================
// HELPER
// ============================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


const hashColorCache = new Map();

function hashStringToLightColor(str) {
    let cached = hashColorCache.get(str);
    if (cached !== undefined) return cached;

    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }

    // Extract RGB and force into light range (128–255)
    const r = ((hash        & 0xFF) >>> 1) + 128;
    const g = ((hash >>> 8  & 0xFF) >>> 1) + 128;
    const b = ((hash >>> 16 & 0xFF) >>> 1) + 128;

    const color = [r, g, b];
    hashColorCache.set(str, color);
    return color;
}

function numberToLightColor(n) {
    const cached = hashColorCache.get(n);
    if (cached !== undefined) return cached;

    let hash = n | 0;

    hash = (hash ^ (hash >>> 16)) * 0x45d9f3b;
    hash = (hash ^ (hash >>> 16)) * 0x45d9f3b;
    hash = hash ^ (hash >>> 16);

    const r = ((hash        & 0xFF) >>> 1) + 128;
    const g = ((hash >>> 8  & 0xFF) >>> 1) + 128;
    const b = ((hash >>> 16 & 0xFF) >>> 1) + 128;

    const color = [r, g, b];
    hashColorCache.set(n, color);
    return color;
}

// ============================
// RANDOM GENERATOR
// ============================

function generateHistogram(group) {
    const names = [
    {name: "Alpha", color: [239,83,80]},
    {name: "Beta", color: [66,165,245]},
    {name: "Gamma", color: [102,187,106]},
    {name: "Delta", color: [255,202,40]}
  ];

    const data = [];
    for (let i = 0; i < 1000; i++) {
        // random proportions
        let remaining = 1;
        const segments = [];
        let yStart = 0;
        for (let j = 0; j < 4; j++) {
            let value = Math.random() * remaining;
            if (value < 0.01) continue;
            remaining -= value;

            segments.push({
                name: names[j].name,
                percent: value,
                yStart: yStart,
                color: names[j].color
            });
            yStart += value;
        }
        data.push({ segments });
    }
    group.histogram = data;
}

function generateEvent(i, min, max) {
    const group_id = randInt(0, CONFIG.groupCount - 1);
    const track_id = randInt(0, CONFIG.trackCount - 1);
    const subtrack = randInt(0, CONFIG.subtrackCount - 1);

    const start = randInt(min, max);
    const stop  = randInt(start + 1, start + 1000_000);

    const name = "Event_" + i;

    const event = [];
    event[NAME] = name;
    event[START] = start;
    event[STOP] = stop;
    event[TRACK] = track_id;
    event[SUBTRACK] = subtrack;
    event[GROUP] = group_id;
    return event;
}

function generateGroupData(trackHeight) {
  const {groupCount, trackCount, subtrackCount} = CONFIG;
  const groups = [];

  let yOffset = 0;

  for (let g = 0; g < groupCount; g++) {
    const tracks = [];
    const groupOffset = yOffset;
    let   groupHeight = 0;

    for (let t = 0; t < trackCount; t++) {
        const height = subtrackCount * trackHeight;
        tracks[t] = {
            name: `Track_${g}_${t}`,
            subtracks: subtrackCount,
            off: yOffset,
            height
        };
        yOffset += height;
        groupHeight += height;
    }

    groups[g] = {
        name: `Group_${g}`,
        tracks,
        off: groupOffset,
        height: groupHeight
    };

    generateHistogram(groups[g]);
  }

  return groups;
}

function generateBucketMetadata() {
    const {
        minTime,
        maxTime,
        bucketSize,
        eventCount,
        bucketCount,
    } = CONFIG;

    const totalBuckets = bucketCount();
    let currentTime = minTime;

    const buckets = [];

    for (let i = 0; i < totalBuckets; i++) {
    const bucketsLeft = totalBuckets - i;
    const remainingSpan = maxTime - currentTime;

    // Fair share of remaining time
    const idealSpan = remainingSpan / bucketsLeft;

    // Controlled randomness (±20%)
    const variation = 0.8 + Math.random() * 0.4;
    let span = idealSpan * variation;

    // Hard safety: ensure room for remaining buckets
    const maxSpan = remainingSpan - (bucketsLeft - 1);
    span = Math.min(span, maxSpan);

    const minStart = currentTime;
    const maxStop = minStart + span;

    const isLast = i === totalBuckets - 1;
    const count = isLast
        ? (eventCount % bucketSize) || bucketSize
        : bucketSize;

    buckets.push({
        id: i,
        minStart: Math.floor(minStart),
        maxStop: Math.floor(maxStop),
        count,
    });

    currentTime = maxStop;
    }


  console.log(`Generated ${buckets.length} buckets covering time range ${CONFIG.minTime} to ${CONFIG.maxTime}`);
  for (const bucket of buckets) {
    console.log(`Bucket ${bucket.id}: ${bucket.count} events from ${bucket.minStart} to ${bucket.maxStop}`);
  }

  return buckets;
}

// ============================
// BUCKET MANAGER
// ============================

importScripts('./MSGPackDecoder.js');
importScripts('./RProfVis.js');
