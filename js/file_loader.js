import { createTimeline } from './timeline.js';

async function loadTraceDataFromFile(file) {
    try {
        console.log("Loading JSON...");
        const fileContent = await file.text();
        const data = JSON.parse(fileContent);
        console.log("Finished.");

        console.log("Timeline Creation...");
        const timeline = createTimeline(data);
        console.log("Finished.");

        return timeline;
    } catch (error) {
        alert('Error loading trace data: ' + error.message);
        console.error('Error loading trace data:', error);
        return null;
    }
}

export function setupFileLoader() {
    const loadFileButton = document.getElementById('loadFileButton');
    const fileInput = document.getElementById('fileInput');

    if (!loadFileButton || !fileInput) {
        console.error('File loader elements not found in the DOM.');
        return;
    }

    let timeline = null;

    // Attach event listener to button for file input trigger
    loadFileButton.addEventListener('click', () => fileInput.click());

    // Handle file selection
    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            if (timeline) {
                timeline.destroy();
            }
            timeline = await loadTraceDataFromFile(file);
        }

        // Clear the file input for subsequent uploads
        fileInput.value = '';
    });
}