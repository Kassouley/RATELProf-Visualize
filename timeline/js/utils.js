function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomName(prefix, id) {
  return `${prefix} ${id}`;
}

function overlaps(a, b) {
  return a[START] < b[STOP] && b[START] < a[STOP];
}

// Assign subtracks so overlapping events don't collide
function assignSubtracks(events) {
  // sort by start time
  events.sort((a, b) => a.start - b.start);

  const subtracks = [];

  for (const event of events) {
    let placed = false;

    for (let i = 0; i < subtracks.length; i++) {
      const lastEventInSubtrack = subtracks[i][subtracks[i].length - 1];

      if (!overlaps(lastEventInSubtrack, event)) {
        event[SUBTRACK] = i;
        subtracks[i].push(event);
        placed = true;
        break;
      }
    }

    if (!placed) {
      event[SUBTRACK] = subtracks.length;
      subtracks.push([event]);
    }
  }

  return subtracks.length;
}

function generateGroups({
  groupCount = 2,
  tracksPerGroup = [1, 3],
  eventsPerTrack = [3, 8],
  baseTime = 0, // nanoseconds
  maxEventsPerBucket = 50000 // maximum number of events per bucket
} = {}) {
  const groups = [];
  let maxTime = 0;

  for (let g = 0; g < groupCount; g++) {
    const groupId = `group-${g}`;
    const trackCount = randomInt(...tracksPerGroup);

    const tracks = [];
    const allEvents = [];

    for (let t = 0; t < trackCount; t++) {
      const trackId = t;
      const eventCount = randomInt(...eventsPerTrack);
      const trackEvents = [];

      let currentTime = Number(baseTime);

      for (let e = 0; e < eventCount; e++) {
        const duration = randomInt(50, 30000);
        const gap = randomInt(1000, 150000);

        const start = currentTime + gap;
        const stop = start + duration;

        maxTime = Math.max(maxTime, stop);

        currentTime = start; // allows overlaps
        const event = [];
        event[ID] = `event-${g}-${t}-${e}`;
        event[NAME] = randomName("Event", e);
        event[START] = start;
        event[STOP] = stop;
        event[TRACK] = trackId;

        trackEvents.push(event);
        allEvents.push(event);
      }

      const subtrackCount = assignSubtracks(trackEvents);

      tracks.push({
        id: trackId,
        name: randomName("Track", t),
        subtracks: subtrackCount
      });
    }

    // Create buckets from allEvents
    const buckets = [];
    for (let i = 0; i < allEvents.length; i += maxEventsPerBucket) {
      const bucketEvents = allEvents.slice(i, i + maxEventsPerBucket);
      let minTime = Infinity;
      let maxTimeBucket = -Infinity;

      for (let i = 0; i < bucketEvents.length; i++) {
        const ev = bucketEvents[i];
        const start = ev[START];
        const stop = ev[STOP];

        if (start < minTime) minTime = start;
        if (stop > maxTimeBucket) maxTimeBucket = stop;
      }

      buckets.push({
        min: minTime,
        max: maxTimeBucket,
        events: bucketEvents
      });
    }

    groups.push({
      id: groupId,
      name: randomName("Group", g),
      tracks,
      buckets
    });
  }
  

  console.log(`Generated ${groups.length} groups with ${groups.reduce((sum, g) => sum + g.buckets.reduce((s, b) => s + b.events.length, 0), 0)} total events across ${groups.reduce((sum, g) => sum + g.tracks.length, 0)} tracks`);
  groups.forEach(group => {
    const totalEvents = group.buckets.reduce((sum, b) => sum + b.events.length, 0);
    console.log(`Group ${group.id}: ${totalEvents} events across ${group.tracks.length} tracks (${group.tracks.reduce((sum, t) => sum + t.subtracks, 0)} subtracks) in ${group.buckets.length} buckets`);
  });
  console.log(`First event start time: ${groups[0]?.buckets[0]?.events[0][START]}`);
  console.log(`Last event end time: ${maxTime}`);

  return { groups, maxTime };
}

