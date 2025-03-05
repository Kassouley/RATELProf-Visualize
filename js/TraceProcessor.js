class TraceProcessor {
  constructor(data) {
    this.traceEvents = data.trace_events;
    this.lcEvents = data.lifecycle;
    this.domainIDs = data.domain_id;
    this.nodeIDs = data.node_id;

    this.groups = [];

    this.items = [{
      id: "Constructor",
      content: "Constructor",
      type: "background",
      start: data.lifecycle.constructor_start / 1000,
      end: data.lifecycle.main_start / 1000
    },{
      id: "Main",
      content: "Main",
      type: "background",
      start: data.lifecycle.main_start / 1000,
      end: data.lifecycle.main_stop / 1000,
      className: "mainBackground"
    },{
      id: "Destructor",
      content: "Destructor",
      type: "background",
      start: data.lifecycle.main_stop / 1000,
      end: data.lifecycle.destructor_stop / 1000
    }];

    this.minStart = Infinity;
    this.maxEnd = -Infinity;

    this.processTraces()
  };

  normalizeTime(time) {
    return convertTime(time - this.lcEvents.constructor_start, true);
  };

  getNodeIdFromAgent(agentId) {
    const ret = this.nodeIDs[agentId];
    return ret == undefined ? "N/A" : ret
  };

  getMemKind(kind) {
    const kinds = { 0: "Host", 1: "Device" };
    return kinds[parseInt(kind, 10)] || "Unknown"
  };

  getDomainNameFromId(traceDomain) {
    return this.domainIDs[traceDomain]?.name.replace("RATELPROF_", "").replaceAll("_", " ") || "Unknown Domain"
  };

  getDomainDescFromId(traceDomain) {
    return this.domainIDs[traceDomain]?.desc || "Unknown Domain"
  };

  processTraces() {
    const groupsTmp = [];
    const idMap     = new Map();
    const depthMap  = new Map();

    const computeDepth = (event) => {
        if (depthMap.has(event.id)) return depthMap.get(event.id);
        if (!event.corr_id || !idMap.has(event.corr_id)) return 1;

        const depth = 1 + computeDepth(idMap.get(event.corr_id));
        depthMap.set(event.id, depth);
        return depth
    };

    const preprocessTraceEvents = (event) => {
      const groupInfo = [];
      let eventName = "N/A";
      const traceDomain = event.d;
      if ([17, 18, 19].includes(traceDomain)) {
        if (traceDomain === 17) {
          eventName = event.args.kernel_name || "N/A";
          event._event_kind = "KERNEL";
          for (let i = 0; i < 3; i++) {
            event.args.grd[i] = event.args.grd[i] / event.args.wrg[i]
          }
        } else if (traceDomain === 18) {
          eventName = "BarrierOr";
          event._event_kind = "BARRIER"
        } else if (traceDomain === 19) {
          eventName = "BarrierAnd";
          event._event_kind = "BARRIER"
        }
        groupInfo._nested_group_id   = `${traceDomain}_${event.args.gpu_id}`;
        groupInfo._nested_group_name = `GPU Node ID. ${this.getNodeIdFromAgent(event.args.gpu_id)}`;
        groupInfo._subgroup_id       = event.args.queue_id || 1
      } else if (traceDomain === 16) {
        eventName = `Copy${this.getMemKind(event.args.src_type)}To${this.getMemKind(event.args.dst_type)}`;
        event._event_kind = "MEMORY";
        groupInfo._nested_group_id   = `${traceDomain}_${eventName}`;
        groupInfo._nested_group_name =eventName;
        groupInfo._subgroup_id       = 1
      } else {
        eventName = event.name;
        event._event_kind = "CPU";
        groupInfo._nested_group_id   = `${traceDomain}_${event.tid}`;
        groupInfo._nested_group_name = `TID. ${event.tid}`;
        groupInfo._subgroup_id       = computeDepth(event)
      }

      return {groupInfo, eventName}
    };

    const createItemsDataset = () => {
      this.traceEvents.forEach(event => {
        idMap.set(event.id, event)
      });
      this.traceEvents.forEach((event) => {
        const { groupInfo, eventName } = preprocessTraceEvents(event);
        if (event.start < this.minStart) this.minStart = event.start;
        if (event.end   > this.maxEnd)   this.maxEnd   = event.end;

        if ([17, 18, 19].includes(event.d)) {
          this.items.push({
            className:  'non-highlighted',
            style:      'background-color: '+hashStringToLightColor("Dispatch"),
            id:         `Dispatch_${event.id}`,
            content:    "Dispatch",
            start:      event.args.dispatch_time / 1000,
            end:        (event.args.dispatch_time + 1000) / 1000,
            group:      groupInfo._nested_group_id,
            subgroup:   groupInfo._subgroup_id,
            traceData: {
              corr_id: event.id,
              dispatched_event: eventName,
              dispatch_time: event.args.dispatch_time,
              _event_kind: "DISPATCH"
          }
          });
        }

        this.items.push({
          className: 'non-highlighted',
          style:     'background-color: '+hashStringToLightColor(eventName),
          id:        event.id,
          content:   eventName,
          start:     Math.round(event.start / 1000),
          end:       Math.round(event.end / 1000),
          group:     groupInfo._nested_group_id,
          subgroup:  groupInfo._subgroup_id,
          limitSize: true,
          traceData: event,
        });

        const eventDomain = event.d;
        const groupId = groupInfo._nested_group_id;

        if (!groupsTmp[eventDomain]) {
          groupsTmp[eventDomain] = [];
        }

        const groupList = groupsTmp[eventDomain];
        let targetGroup = groupList.find(group => group.id === groupId);

        if (!targetGroup) {
          targetGroup = {
            style: "color: var(--text-color); background-color: var(--secondary-tl); font-size: 13px; text-align: right; border-color: var(--border-color);",
            id: groupId,
            content: groupInfo._nested_group_name,
            value: eventDomain,
            treeLevel: 2,
            totalDuration: 0,
            isGpuGroup: event._event_kind !== "CPU"
          };
          groupList.push(targetGroup)
        }

        targetGroup.totalDuration += event.dur;
      })
    };

    const createGroupsDataset = () => {
      let gpuCounter = 1; // Start GPU counter from the smallest value
      let cpuCounter = Object.entries(groupsTmp).length; // Start CPU counter from the largest value

      Object.entries(groupsTmp).forEach(([traceDomain, nestedGroups]) => {
        let isGPU = nestedGroups[0].isGpuGroup;
        // if (isGPU) {
        //   nestedGroups.forEach(nestedGroup => {
        //     const percent = (nestedGroup.totalDuration/main_duration)*100;
        //     nestedGroup.content = nestedGroup.content+"<div style=\"font-size: 9px\">GPU USAGE: "+percent.toFixed(2)+"%";
        //   });
        // };
        this.groups.push(...nestedGroups);
        this.groups.push({
          className:      "groupClass",
          style:          "color: var(--text-color); background-color: var(--primary-tl); font-size: 13px; text-align: left; border-color: var(--border-color)",
          treeLevel:      1,
          id:             traceDomain,
          content:        this.getDomainNameFromId(traceDomain),
          desc:           this.getDomainDescFromId(traceDomain),
          value:          isGPU ? gpuCounter++ : cpuCounter--,
          subgroupStack:  true,
          showNested:     isGPU,
          nestedGroups:   nestedGroups.map((group) => group.id),
        })
      })
    };

    createItemsDataset();
    createGroupsDataset();
  }
}