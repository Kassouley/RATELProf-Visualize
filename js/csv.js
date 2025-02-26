
let currentSortColumn = null;
let isAscending = true; // true = ascending, false = descending

function displayCSV(csvObject) {
    let html = "<table id='csvTable'><thead><tr>";
    const rows = csvObject.data.trim().split("\n");
    const headerCols = rows[0].split(",");

    // Table headers with click event
    headerCols.forEach((col, index) => {
        html += `<th onclick="sortTable(${index})">${col} <span class="sort-arrow" id="arrow-${index}">⭥</span></th>`;
    });

    html += "</tr></thead><tbody>";

    // Table rows
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].split(",");
        html += "<tr><td>" + cols.join("</td><td>") + "</td></tr>";
    }

    html += "</tbody></table>";
    return html;
}

function sortTable(columnIndex) {
    const table = document.getElementById("csvTable");
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    // Toggle sorting direction if same column, otherwise reset to ascending
    if (currentSortColumn === columnIndex) {
        isAscending = !isAscending;
    } else {
        currentSortColumn = columnIndex;
        isAscending = true;
    }

    // Sorting function
    rows.sort((rowA, rowB) => {
        const cellA = rowA.children[columnIndex].textContent.trim();
        const cellB = rowB.children[columnIndex].textContent.trim();

        const numA = parseFloat(cellA);
        const numB = parseFloat(cellB);

        if (!isNaN(numA) && !isNaN(numB)) {
            return isAscending ? numA - numB : numB - numA;
        } else {
            return isAscending ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
        }
    });

    // Update table with sorted rows
    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));

    // Update arrow indicators
    updateSortArrows(columnIndex);
}

function updateSortArrows(activeColumn) {
    // Remove arrows from all headers
    document.querySelectorAll(".sort-arrow").forEach(arrow => arrow.textContent = "⭥");

    // Set arrow for the active column
    const arrow = document.getElementById(`arrow-${activeColumn}`);
    arrow.textContent = isAscending ? "⭡" : "⭣";
}

function createCSVList() {
    const listContainer = document.getElementById("csvList");
    csv_stats.forEach((csv, index) => {
        const li = document.createElement("li");
        li.textContent = csv.name;
        li.addEventListener("click", () => showCSVContent(index));
        listContainer.appendChild(li);
    });
}

function showCSVContent(index) {
    const contentContainer = document.getElementById("csvContent");
    contentContainer.innerHTML = displayCSV(csv_stats[index]);
    currentSortColumn = null; // Reset sorting when switching files
}

createCSVList();