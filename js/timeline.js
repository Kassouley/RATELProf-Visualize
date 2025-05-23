function prettyPrint(obj, indentLevel = 0) {
  let html = '';
  const indentClass = 'indent'.repeat(indentLevel);

  for (const key in obj) {
    const field = obj[key];
    if (typeof field === 'object' && field !== null) {
      if (field.type != undefined && field.value != undefined) {
        html += `<div class="${indentClass}"><span class="type">${field.type}</span> <span class="key">${key}</span> =  `;
        if (field.value["->*"]) {
          const keys = Object.keys(field.value);
          keys.forEach((subfield, index) => {
            if (index < keys.length - 1) {
              html += `<span class="value">${field.value[subfield]}</span> -> `;
            } else {
              html += prettyPrint(field.value[subfield], indentLevel + 1);
            }
          });
          html += `</div>`;
        } else if (typeof field.value === 'object') {
          html += `{<div class="indent">`;
          html += prettyPrint(field.value, indentLevel + 1); 
          html += `</div>}</div>`;
        } else {
          html += `<span class="value">${field.value}</span></div>`;
        }
      } else {
        html += `<div class="${indentClass}"><span class="key">${key}</span> = {<div class="indent">`;
        html += prettyPrint(field, indentLevel + 1); 
        html += `</div>}</div>`;
      }
    }
  }
  return html;
}


/*
 * Get options array for the timeline instance.
 * See "https://visjs.github.io/vis-timeline/docs/timeline/" for more details.
 */
function getTimelineOptions(traceProcessor) {
    const minStart = traceProcessor.minStart; 
    const maxEnd   = traceProcessor.maxEnd;
    return {
        showCurrentTime: false,
        showMajorLabels: false,
        horizontalScroll: false,
        verticalScroll: false,
        zoomKey: "ctrlKey",
        align: 'center',
        tooltip: {
            followMouse: true,
            template: trace => {
              let tooltip = `<div>`;
              if (trace.traceData._event_kind === "DISPATCH") {
                tooltip += `<strong>Dispatch</strong><br>` +
                           `<strong>Event Dispatched:</strong> ${trace.traceData.dispatched_event} (${trace.traceData.corr_id})<br>` +
                           `<strong>Dispatch Time:</strong> ${traceProcessor.normalizeTime(trace.traceData.dispatch_time)}`;
              } else {
                tooltip += `<strong>${trace.content}</strong><br>` +
                           `<strong>ID:</strong> ${trace.id}<br>` +
                           `<strong>CID:</strong> ${trace.traceData.corr_id}<br>` +
                           `<strong>Duration:</strong> ${convertTime(trace.traceData.dur, true)}<br>`;
              }
              tooltip += "</div>";
              return tooltip;
            }
        },
        groupEditable: { order: true },
        groupOrder: "value",
        groupOrderSwap: function (a, b, groups) {
            if (a.treeLevel === b.treeLevel && a.nestedInGroup == b.nestedInGroup) {
                var v = a.value;
                a.value = b.value;
                b.value = v;
            }
        },
        groupTemplate: function (group) {
          if (!group) return;
          var container = document.createElement("div");
          if (group.treeLevel == 1) {
              var iconDiv       = document.createElement("div");
              iconDiv.className = "domain-tooltip";

              var infoIcon      = document.createElement("img");
              infoIcon.src      = "assets/icons/information.png";
              infoIcon.style.paddingRight = "5px";

              var tooltipText = document.createElement("span");
              tooltipText.className = "tooltiptext";
              tooltipText.innerHTML = group.desc;
     
              iconDiv.appendChild(infoIcon);
              iconDiv.appendChild(tooltipText);
              container.appendChild(iconDiv);
          }
          
          var label = document.createElement("span");
          label.innerHTML = group.content;
          container.appendChild(label);  

          return container;
        },
        loadingScreenTemplate: () => "<h1>Loading...</h1>",
        onTimeout: {
            timeoutMs: 100,
            callback: callback => {
                const didUserCancel = confirm(
                    "Too many items loaded! Would you like to continue rendering (this might take a while)?"
                );
                callback(didUserCancel);
            }
        },
        stack: false,
        min: (minStart / 1000) - 1000,
        max: (maxEnd / 1000) + 1000,
        groupHeightMode: 'fixed',
        orientation: "none",
        margin: { item: 10, axis: 5 },
        zoomMin: 5
    };
}

function createTimeline(traceProcessor) {
    const container      = document.getElementById("timeline");
    const options        = getTimelineOptions(traceProcessor);
    const itemsDataSet   = new vis.DataSet(traceProcessor.items);
    const groupsDataSet  = new vis.DataSet(traceProcessor.groups);
    const timeline       = new vis.Timeline(container, itemsDataSet, groupsDataSet, options);

    const createDetails = (field, value) => `<tr><th>${field}:</th> <td>${value}</td></tr>`;

    const showTraceDetails = trace => {
        const traceInfo = document.getElementById('trace-info');
        const traceData = trace.traceData || {};
        const traceArgs = traceData.args  || {};
        const lcol = [];
        const rcol = [];
        
        const append = (details, field, value) => details.push(createDetails(field, value));

        if (traceData._event_kind === "DISPATCH") {
                append(lcol, "Name",             "Dispatch");
                append(lcol, "Event Dispatched", `${traceData.dispatched_event} (${traceData.corr_id})`);
                append(lcol, "Dispatch Time",    traceProcessor.normalizeTime(traceData.dispatch_time));
        } else {
                append(lcol, "Name",       trace.content);
                append(lcol, "ID",         trace.id);
                append(lcol, "CID",        traceData.corr_id);
                append(lcol, "Duration",   convertTime(traceData.dur, true) || 'N/A');
                append(lcol, "Start Time", traceProcessor.normalizeTime(traceData.start));
                append(lcol, "End Time",   traceProcessor.normalizeTime(traceData.stop));
        }
        const domainHandlers = {
            CPU: () => {
                append(lcol, "Process ID",         traceData.pid);
                append(lcol, "Thread ID",          traceData.tid);
                append(rcol, "Function Arguments", prettyPrint(traceArgs));
            },
            KERNEL: () => {
                append(lcol, "Dispatch Time",          traceProcessor.normalizeTime(traceArgs.dispatch_time));
                append(rcol, "GPU Node ID",            `${traceProcessor.getNodeIdFromAgent(traceArgs.gpu_id)} (${traceArgs.gpu_id})`);
                append(rcol, "Queue ID",               traceArgs.queue_id);
                append(rcol, "Block Dimension",        `[${traceArgs.wrg.join(", ")}]`);
                append(rcol, "Grid Dimension",         `[${traceArgs.grd.join(", ")}]`);
                append(rcol, "Private Segment Size",   traceArgs.private_segment_size);
                append(rcol, "Group Segment Size",     traceArgs.group_segment_size);
                append(rcol, "Kernel Handle",          traceArgs.kernel_object);
                append(rcol, "Kernel Arg Addr",        traceArgs.kernarg_address);
                append(rcol, "Completion Signal",      traceData.sig);
            },
            BARRIER: () => {
                append(lcol, "Dispatch Time",      traceProcessor.normalizeTime(traceArgs.dispatch_time));
                append(rcol, "GPU Node ID",        `${traceProcessor.getNodeIdFromAgent(traceArgs.gpu_id)} (${traceArgs.gpu_id})`);
                append(rcol, "Queue ID",           traceArgs.queue_id);
                append(rcol, "Dependent Signals",  `[${traceArgs.dep_signal.join(", ")}]`);
                append(rcol, "Completion Signal",  traceData.sig);
            },
            MEMORY: () => {
                append(rcol, "Source",             `${traceProcessor.getMemKind(traceArgs.src_type)} Node ID. ${traceProcessor.getNodeIdFromAgent(traceArgs.src_agent)} (${traceArgs.src_agent})`);
                append(rcol, "Destination",        `${traceProcessor.getMemKind(traceArgs.dst_type)} Node ID. ${traceProcessor.getNodeIdFromAgent(traceArgs.dst_agent)} (${traceArgs.dst_agent})`);
                append(rcol, "Size transferred",   convertBytes(traceArgs.size));
                append(rcol, "SDMA Engine ID",     traceArgs.engine_id);
                append(rcol, "Completion Signal",  traceData.sig);
            }
        };

        if (domainHandlers[traceData._event_kind]) domainHandlers[traceData._event_kind]();

        traceInfo.innerHTML = '<div class="two-column-flex">' +
                                `<div class="column"><table class="info-table">${lcol.join("\n")}</table></div>` +
                                `<div class="column"><table class="info-table">${rcol.join("\n")}</table></div>` +
                              '</div>';
    };


    const clearTraceDetails = () => {
        document.getElementById('trace-info').innerHTML = 'Click on a trace to view details here.';
    };

    const highlightedOriginalItems = [];

    const clearHighlightTraces = () => {
        if (highlightedOriginalItems.length) {
            itemsDataSet.update(highlightedOriginalItems);
            highlightedOriginalItems.length = 0; // Reset array
        }
    };

    const highlightTraces = (filterFun) => {
        clearHighlightTraces();

        const matchingItems = itemsDataSet.get().filter(filterFun);
        if (matchingItems.length === 0) return;

        highlightedOriginalItems.push(...matchingItems);
        
        const highlightedItems = matchingItems.map(item => ({
            id: item.id,
            className: 'highlighted'
        }));
        itemsDataSet.update(highlightedItems);
    };

    const move = percentage => {
        const range = timeline.getWindow();
        const interval = range.end - range.start;
        timeline.setWindow({
            start: range.start.valueOf() - interval * percentage,
            end: range.end.valueOf() - interval * percentage
        });
    };


    const onSelectTraceAux = (id, isCtrlKeyPushed) => {
        const selectedItem = itemsDataSet.get(id);
        if (selectedItem) {
            if (isCtrlKeyPushed) highlightTraces(item => item.traceData?.corr_id === selectedItem.id);
            else highlightTraces(item => item.id === selectedItem.traceData?.corr_id);
            showTraceDetails(selectedItem);
        }
    };


    // Attach navigation and event handlers
    document.getElementById("zoomIn").onclick = () => timeline.zoomIn(0.3);
    document.getElementById("zoomOut").onclick = () => timeline.zoomOut(0.3);

    document.getElementById("moveLeft").onclick = () => move(0.3);
    document.getElementById("moveRight").onclick = () => move(-0.3);

    document.getElementById("goto").onclick = () => {
        const id = parseInt(document.getElementById("id_input").value.trim(), 10);
        if (!isNaN(id)) {
            timeline.setSelection(id, { focus: true });
            onSelectTraceAux(id, false);
        } else {
            alert("Please enter a valid Trace ID.");
        }
    };

    let isRightMouseDown = false;
    let firstTime = null;
    let timeMarkerId = "time_marker_id";
    let tempItem = null;

    const updateTimeMarker = (currTime) => {
        let [start, end] = firstTime < currTime ? [firstTime, currTime] : [currTime, firstTime];
        let isItemExist = itemsDataSet.get(tempItem.id);
        if (isItemExist) {
            itemsDataSet.update({ 
                id: timeMarkerId, 
                content: convertTime(end - start), 
                start, 
                end 
            });
        } else {
            if (start.getTime() !== end.getTime()) {
                tempItem.start = start;
                tempItem.end = end;
                itemsDataSet.add(tempItem);
            }
        }
    };

    timeline.on('contextmenu', function (properties) {
        properties.event.preventDefault();
    });

    timeline.on('mouseDown', function (properties) {
        if (properties.event.button === 2) {
            itemsDataSet.remove(timeMarkerId);
            if (properties.what == 'background' && properties.time) {
                isRightMouseDown = true;
                firstTime = properties.time;
                tempItem = {
                    id: timeMarkerId,
                    type: "background"
                };
            }
        }
    });

    timeline.on('mouseMove', function (properties) {
        if (isRightMouseDown && properties.time) {
            updateTimeMarker(properties.time);
        }
    });

    timeline.on('mouseUp', function (properties) {
        if (isRightMouseDown && properties.time) {
            updateTimeMarker(properties.time);
        }
        isRightMouseDown = false;
    });


    timeline.on('select', function (properties) {
        if (properties.items.length > 0) {
            if (properties.event.srcEvent.ctrlKey) {
                onSelectTraceAux(properties.items[0], false);
            } else {
                onSelectTraceAux(properties.items[0], true);
            }
        } else {
            clearTraceDetails();
            clearHighlightTraces();
        }
    });

    timeline.on('doubleClick', function (properties) {
        if (properties.what === 'item') {
            const selectedItem = itemsDataSet.get(properties.item);
            if (selectedItem) {
                timeline.focus(selectedItem.id);
            }
        }
    });
    return timeline;
}