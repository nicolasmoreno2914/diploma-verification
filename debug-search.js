// Script de debug para probar la búsqueda en CSV de técnicos

async function testSearch() {
    const targetId = '1123114905';
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=1426995834`;
    
    try {
        console.log('Descargando datos de técnicos...');
        const response = await fetch(gvizTecnicosUrl);
        const csvText = await response.text();
        
        console.log('Tamaño del CSV:', csvText.length);
        console.log('Primeras 500 caracteres:', csvText.substring(0, 500));
        
        // Buscar la cédula específica
        const lines = csvText.split('\n');
        console.log('Total de líneas:', lines.length);
        
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(targetId)) {
                console.log(`¡Encontrado en línea ${i}:`, line);
                found = true;
                
                // Parsear la línea
                const cells = parseCSVLine(line);
                console.log('Celdas parseadas:', cells);
                
                // Mapeo de datos
                const rowData = {
                    celular: cells[0] ? cells[0].toString().trim() : '',
                    nombre_completo: cells[1] ? cells[1].toString().trim() : '',
                    numero_documento: cells[2] ? cells[2].toString().trim() : '',
                    fecha_graduacion: cells[3] ? cells[3].toString().trim() : '',
                    numero_acta: cells[4] ? cells[4].toString().trim() : '',
                    numero_diploma: cells[5] ? cells[5].toString().trim() : ''
                };
                
                console.log('Datos extraídos:', rowData);
                break;
            }
        }
        
        if (!found) {
            console.log('❌ No se encontró la cédula', targetId);
            
            // Buscar cédulas similares
            console.log('Buscando cédulas similares...');
            for (let i = 0; i < Math.min(lines.length, 50); i++) {
                const line = lines[i];
                if (line.includes('112311') || line.includes('1123114')) {
                    console.log(`Línea ${i} (similar):`, line.substring(0, 200));
                }
            }
        }
        
    } catch (error) {
        console.error('Error:', error);
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Ejecutar la prueba
testSearch();
