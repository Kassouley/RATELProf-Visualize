function hashStringToLightColor(str) {
  // Simple hash function to generate a color
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert hash to a light hexadecimal color
  let color = "#";
  for (let i = 0; i < 3; i++) {
      const value = ((hash >> (i * 8)) & 0xFF); // Extract 8 bits
      const lightValue = Math.floor((value / 2) + 127); // Ensure the value is in the light range (127–255)
      color += ("00" + lightValue.toString(16)).slice(-2);
  }
  
  return color;
}

function processTraces(data) {
  const traceEvents = data.trace_events;
  const lcEvents = data.lifecycle;
  const domainIDs = data.domain_id;
  const nodeIDs = data.node_id;
  // const phaseIDs = data.phase_id;
  const items = [];
  const groups = [];
  const groupsTmp = {};
  const idMap = new Map();
  const depthMap = new Map();

  let minStart = Infinity;
  let maxEnd = -Infinity;

  const addLifecycleItems = () => {
    items.push(
      {
        id: "Constructor",
        content: "Constructor",
        type: "background",
        start: lcEvents.constructor_start / 1000,
        end: lcEvents.main_start / 1000,
      },
      {
        id: "Main",
        content: "Main",
        type: "background",
        start: lcEvents.main_start / 1000,
        end: lcEvents.main_stop / 1000,
        className: "mainBackground",
      },
      {
        id: "Destructor",
        content: "Destructor",
        type: "background",
        start: lcEvents.main_stop / 1000,
        end: lcEvents.destructor_stop / 1000,
      }
    );
    return lcEvents.main_stop - lcEvents.main_start
  };

  const computeDepth = (event) => {
      if (depthMap.has(event.id)) return depthMap.get(event.id);
      if (!event.corr_id || !idMap.has(event.corr_id)) return 1;

      const depth = 1 + computeDepth(idMap.get(event.corr_id));
      depthMap.set(event.id, depth);
      return depth;
  };

  const getMemKind = (kind) => {
      const kinds = { 0: "Host", 1: "Device" };
      return kinds[parseInt(kind, 10)] || "Unknown";
  };

  const getNodeIdFromAgent = (agentId) => {
    const ret = nodeIDs[agentId];
    return ret == undefined ? "N/A" : ret;
  };


  const preprocessTraceEvents = (event) => {
    const traceDomain = event.d;
    if ([17, 18, 19].includes(traceDomain)) {
      if (traceDomain === 17) {
        event._event_name = event.args?.kernel_name || "N/A";
        event._event_kind = "KERNEL";
      } else if (traceDomain === 18) {
        event._event_name = "BarrierOr";
        event._event_kind = "BARRIER";
      } else if (traceDomain === 19) {
        event._event_name = "BarrierAnd";
        event._event_kind = "BARRIER";
      };
      event._event_node_id     = getNodeIdFromAgent(event.args.gpu_id);
      event._nested_group_id   = `${traceDomain}_${event.args.gpu_id}`;
      event._nested_group_name = `GPU Node ID. ${event._event_node_id}`;
      event._subgroup_id       = event.args.queue_id || 1
    } else if (traceDomain === 16) {
      event._copy_src_kind     = getMemKind(event.args.src_type);
      event._copy_dst_kind     = getMemKind(event.args.dst_type);
      event._copy_src_node_id  = getNodeIdFromAgent(event.args.src_agent);
      event._copy_dst_node_id  = getNodeIdFromAgent(event.args.dst_agent);
      event._event_name        = `Copy${event._copy_src_kind}To${event._copy_dst_kind}`;
      event._event_kind        = "MEMORY";
      event._nested_group_id   = `${traceDomain}_${event._event_name}`;
      event._nested_group_name = event._event_name;
      event._subgroup_id       = 1
    } else {
      event._event_name        = event.name;
      event._event_kind        = "CPU";
      event._nested_group_id   = `${traceDomain}_${event.tid}`;
      event._nested_group_name = `TID. ${event.tid}`;
      event._subgroup_id       = computeDepth(event);
    }
    event._event_color = hashStringToLightColor(event._event_name);
  };

  const addTraceEventItems = () => {
    traceEvents.forEach(event => {
      idMap.set(event.id, event);
    });
    traceEvents.forEach((event) => {
      preprocessTraceEvents(event);

      if (event.start < minStart) minStart = event.start;
      if (event.end > maxEnd) maxEnd = event.end;

      if ([17, 18, 19].includes(event.d)) {
        items.push({
          className: 'non-highlighted',
          style: 'background-color: '+hashStringToLightColor("Dispatch"),
          id: `Dispatch_${event.id}`,
          corr_id: event.id,
          content: "Dispatch",
          subgroup: event._subgroup_id,
          start: event.args.dispatch_time / 1000,
          end: (event.args.dispatch_time + 1000) / 1000,
          group: event._nested_group_id,
          traceData: {
            _event_name: event._event_name,
            _event_kind: "DISPATCH",
            _event_id: event.id,
            _event_dispatch_time: event.args.dispatch_time
          }
        });
      }

      items.push({
        className: 'non-highlighted',
        style:     'background-color: '+event._event_color,
        id:        event.id,
        corr_id:   event.corr_id,
        content:   event._event_name,
        start:     Math.round(event.start / 1000),
        end:       Math.round(event.end / 1000),
        group:     event._nested_group_id,
        subgroup:  event._subgroup_id,
        limitSize: true,
        traceData: event,
      });

      if (!groupsTmp[event.d]) {
        groupsTmp[event.d] = [];
      }

      if (!groupsTmp[event.d].some((group) => group.id === event._nested_group_id)) {
        groupsTmp[event.d].push({
          style:         "color: var(--text-color); background-color: var(--secondary-tl); font-size: 13px; text-align: right; border-color: var(--border-color);",
          id:            event._nested_group_id,
          value:         event.d,
          content:       event._nested_group_name,
          treeLevel:     2,
          totalDuration: 0,
          isGpuGroup:    event._event_kind != "CPU"
        });
      };
      const targetGroup = groupsTmp[event.d].find((group) => group.id === event._nested_group_id);
      if (targetGroup) {
        targetGroup.totalDuration += event.dur;
      }
    });
  };

  const getDomainNameFromId = (traceDomain) => {
    return domainIDs[traceDomain]?.name.replace("RATELPROF_", "").replaceAll("_", " ") || "Unknown Domain";
  };

  const getDomainDescFromId = (traceDomain) => {
    return domainIDs[traceDomain]?.desc || "Unknown Domain";
  };

  const addGroups = () => {
    let gpuCounter = 1; // Start GPU counter from the smallest value
    let cpuCounter = Object.entries(groupsTmp).length; // Start CPU counter from the largest value

    Object.entries(groupsTmp).forEach(([traceDomain, nestedGroups]) => {
      let isGPU = nestedGroups[0].isGpuGroup;
      if (isGPU) {
        nestedGroups.forEach(nestedGroup => {
          const percent = (nestedGroup.totalDuration/main_duration)*100;
          nestedGroup.content = nestedGroup.content+"<div style=\"font-size: 9px\">GPU USAGE: "+percent.toFixed(2)+"%";
        });
      };
      groups.push(...nestedGroups);
      groups.push({
        className:      "groupClass",
        style:          "color: var(--text-color); background-color: var(--primary-tl); font-size: 13px; text-align: left; border-color: var(--border-color)",
        treeLevel:      1,
        id:             traceDomain,
        content:        getDomainNameFromId(traceDomain),
        desc:           getDomainDescFromId(traceDomain),
        value:          isGPU ? gpuCounter++ : cpuCounter--,
        subgroupStack:  true,
        showNested:     isGPU,
        nestedGroups:   nestedGroups.map((group) => group.id),
      });
    });
  };

  const main_duration = addLifecycleItems();
  addTraceEventItems();
  addGroups();
  return { items, groups, minStart , maxEnd };
}