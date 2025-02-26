export function getDomainNameFromId(domainIDs, traceDomain) {
    return domainIDs[traceDomain]?.name.replace("RATELPROF_", "").replaceAll("_", " ") || "Unknown Domain";
}

export function getDomainDescFromId(domainIDs, traceDomain) {
    return domainIDs[traceDomain]?.desc || "Unknown Domain";
}

export function hashStringToLightColor(str) {
    // Simple hash function to generate a color
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert hash to a light hexadecimal color
    let color = "#";
    for (let i = 0; i < 3; i++) {
        const value = ((hash >> (i * 8)) & 0xFF); // Extract 8 bits
        const lightValue = Math.floor((value / 2) + 127); // Ensure the value is in the light range (127–255)
        color += ("00" + lightValue.toString(16)).slice(-2);
    }
    
    return color;
}


// TODO REVOIR L'ALGO DE PRINT
export function prettyPrint(obj, indentLevel = 0) {
    let html = '';
  const indentClass = 'indent'.repeat(indentLevel);

  for (const key in obj) {
    const field = obj[key];
    if (typeof field === 'object' && field !== null) {
      if (field.type && field.value) {
        html += `<div class="${indentClass}"><span class="type">${field.type}</span> <span class="key">${key}</span> =  `;
        if (field.value["->*"]) {
          const keys = Object.keys(field.value);
          keys.forEach((subfield, index) => {
            if (index < keys.length - 1) {
              html += `<span class="value">${field.value[subfield]}</span> -> `;
            } else {
              html += prettyPrint(field.value[subfield], indentLevel + 1);
            }
          });
          html += `</div>`;
        } else if (typeof field.value === 'object') {
          html += `{<div class="indent">`;
          html += prettyPrint(field.value, indentLevel + 1); 
          html += `</div>}</div>`;
        } else {
          html += `<span class="value">${field.value}</span></div>`;
        }
      } else {
        html += `<div class="${indentClass}"><span class="key">${key}</span> = {<div class="indent">`;
        html += prettyPrint(field, indentLevel + 1); // Recurse for other nested objects
        html += `</div>}</div>`;
      }
    }
  }
  return html;
}