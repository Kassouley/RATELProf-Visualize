class SelectInput {
    constructor(container, defaultselect, onSelect) {
        if (typeof container === "string") {
            this.container = document.getElementById(container);
        } else if (container instanceof HTMLElement) {
            this.container = container;
        } else {
            throw new Error("container must be an HTMLElement or a container ID.");
        }

        this.options = [];
        this.onSelect = onSelect;
        this.defaultselect = defaultselect;

        this.input = document.createElement('input');
        this.dropdown = document.createElement('div');
        this.dropdown.className = "dropdown";
        this.container.appendChild(this.input);
        this.container.appendChild(this.dropdown);

        // Show ALL options on focus
        this.input.addEventListener('focus', () => {
            this.render(this.options);
            this.dropdown.style.display = 'block';
        });

        // Filter while typing
        this.input.addEventListener('input', () => {
            const value = this.input.value.toLowerCase();
            const filtered = this.options.filter(o =>
                o.toLowerCase().includes(value)
            );
            this.render(filtered);
            this.dropdown.style.display = 'block';
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.dropdown.style.display = 'none';
            }
        });
    }

    addOption(option) {
        this.options.push(option);

        if (this.defaultselect !== null 
                && this.options.length - 1 === this.defaultselect) {
            this.input.value = option;
            if (this.onSelect) this.onSelect(option, this.defaultselect);
        }
    }

    triggerSelect() {
        const currentValue = this.input.value;
        const index = this.options.indexOf(currentValue);
        if (this.options.includes(currentValue)) {
            if (this.onSelect) this.onSelect(currentValue, index);
        } else {
            console.warn('Current value does not match any option.');
        }
    }

    render(list) {
        this.dropdown.innerHTML = '';
        list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'option';
            div.textContent = item;

            div.onclick = () => {
                this.input.value = item;
                this.dropdown.style.display = 'none';
                const index = this.options.indexOf(item);
                if (this.onSelect) this.onSelect(item, index);
            };

            this.dropdown.appendChild(div);
        });
    }
}