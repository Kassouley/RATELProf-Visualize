const strongColors = [
    "#e41a1c", "#377eb8", "#4daf4a", "#ff7f00",
    "#984ea3", "#ffff33", "#a65628"
];

Chart.register({
    id: "strongColors",
    beforeDatasetsUpdate(chart) {
        if (chart.config._config.id === "histogram") {
            chart.data.datasets.forEach((ds, i) => {
                if (ds.label == "others") ds.backgroundColor = '#636363'
                else ds.backgroundColor = strongColors[i % strongColors.length]; 
                // If needed, when can change according to name too
            });
        }
    }
});

const legendTooltip = document.createElement('div');
document.addEventListener('DOMContentLoaded', () => {
    const l = legendTooltip;
    l.id = 'legend-tooltip';
    l.style.position = 'absolute';
    l.style.background = 'rgba(0,0,0,0.7)';
    l.style.color = '#fff';
    l.style.padding = '4px 8px';
    l.style.borderRadius = '4px';
    l.style.pointerEvents = 'none';
    l.style.fontSize = '12px';
    l.style.display = 'none';
    l.style.zIndex = 1000;
    l.style.wordBreak = 'break-word';
    l.style.overflowWrap = 'break-word';
    document.body.appendChild(legendTooltip);
});

const moveTooltip = (e) => {
    legendTooltip.style.left = e.clientX + 10 + 'px';
    legendTooltip.style.top = e.clientY + 10 + 'px';
};

const hideTooltip = () => {
    legendTooltip.style.display = "none";
    document.removeEventListener('mousemove', moveTooltip);
};

const displayTooltip = (content) => {
    if (!content) return;
    legendTooltip.innerText = content;
    legendTooltip.style.display = "block";
    document.addEventListener('mousemove', moveTooltip);
};

Chart.register({
    id: 'truncateLegend',
    beforeInit(chart) {
        const MAX_SIZE = 15;

        const legend = chart.options.plugins.legend
        if (!legend) return;

        const legendOptions = legend.labels;
        const originalFn = legendOptions.generateLabels;
        chart.canvas.addEventListener('mouseout', hideTooltip);

        legendOptions.generateLabels = function (chart) {
            const labels = originalFn(chart);

            labels.forEach(label => {
                if (label.text.length > MAX_SIZE) {
                label._fullText = label.text;
                label.text = label.text.substring(0, MAX_SIZE) + '...';
                }
            });

            return labels;
        };

        legend.onHover = function (_, legendItem) {
            displayTooltip(legendItem._fullText);
        };

        legend.onLeave = hideTooltip;
    }
});

/* ============================= */
/* ======= HISTOGRAM ============ */
/* ============================= */
function renderHistogram(container, data) {
    const canvas = document.createElement("canvas");
    container.innerHTML = '';
    container.appendChild(canvas);
    new Chart(canvas, {
        id: "histogram",
        type: "bar",
        data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    title: { display: true, text: data.xLabel }
                },
                y: {
                    max: 100,
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: data.yLabel }
                }
            },
            plugins: {
                title: data.title && {
                    display: true,
                    text: data.title,
                    font: { size: 12 },
                    padding: { top: 10, bottom: 10 }
                },
                legend: { 
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label({dataset, raw}) {
                            return `${dataset.label}: ${raw}%`;
                        }
                    }
                }
            }
        }
    });
    return canvas;
}

/* ============================= */
/* ======== PIE CHARTS ========= */
/* ============================= */
function renderPie(container, plotData, index) {
    const canvas = document.createElement("canvas");
    container.innerHTML = '';
    container.appendChild(canvas);
    const datasets = plotData.datasets;

    const labels = [];
    const data = [];
    const backgroundColor = []

    let usedTotal = 0;

    for (let i = 0; i < datasets.length; i++) {
        const ds = datasets[i];
        const value = ds.data[index] ?? 0;

        labels.push(ds.label);
        data.push(value);
        backgroundColor.push(strongColors[i % strongColors.length]);
        usedTotal += value;
    }

    const idle = 100 - usedTotal;

    if (idle > 0) {
        labels.push("Idle / Unknown");
        data.push(idle);
        backgroundColor.push("#bbbbbb");
    }


    new Chart(canvas, {
        type: "pie",
        data: {
            labels,
            datasets: [{ data, backgroundColor }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label({raw}) {
                            return `${raw}%`;
                        }
                    }
                }
            }
        }
    });
}


/* ============================= */
/* = Multibar Histogram CHARTS = */
/* ============================= */
function renderMultibarHistogram(container, data) {
    const canvas = document.createElement("canvas");
    container.innerHTML = '';
    container.appendChild(canvas);

    return new Chart(canvas, {
        type:'bar',
        data,
        options:{
            maintainAspectRatio: false,
            responsive:true,
            plugins:{
                tooltip:{
                    callbacks:{
                        label(context){
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
                        }
                    }
                },
                    legend:{
                        position:'bottom'
                    }
                },
                scales:{
                    x: {
                        stacked:false,
                        title: { display:true, text: data.xLabel }
                    },
                    y: {
                        beginAtZero:true,
                        max:100,
                        title: { display:true, text: data.yLabel }
                    }
            }
        }
    });
}


/* ============================= */
/* ====== Heatmap CHARTS ======= */
/* ============================= */
const gradientColors = [
  { stop: 0, color: "#D9FFFD" },   // Cold
  { stop: 50, color: "#DEC871" },  // Medium
  { stop: 100, color: "#ED6253" }  // Hot
];


function getColorByPercent(percent) {
    percent = Math.max(0, Math.min(100, percent));

    let lower = gradientColors[0];
    let upper = gradientColors[gradientColors.length - 1];

    for (let i = 0; i < gradientColors.length - 1; i++) {
        if (percent >= gradientColors[i].stop && percent <= gradientColors[i + 1].stop) {
            lower = gradientColors[i];
            upper = gradientColors[i + 1];
            break;
        }
    }

    function hexToRgb(hex) {
        hex = hex.replace("#", "");
        return [
            parseInt(hex.substring(0, 2), 16),
            parseInt(hex.substring(2, 4), 16),
            parseInt(hex.substring(4, 6), 16)
        ];
    }

    const lowerRgb = hexToRgb(lower.color);
    const upperRgb = hexToRgb(upper.color);

    const factor = (percent - lower.stop) / (upper.stop - lower.stop);

    const r = Math.round(lowerRgb[0] + (upperRgb[0] - lowerRgb[0]) * factor);
    const g = Math.round(lowerRgb[1] + (upperRgb[1] - lowerRgb[1]) * factor);
    const b = Math.round(lowerRgb[2] + (upperRgb[2] - lowerRgb[2]) * factor);

    return `rgb(${r},${g},${b})`;
}


function getPercentage(ctx, data) {
  return data.datasets[ctx.datasetIndex].data[ctx.dataIndex]
}

function createHeatmapLegend(gradientColors) {
  const canvas = document.getElementById("heatLegend");
  const ctx = canvas.getContext("2d");
  const w = 600;
  const h = 20;
  const fontSize = 10;
  canvas.width = w;
  canvas.height = h;

  // --- Draw Gradient ---
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradientColors.forEach(gc => {
      gradient.addColorStop(gc.stop / 100, gc.color);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // --- Draw Percentage Scale ---
  ctx.fillStyle = "#000"; 
  ctx.font = fontSize + "px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let i = 0; i <= 5; i++) {
      let x = (w / 5) * i;
      const percent = i * 20;
      if (i === 0) x = fontSize;
      if (i === 5) x = w - fontSize * 1.5;
      ctx.fillText(`${percent}%`, x, h/2 - fontSize/2 + 1);
  }
}
function createContainerHelp(container) {

}


function renderHeatmap(container, data) {
    container.innerHTML = `
      <div style="display:flex; flex:1; flex-direction:column; height:100%; width:100%; padding-bottom:10px">
      <div style="flex: 1; min-height: 0; height:100%; width:100%;" id="heatmapContainer">
        <canvas id="canvasHeatmap"></canvas>
      </div>
      <div style="display: grid; grid-template-columns: 1fr auto 1fr;
        align-items: center; width: 100%; gap: 10px; 
      ">
        <div style="justify-self: start; display: flex; align-items: center;">
          <label class="light"> <input type="checkbox" id="pctCheckbox"> Show percentages </label>
        </div>

        <div style="display: flex; justify-self: center; align-items: center;
          border: 1px solid #cbcbcb; padding: 2px;
        ">
          <canvas id="heatLegend""></canvas>
        </div>
      </div>
    </div>`;
      
    createHeatmapLegend(gradientColors);

    const datasets = data.datasets.map((ds)=>({

      label: ds.label,

      data: new Array(data.labels.length).fill(1),

      backgroundColor: ds.data.map(v => getColorByPercent(v)),
      borderWidth:1,
      categoryPercentage: 1.0,
      barPercentage: 1.0,
    }));

    const labels = data.labels;
    const yLabels = data.datasets.map(d => d.label);

    const chart = new Chart("canvasHeatmap", {
        type: "bar",
        data: { labels, datasets }, 
        options: {
            responsive:true,
            maintainAspectRatio:false,

            plugins: {
            datalabels: {
                display: false,
                color: '#000',
                anchor: 'center',
                align: 'center',
                formatter: (_, ctx) => getPercentage(ctx, data)
            },

            legend:{ display: false },
                tooltip: {
                    callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${getPercentage(ctx, data)}%`
                    }
                }
            }, 
            
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                },

                y: {
                    beginAtZero: true,
                    stacked: true,
                    grid: { display: false },
                    min: 0,
                    ticks: {
                        count: (yLabels.length * 2 + 1),
                        callback(value, index) {
                            return Number.isInteger(value) ? null : yLabels[Math.floor(value)]
                        }
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });

  const checkbox = document.getElementById("pctCheckbox");
  checkbox.addEventListener("change", ( e) => {
    chart.options.plugins.datalabels.display = checkbox.checked;
    chart.update('none');
  });
}
