class TraceProcessor {
  constructor(data) {
    this.traceEvents = data.trace_events || {};
    this.lcEvents = data.lifecycle || {};
    this.domainIDs = data.domain_id || {};
    this.nodeIDs = data.node_id || {};

    this.groups = [];

    this.items = [{
      id: "Constructor",
      content: "Constructor",
      type: "background",
      start: (this.lcEvents.constructor_start) / 1000,
      end: (this.lcEvents.main_start) / 1000
    },{
      id: "Main",
      content: "Main",
      type: "background",
      start: (this.lcEvents.main_start) / 1000,
      end: (this.lcEvents.main_stop) / 1000,
      className: "mainBackground"
    },{
      id: "Destructor",
      content: "Destructor",
      type: "background",
      start: (this.lcEvents.main_stop) / 1000,
      end: (this.lcEvents.destructor_stop) / 1000
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
    for (const [name, value] of Object.entries(this.domainIDs)) {
      if (value.id == traceDomain) {
        return name.replace("RATELPROF_DOMAIN_", "").replaceAll("_", " ");
      }
    }
    return "Unknown Domain"
  };

  getDomainDescFromId(traceDomain) {
    for (const [name, value] of Object.entries(this.domainIDs)) {
      if (value.id == traceDomain) {
        return value.desc;
      }
    }
    return "Unknown Domain"
  };

  processTraces() {
    
    const depthMap = new Map();
    const groupsList = {};
    
    const computeDepth = (events, event, id) => {
      if (depthMap.has(id)) return depthMap.get(id);
      if (!event.corr_id || !(event.corr_id in events)) return 1;
    
      const depth = 1 + computeDepth(events, events[event.corr_id], event.corr_id);
      depthMap.set(id, depth);
      return depth;
    };

    const createNestedGroup = (parentGroup, id, content, value, treeLevel) => {
      if (!parentGroup.nested_groups[id]) {
        parentGroup.nested_groups[id] = {
          group: {
            className: "lvl-last-group-class",
            style: "color:var(--text-color);font-size:12px;text-align:right;background-color:var(--lvl-last-group-color)",
            id,
            content,
            value,
            treeLevel,
          },
          nested_groups: {},
        };
        if (!parentGroup.group.nestedGroups) {
          parentGroup.group.nestedGroups = [];
          parentGroup.group.style = parentGroup.group.style.replace("last", "mid");
          parentGroup.group.className = parentGroup.group.className.replace("last", "mid")
        }
        parentGroup.group.nestedGroups.push(id); 
      }
      return parentGroup.nested_groups[id];
    };


    const preprocessTraceEvents = (event, id, domain, group) => {
      let eventName = "N/A";

      let nestedGroupKey, nestedGroupName;
      if (["7", "8", "9"].includes(domain)) {
        if (domain === "7") {
          eventName = event.args.kernel_name || "N/A";
          event._event_kind = "KERNEL";
        } else if (domain === "8") {
          eventName = "BarrierAnd";
          event._event_kind = "BARRIER";
        } else {
          eventName = "BarrierOr";
          event._event_kind = "BARRIER";
        }

        nestedGroupKey  = `${domain}_${event.args.gpu_id}`;
        nestedGroupName = `GPU Node ID. ${this.getNodeIdFromAgent(event.args.gpu_id)}`;

        const nestedGroup = createNestedGroup(group, nestedGroupKey, nestedGroupName, event.args.gpu_id, 2);

        nestedGroupKey  = `${domain}_${event.args.gpu_id}_${event.args.queue_id}`;
        nestedGroupName = `Queue ID. ${event.args.queue_id}`;

        createNestedGroup(nestedGroup, nestedGroupKey, nestedGroupName, event.args.queue_id, 3);

        this.items.push({
            className:  'non-highlighted',
            id:         `Dispatch_${id}`,
            start:      (event.args.dispatch_time) / 1000,
            type:       "point",
            group:      nestedGroupKey,
            traceData: {
              corr_id: parseInt(id),
              dispatched_event: eventName,
              dispatch_time: event.args.dispatch_time,
              _event_kind: "DISPATCH"
        }});


      } else if (domain === "6") {
        eventName = `Copy${this.getMemKind(event.args.src_type)}To${this.getMemKind(event.args.dst_type)}`;
        event._event_kind = "MEMORY";

        nestedGroupKey   = `${domain}_${event.args.engine_id}`;
        nestedGroupName  = `SDMA ID. ${(event.args.engine_id == -1) ? "Unknown" : event.args.engine_id}`;
        
        createNestedGroup(group, nestedGroupKey, nestedGroupName, event.args.engine_id, 2);

      } else {
        eventName = event.name;
        event._event_kind = "CPU";
        
        nestedGroupKey     = `${domain}_${event.tid}`;
        nestedGroupName    = `TID. ${event.tid}`;
        
        createNestedGroup(group, nestedGroupKey, nestedGroupName, event.tid, 2);
      }

      return {nestedGroupKey, eventName}
    };

    function concatGroups(groupsList) {
      let result = [];
      for (const [d, group] of Object.entries(groupsList)) {
        result.push(group.group);
        if (group.nested_groups && typeof group.nested_groups === 'object') {
          result = result.concat(concatGroups(group.nested_groups));
        }
      }
      return result;
   }

    for (const [domain, events] of Object.entries(this.traceEvents)) {
      const d = parseInt(domain);
      const group = {
        group: {
          className:  "lvl1-group-class",
          style:      "color:var(--text-color);background-color:var(--lvl1-group-color);font-size:13px;text-align:left;",
          treeLevel:  1,
          id:         d,
          content:    this.getDomainNameFromId(d),
          desc:       this.getDomainDescFromId(d),
          showNested: d < 6 ? false : true,
          value:      d < 6 ? 100 + d : d,
          nestedGroups: [],
        },
        nested_groups: {}
      };
      groupsList[d] = group;


      for (const [id, event] of Object.entries(events)) {
        const { nestedGroupKey: groupId, eventName } = preprocessTraceEvents(event, id, domain, group);

        if (event.start < this.minStart) this.minStart = (event.start);
        if (event.stop  > this.maxEnd)   this.maxEnd   = (event.stop);

        this.items.push({
          className: 'non-highlighted',
          style:     'background-color:'+hashStringToLightColor(eventName),
          id:        parseInt(id),
          content:   eventName,
          start:     Math.round(((event.start) / 1000)),
          end:       Math.round(((event.stop + 1000) / 1000)),
          group:     groupId,
          subgroup:  computeDepth(events, event, id),
          limitSize: true,
          traceData: event,
        })
      }
    };
    this.groups = concatGroups(groupsList);
  }
}