class ControllerGL extends deck.OrthographicController {
    handleEvent(event) {
        if (event.type === 'keydown') {
            const viewState = this.props;
            let x = viewState.target[0];
            let zoom = viewState.zoom[0];
            
            const scaleMultiplier = Math.pow(2, -zoom);
            const baseStep = 50; 
            const moveStep = baseStep * scaleMultiplier;

            switch (event.key) {
                // Moving
                case 'ArrowLeft':
                case 'a':
                case 'q': x -= moveStep; break;
                case 'ArrowRight':
                case 'd': x += moveStep; break;
                default: return; 
            }

            viewState.target[0] = x;
            viewState.zoom[0] = zoom;

            this.onViewStateChange({ viewState, viewId:viewState.id });
            return;
        } else if (event.type === 'wheel') {
            const srcEvent = event.srcEvent;
            if (srcEvent && srcEvent.ctrlKey) {
                super.handleEvent(event);
                return;
            }
        } else if (event.type === 'dblclick') {
            return;
        } else {
            super.handleEvent(event);
        }
    }
}