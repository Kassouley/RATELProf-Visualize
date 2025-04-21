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
    if (traceDomain == 99) { return "DISPATCH" } 
    return this.domainIDs[traceDomain]?.name.replace("RATELPROF_", "").replaceAll("_", " ") || "Unknown Domain"
  };

  getDomainDescFromId(traceDomain) {
    if (traceDomain == 99) { return "Dispatch" } 
    return this.domainIDs[traceDomain]?.desc || "Unknown Domain"
  };

  processTraces() {
    const computeDepth = (event, id) => {
      if (depthMap.has(id)) return depthMap.get(id);
      if (!event.corr_id || !(event.corr_id in tracesList)) return 1;
    
      const depth = 1 + computeDepth(tracesList[event.corr_id], event.corr_id);
      depthMap.set(id, depth);
      return depth;
    };

    const idMap = new Map();
    const depthMap = new Map();
    const groupsList = {};
    const tracesList = {};
    
    Object.entries(this.traceEvents).forEach(([id, events]) => {
      groupsList[id] = {
        group: {
          className:  "lvl1-group-class",
          style:      "color:var(--text-color);background-color:var(--lvl1-group-color);font-size:13px;text-align:left;",
          treeLevel:  1,
          id:         id,
          content:    this.getDomainNameFromId(id),
          desc:       this.getDomainDescFromId(id),
          showNested: id < 5 ? false : true,
          value:      id < 5 ? id + 100 : id,
          nestedGroups: [],
        },
        nested_groups: {}
      };
    
      Object.assign(tracesList, events);
    });
    
    Object.entries(this.traceEvents).forEach(([domain, events]) => {
      Object.entries(events).forEach(([id, event]) => {
        const { nestedGroupKey: groupId, eventName, subgroup } = preprocessTraceEvents(event, id, domain);

        if (event.start < this.minStart) this.minStart = event.start;
        if (event.end   > this.maxEnd)   this.maxEnd   = event.end;

        this.items.push({
          className: 'non-highlighted',
          style:     'background-color:'+hashStringToLightColor(eventName),
          id:        id,
          content:   eventName,
          start:     Math.round(event.start / 1000),
          end:       Math.round((event.end + 1000) / 1000),
          group:     groupId,
          subgroup:  subgroup,
          limitSize: true,
          traceData: event,
        })
      })
    });


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


    const preprocessTraceEvents = (event, id, traceDomain) => {
      let eventName = "N/A";
      let subgroup = 1;

      let domainGroup = groupsList[traceDomain];

      let nestedGroupKey, nestedGroupName;
      if ([5, 6, 7].includes(traceDomain)) {
        if (traceDomain === 5) {
          eventName = event.args.kernel_name || "N/A";
          event._event_kind = "KERNEL";
        } else if (traceDomain === 6) {
          eventName = "BarrierAnd";
          event._event_kind = "BARRIER";
        } else {
          eventName = "BarrierOr";
          event._event_kind = "BARRIER";
        }

        nestedGroupKey  = `${traceDomain}_${event.args.gpu_id}`;
        nestedGroupName = `GPU Node ID. ${this.getNodeIdFromAgent(event.args.gpu_id)}`;

        const nestedGroup = createNestedGroup(domainGroup, nestedGroupKey, nestedGroupName, event.args.gpu_id, 2);

        nestedGroupKey  = `${traceDomain}_${event.args.gpu_id}_${event.args.queue_id}`;
        nestedGroupName = `Queue ID. ${event.args.queue_id}`;

        createNestedGroup(nestedGroup, nestedGroupKey, nestedGroupName, event.args.queue_id, 3);

        this.items.push({
            className:  'non-highlighted',
            id:         `Dispatch_${id}`,
            start:      event.args.dispatch_time / 1000,
            type:       "point",
            group:      nestedGroupKey,
            traceData: {
              corr_id: id,
              dispatched_event: eventName,
              dispatch_time: event.args.dispatch_time,
              _event_kind: "DISPATCH"
        }});


      } else if (traceDomain === 4) {
        eventName = `Copy${this.getMemKind(event.args.src_type)}To${this.getMemKind(event.args.dst_type)}`;
        event._event_kind = "MEMORY";

        nestedGroupKey   = `${traceDomain}_${event.args.engine_id}`;
        nestedGroupName  = `SDMA ID. ${(event.args.engine_id == -1) ? "Unknown" : event.args.engine_id}`;
        
        createNestedGroup(domainGroup, nestedGroupKey, nestedGroupName, event.args.engine_id, 2);

      } else {
        eventName = event.name;
        event._event_kind = "CPU";
        
        nestedGroupKey     = `${traceDomain}_${event.tid}`;
        nestedGroupName    = `TID. ${event.tid}`;
        
        createNestedGroup(domainGroup, nestedGroupKey, nestedGroupName, event.tid, 2);
        subgroup = computeDepth(event, id);
      }
      return {nestedGroupKey, eventName, subgroup}
    };

    function concatGroups(groupsList) {
      let result = [];
      for (const key in groupsList) {
          if (groupsList.hasOwnProperty(key)) {
              const group = groupsList[key];
              result.push(group.group);
              if (group.nested_groups && typeof group.nested_groups === 'object') {
                result = result.concat(concatGroups(group.nested_groups));
              }
          }
      }
      return result;
   }

    this.groups = concatGroups(groupsList);
  }
}