// HistogramLayer.js
class HistogramLayer extends deck.CompositeLayer {
    updateState({props,  changeFlags}) {
        if (changeFlags.dataChanged) {
            const subLayerData = [];

            props.data.forEach((d, index) => {
                const segments = props.getSegments(d);
                const x = index;

                segments.forEach(segment => {
                    // decorate each segment with original object and index
                    subLayerData.push(this.getSubLayerRow({
                        x,
                        percent: segment.percent,
                        yStart: segment.yStart,
                        color: segment.color
                    }, d, index));
                });
            });
            this.setState({subLayerData});
        }
    }

    renderLayers() {
        const {barWidth, height} = this.props;
        const {subLayerData} = this.state;

        const barCenter = barWidth / 2;

        return [
            new deck.SolidPolygonLayer(this.getSubLayerProps({
                id: `stacked`,
                data: subLayerData,
                pickable: false,
                autoHighlight: false,
                getPolygon: d => {
                    const {x, percent, yStart} = d;
                    const h = height * percent;
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
                data: this.props.data,
                getPolygon: (d, {index}) => [
                    [index - barCenter, 0],
                    [index + barCenter, 0],
                    [index + barCenter, -height],
                    [index - barCenter, -height]
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