class TimeInput {
    constructor(inputElement) {
        if (typeof inputElement === "string") {
            this.input = document.getElementById(inputElement);
        } else if (inputElement instanceof HTMLElement) {
            this.input = inputElement;
        } else {
            throw new Error("input must be an HTMLElement or a input ID.");
        }

        this.maxValues = [Infinity, 999, 999, 999];
        this.currentSegment = 0;
        this.segments = [[0,1], [0,0], [0,0], [0,0]];

        this.formatInput();
        this.selectSegment(0);
        this.addEventListeners();
    }

    formatInput(ss='0', ms='000', us='000', ns='000') {
        this.input.value = `${ss}:${ms}:${us}:${ns}`;
        this.updateSegments();
    }

    updateSegments() {
        const parts = this.input.value.split(':');
        let pos = 0;
        this.segments[0] = [0, parts[0].length];
        pos = parts[0].length + 1;
        this.segments[1] = [pos, pos + 3];
        pos += 4;
        this.segments[2] = [pos, pos + 3];
        pos += 4;
        this.segments[3] = [pos, pos + 3];
    }

    selectSegment(index) {
        this.currentSegment = index;
        const [start,end] = this.segments[index];
        this.input.setSelectionRange(start,end);
    }

    addEventListeners() {
        this.input.addEventListener("click", (e) => {
        const pos = this.input.selectionStart;
        for (let i=0; i<this.segments.length; i++) {
            const [start,end] = this.segments[i];
            if(pos>=start && pos<=end){
                this.selectSegment(i);
                break;
            }
        }
        });

        this.input.addEventListener("keydown", (e) => {
            e.preventDefault();
            const [start,end] = this.segments[this.currentSegment];
            let segValue = this.input.value.slice(start,end);

            if(e.key >= '0' && e.key <= '9'){
                if(this.currentSegment === 0){
                    segValue = segValue==='0' ? e.key : segValue + e.key;
                } else {
                    segValue = (segValue + e.key).slice(-(end-start));
                let num = parseInt(segValue);
                if(num > this.maxValues[this.currentSegment]) num = this.maxValues[this.currentSegment];
                    segValue = num.toString().padStart(end-start,'0');
                }
                this.input.value = this.input.value.slice(0,start) + segValue + this.input.value.slice(end);
                this.updateSegments();
                this.selectSegment(this.currentSegment);

            } else if(e.key === 'Backspace' || e.key === 'Delete'){
                let chars = segValue.split('');
                if(this.currentSegment===0){
                    segValue = chars.slice(1).join('') || '0';
                } else {
                    chars.pop();
                    chars.unshift('0');
                    segValue = chars.join('');
                }
                this.input.value = this.input.value.slice(0,start) + segValue + this.input.value.slice(end);
                this.updateSegments();
                this.selectSegment(this.currentSegment);

            } else if(e.key === 'ArrowLeft'){
                if(this.currentSegment > 0) this.selectSegment(this.currentSegment - 1);
            } else if(e.key === 'ArrowRight' || e.key === ':' || e.key === 'Enter'){
                if(this.currentSegment < this.segments.length-1) this.selectSegment(this.currentSegment + 1);
            }
        });
    }

    getValue() {
        const parts = this.input.value.split(':');
        const ss = parseInt(parts[0]) || 0;
        const ms = parseInt(parts[1]) || 0;
        const us = parseInt(parts[2]) || 0;
        const ns = parseInt(parts[3]) || 0;
        return {ss, ms, us, ns};
    }
}