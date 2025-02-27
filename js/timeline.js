function prettyPrint(obj, indentLevel = 0) {
    let html = '';
  const indentClass = 'indent'.repeat(indentLevel);

  for (const key in obj) {
    const field = obj[key];
    if (typeof field === 'object' && field !== null) {
      if (field.type && field.value) {
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
        html += prettyPrint(field, indentLevel + 1); // Recurse for other nested objects
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
function getTimelineOptions(minStart, maxEnd) {
    return {
        showCurrentTime: false,
        showMajorLabels: false,
        align: 'center',
        tooltip: {
            followMouse: true,
            template: trace => {
              let tooltip = `<div><strong>${trace.content}</strong><br>`;
              if (trace.traceData._event_kind === "DISPATCH") {
                tooltip += `<strong>Event Dispatched:</strong> ${trace.traceData._event_name} (${trace.traceData._event_id})<br>` +
                           `<strong>Dispatch Time:</strong> ${trace.traceData._event_dispatch_time}`;
              } else {
                tooltip += `<strong>ID:</strong> ${trace.id}<br>` +
                           `<strong>CID:</strong> ${trace.corr_id}<br>` +
                           `<strong>Duration:</strong> ${trace.traceData.dur} ns<br>`;
              }
              tooltip += "</div>";
              return tooltip;
            }
        },
        groupOrder: (a, b) => a.value - b.value,
        groupOrderSwap: (a, b, groups) => {
            if (a.treeLevel === 1 && b.treeLevel === 1) {
                [a.value, b.value] = [b.value, a.value];
            }
        },
        groupTemplate: function (group) {
          if (!group) return;
          var container = document.createElement("div");
          if (group.treeLevel == 1) {
              var iconDiv = document.createElement("div");
              iconDiv.className = "domain-tooltip";
              var infoIcon = document.createElement("img");
              infoIcon.src = "assets/icons/information.png";
              infoIcon.style.width = "11px";
              infoIcon.style.height = "11px";
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
        groupEditable: { order: true },
        margin: { item: 10, axis: 5 },
        zoomMin: 5
    };
}

function createTimeline(data) {
    const { items, groups, minStart, maxEnd } = processTraces(data);
    const highlightedItems = [];
    const container = document.getElementById("timeline");
    const itemsDataSet = new vis.DataSet(items);
    const groupsDataSet = new vis.DataSet(groups);

    const options = getTimelineOptions(minStart, maxEnd);

    const timeline = new vis.Timeline(container, itemsDataSet, groupsDataSet, options);

    const move = percentage => {
        const range = timeline.getWindow();
        const interval = range.end - range.start;
        timeline.setWindow({
            start: range.start.valueOf() - interval * percentage,
            end: range.end.valueOf() - interval * percentage
        });
    };

    const onSelectTraceAux = id => {
        const selectedItem = itemsDataSet.get(id);
        if (selectedItem) {
            highlightTraces(selectedItem);
            showTraceDetails(selectedItem);
        }
    };

    const gotoTrace = () => {
        const id = parseInt(document.getElementById("id_input").value.trim(), 10);
        if (!isNaN(id)) {
            timeline.setSelection(id, { focus: true });
            onSelectTraceAux(id);
        } else {
            alert("Please enter a valid Trace ID.");
        }
    };

    const onSelectTrace = properties => {
        if (properties.items.length > 0) {
            onSelectTraceAux(properties.items[0]);
        } else {
            clearTraceDetails();
            clearHighlightTraces();
        }
    };

    const focusOnTrace = properties => {
        if (properties.what === 'item') {
            const selectedItem = itemsDataSet.get(properties.item);
            if (selectedItem) {
                timeline.setSelection(selectedItem.id, { focus: true });
            }
        }
    };

    const createDetails = (field, value) => `<strong>${field}:</strong> ${value}<br>`;

    const showTraceDetails = trace => {
        const traceInfo = document.getElementById('trace-info');
        const traceData = trace.traceData || {};
        const traceArgs = traceData.args || {};
        const commonDetails = [];
        const domainSpecificDetails = [];

        commonDetails.push(createDetails("Name", trace.content));
        if (traceData._event_kind === "DISPATCH") {
            commonDetails.push(createDetails("Event Dispatched", `${traceData._event_name} (${traceData._event_id})`));
            commonDetails.push(createDetails("Dispatch Time", trace.start));
        } else {
            commonDetails.push(createDetails("ID", trace.id));
            commonDetails.push(createDetails("CID", trace.corr_id));
            commonDetails.push(createDetails("Duration", `${traceData.dur || 'N/A'} ns`));
            commonDetails.push(createDetails("Start Time", trace.start));
            commonDetails.push(createDetails("End Time", trace.end));
        }

        const append = (details, field, value) => details.push(createDetails(field, value));

        const domainHandlers = {
            CPU: () => {
                append(commonDetails, "Process ID", traceData.pid);
                append(commonDetails, "Thread ID", traceData.tid);
                append(domainSpecificDetails, "Data", prettyPrint(traceArgs));
            },
            KERNEL: () => {
                append(commonDetails, "Dispatch Time", traceArgs.dispatch_time);
                append(domainSpecificDetails, "GPU Node ID", `${traceData._event_node_id} (${traceArgs.gpu_id})`);
                append(domainSpecificDetails, "Queue ID", traceArgs.queue_id);
                append(domainSpecificDetails, "Block Dimension", `[${traceArgs.wrg.join(", ")}]`);
                append(domainSpecificDetails, "Grid Dimension", `[${traceArgs.grd.join(", ")}]`);
                append(domainSpecificDetails, "Private Segment Size", traceArgs.private_segment_size);
                append(domainSpecificDetails, "Group Segment Size", traceArgs.group_segment_size);
                append(domainSpecificDetails, "Kernel Handle", traceArgs.kernel_object);
                append(domainSpecificDetails, "Kernel Arg Addr", traceArgs.kernarg_address);
                append(domainSpecificDetails, "Completion Signal", traceData.sig);
            },
            BARRIER: () => {
                append(commonDetails, "Dispatch Time", traceArgs.dispatch_time);
                append(domainSpecificDetails, "GPU Node ID", `${traceData._event_node_id} (${traceArgs.gpu_id})`);
                append(domainSpecificDetails, "Queue ID", traceArgs.queue_id);
                append(domainSpecificDetails, "Completion Signal", traceData.sig);
            },
            MEMORY: () => {
                append(domainSpecificDetails, "Source", `${traceData._copy_src_kind} Node ID. ${traceData._copy_src_node_id} (${traceArgs.src_agent})`);
                append(domainSpecificDetails, "Destination", `${traceData._copy_dst_kind} Node ID. ${traceData._copy_dst_node_id} (${traceArgs.dst_agent})`);
                append(domainSpecificDetails, "Size transferred", `${traceArgs.size} bytes`);
                append(domainSpecificDetails, "Completion Signal", traceData.sig);
            }
        };

        if (domainHandlers[traceData._event_kind]) domainHandlers[traceData._event_kind]();

        traceInfo.innerHTML = '<div class="two-column-flex">' +
                                `<div class="column">${commonDetails.join("\n")}</div>` +
                                `<div class="column">${domainSpecificDetails.join("\n")}</div>` +
                              '</div>';
    };


    const clearTraceDetails = () => {
        document.getElementById('trace-info').innerHTML = 'Click on a trace to view details here.';
    };

    const clearHighlightTraces = () => {
        itemsDataSet.update(highlightedItems.map(item => ({ id: item.id, className: 'non-highlighted' })));
        highlightedItems.length = 0;
    };

    const highlightTraces = selectedItem => {
        clearHighlightTraces();

        itemsDataSet.forEach(item => {
            if (item.corr_id === selectedItem.id) {
                highlightedItems.push({ id: item.id, className: 'highlighted'});
            }
        });
        itemsDataSet.update(highlightedItems);
    };

    // Attach navigation and event handlers
    document.getElementById("zoomIn").onclick = () => timeline.zoomIn(0.2);
    document.getElementById("zoomOut").onclick = () => timeline.zoomOut(0.2);
    document.getElementById("moveLeft").onclick = () => move(0.2);
    document.getElementById("moveRight").onclick = () => move(-0.2);
    document.getElementById("goto").onclick = () => gotoTrace();

    timeline.on('select', onSelectTrace);
    timeline.on('doubleClick', focusOnTrace);
    return timeline;
}