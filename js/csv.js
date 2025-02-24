// Function to display CSV content in a table
function displayCSV(csvObject) {
    let html = "<table>";
    const rows = csvObject.data.trim().split("\n");

    rows.forEach((row, index) => {
        const cols = row.split(",");
        html += index === 0 
            ? "<tr><th>" + cols.join("</th><th>") + "</th></tr>" 
            : "<tr><td>" + cols.join("</td><td>") + "</td></tr>";
    });

    html += "</table>";
    return html;
}

// Function to create the list of CSV names
function createCSVList() {
    const listContainer = document.getElementById("csvList");
    csv_stats.forEach((csv, index) => {
        const li = document.createElement("li");
        li.textContent = csv.name;
        li.addEventListener("click", () => showCSVContent(index));
        listContainer.appendChild(li);
    });
}

// Function to show the selected CSV content
function showCSVContent(index) {
    const contentContainer = document.getElementById("csvContent");
    contentContainer.innerHTML = displayCSV(csv_stats[index]);
}

// Initialize the CSV list and set default content
createCSVList();