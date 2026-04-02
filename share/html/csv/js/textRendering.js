function renderAdvice(container, data) {
    container.innerHTML = `
        <div class="scroll-container">
            <div class="advice">
                <div>
                    <h3>Suggestion</h3>
                    <p>${data.advice}</p>
                </div>
                <div>
                    <h3>Description</h3>
                    <p>${data.desc}</p>
                </div>
            </div>
        </div>
    `;
}