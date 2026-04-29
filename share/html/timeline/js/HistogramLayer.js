// HistogramLayer.js
class HistogramLayer extends deck.CompositeLayer {
    updateState({props,  changeFlags}) {
        if (changeFlags.dataChanged) {
            const subLayerData = [];
            const overlayData = [];

            for (let barIndex in props.data) {
                const segments = props.data[barIndex];
                const x = Number(barIndex);

                let yStart = 0;

                for (let segmentName in segments) {
                    const {ratio, color} = segments[segmentName];

                    subLayerData.push({
                        x, ratio, yStart, color
                    });

                    yStart += ratio;
                }

                overlayData.push({x, segments});
            }

         
            this.setState({subLayerData, overlayData});
        }
    }

    renderLayers() {
        const {barWidth, height} = this.props;
        const {subLayerData, overlayData} = this.state;

        const barCenter = barWidth / 2;
        return [
            new deck.SolidPolygonLayer(this.getSubLayerProps({
                id: `stacked`,
                data: subLayerData,
                pickable: false,
                autoHighlight: false,
                getPolygon: d => {
                    const {x, ratio, yStart} = d;
                    const h = height * ratio;
                    const y0 = height * yStart;
                    return [
                        [x - barCenter, -y0],
                        [x + barCenter, -y0],
                        [x + barCenter, -y0 - h],
                        [x - barCenter, -y0 - h]
                    ];
                },
                getFillColor: d => d.color,
            })),

            new deck.SolidPolygonLayer(this.getSubLayerProps({
                id: `overlay`,
                data: overlayData,
                getPolygon: d => [
                    [d.x - barCenter, 0],
                    [d.x + barCenter, 0],
                    [d.x + barCenter, -height],
                    [d.x - barCenter, -height]
                ],
                getFillColor: [0, 0, 0, 0],
                pickable: true,
                autoHighlight: true
            }))
        ];
    }

    filterSubLayer({viewport}) {
        return viewport.id.includes(this.props.id);
    }
}

HistogramLayer.layerName = 'HistogramLayer';

HistogramLayer.defaultProps = {
    barWidth: 0.9,
    height: 1,
    getSegments: {type: 'accessor', value: d => d.segments}
};