import { getMemKind, getDomainNameFromId, getDomainDescFromId, hashStringToLightColor } from './utils.js';

export function processTraces(data) {
  const traceEvents = data.trace_events;
  const lcEvents = data.lifecycle;
  const domainIDs = data.domain_id;
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

  const mapDomainAndName = (traceDomain, event) => {
    const mappings = {
      16: { domain: "MEMORY", name: `Copy${getMemKind(event.args?.src_type)}To${getMemKind(event.args?.dst_type)}` },
      17: { domain: "KERNEL", name: event.args?.kernel_name || "N/A" },
      18: { domain: "BARRIER", name: "Barrier Or" },
      19: { domain: "BARRIER", name: "Barrier And" },
    };
    return mappings[traceDomain] || { domain: "CPU", name: event.name || "N/A" };
  };

  const createNestedGroup = (traceDomain, event, eventName) => {
    if ([17, 18, 19].includes(traceDomain)) {
      return {
        id: `${traceDomain}_${event.args.gpu_id}`,
        name: `GPU ID. ${event.args.gpu_id}`,
        kind: "GPU"
      };
    }
    if (traceDomain === 16) {
      return {
        id: `${traceDomain}_${eventName}`,
        name: eventName,
        kind: "GPU"
      };
    }
    return {
      id: `${traceDomain}_${event.tid}`,
      name: `TID. ${event.tid}`,
      kind: "CPU"
    };
  };

  const addTraceEventItems = () => {
    traceEvents.forEach(event => {
      idMap.set(event.id, event);
    });
    traceEvents.forEach((event) => {
      const depth = computeDepth(event);
      const { domain, name: eventName } = mapDomainAndName(event.d, event);
      const { id: groupId, name: groupName, kind } = createNestedGroup(event.d, event, eventName);

      if (event.start < minStart) minStart = event.start;
      if (event.end > maxEnd) maxEnd = event.end;

      if ([17, 18, 19].includes(event.d)) {
        items.push({
        className: 'non-highlighted',
          style: 'background-color: '+hashStringToLightColor("Dispatch"),
          id: `Dispatch_${event.id}`,
          corr_id: event.id,
          content: "Dispatch",
          subgroup: depth,
          start: event.args.dispatch_time / 1000,
          end: (event.args.dispatch_time + 1000) / 1000,
          group: groupId,
          event_dispatched_id: event.id,
          event_dispatched_name: eventName,
          dispatch_time: event.args.dispatch_time,
          domain: "DISPATCH"
        });
      }

      items.push({
        className: 'non-highlighted',
        style: 'background-color: '+hashStringToLightColor(eventName),
        id: event.id,
        corr_id: event.corr_id,
        content: eventName,
        start: Math.round(event.start / 1000),
        end: Math.round(event.end / 1000),
        group: groupId,
        subgroup: depth,
        limitSize: true,
        traceData: event,
        domain: domain
      });

      if (!groupsTmp[event.d]) {
        groupsTmp[event.d] = [];
      }

      if (!groupsTmp[event.d].some((group) => group.id === groupId)) {
        groupsTmp[event.d].push({
          style: "color: var(--text-color); background-color: var(--secondary-tl); font-size: 13px; text-align: right; border-color: var(--border-color);",
          id: groupId,
          value: event.d,
          content: groupName,
          treeLevel: 2,
          totalDuration: 0,
          kind: kind
        });
      }
      const targetGroup = groupsTmp[event.d].find((group) => group.id === groupId);
      if (targetGroup) {
        targetGroup.totalDuration += event.dur;
      }
    });
  };

  const addGroups = () => {
    let gpuCounter = 1; // Start GPU counter from the smallest value
    let cpuCounter = Object.entries(groupsTmp).length; // Start CPU counter from the largest value

    Object.entries(groupsTmp).forEach(([traceDomain, nestedGroups]) => {
      let isGPU = nestedGroups[0].kind=="GPU";
      nestedGroups.forEach(item => {
        if (item.kind == "GPU") {
          const percent = (item.totalDuration/main_duration)*100;
          item.content = item.content+"<div style=\"font-size: 9px\">GPU USAGE: "+percent.toFixed(2)+"%";
        }
      });
      groups.push(...nestedGroups);
      groups.push({
        className: "groupClass",
        style: "color: var(--text-color); background-color: var(--primary-tl); font-size: 13px; text-align: left; border-color: var(--border-color)",
        treeLevel: 1,
        id: traceDomain,
        content: getDomainNameFromId(domainIDs, traceDomain),
        desc: getDomainDescFromId(domainIDs, traceDomain),
        value: isGPU ? gpuCounter++ : cpuCounter--,
        subgroupStack: true,
        showNested: isGPU,
        nestedGroups: nestedGroups.map((group) => group.id),
      });
    });
  };

  const main_duration = addLifecycleItems();
  addTraceEventItems();
  addGroups();

  return { items, groups, minStart, maxEnd };
}