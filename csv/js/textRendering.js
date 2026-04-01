function renderAdvice(container, data) {
    container.innerHTML = `
        <div class="advice">
            <div>
                <h3>Description</h3>
                <p>${data.desc}</p>
            </div>
            <div style="border-left: 1px solid var(--border-color); padding-left: 30px;">
                <h3>Suggestion</h3>
                <p>${data.advice}</p>
            </div>
        </div>
    `;
}