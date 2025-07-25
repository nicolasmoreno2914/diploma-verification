// Script de prueba para verificar la corrección del parser de técnicos
const https = require('https');

// URLs de Google Sheets
const TECNICOS_URL = 'https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=1426995834';

// Función para parsear línea CSV
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

// Función de búsqueda directa mejorada
function searchDirectInCSV(csvText, targetId, tipo) {
    console.log(`\n=== BUSCANDO ${targetId} EN ${tipo} ===`);
    const lines = csvText.split('\n');
    const normalizedTarget = targetId.toString().replace(/[^0-9]/g, '');
    
    console.log(`Total de líneas: ${lines.length}`);
    console.log(`Cédula normalizada: ${normalizedTarget}`);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(normalizedTarget)) {
            console.log(`\n¡ENCONTRADO EN LÍNEA ${i + 1}!`);
            console.log(`Línea completa: ${line}`);
            
            const cells = parseCSVLine(line);
            console.log(`Columnas parseadas: ${cells.length}`);
            
            let documentColumn = -1;
            let nameColumn = -1;
            let dateColumn = -1;
            let diplomaColumn = -1;
            
            // Buscar la columna que contiene el documento
            for (let j = 0; j < cells.length; j++) {
                const cell = cells[j].toString().replace(/[^0-9]/g, '');
                if (cell === normalizedTarget) {
                    documentColumn = j;
                    console.log(`Documento encontrado en columna ${j}: "${cells[j]}"`);
                    
                    if (tipo === 'Técnico') {
                        // Para técnicos: nombre está antes, fecha después, diploma más adelante
                        nameColumn = Math.max(0, j - 1);
                        dateColumn = j + 1;
                        diplomaColumn = j + 3;
                    } else {
                        // Para bachilleres: posiciones fijas
                        nameColumn = 1;
                        dateColumn = 3;
                        diplomaColumn = 5;
                    }
                    break;
                }
            }
            
            if (documentColumn >= 0) {
                console.log(`\nMAPEO DE COLUMNAS:`);
                console.log(`- Documento (col ${documentColumn}): "${cells[documentColumn] || 'N/A'}"`);
                console.log(`- Nombre (col ${nameColumn}): "${cells[nameColumn] || 'N/A'}"`);
                console.log(`- Fecha (col ${dateColumn}): "${cells[dateColumn] || 'N/A'}"`);
                console.log(`- Diploma (col ${diplomaColumn}): "${cells[diplomaColumn] || 'N/A'}"`);
                
                const rowData = {
                    numero_documento: cells[documentColumn] ? cells[documentColumn].toString().trim() : normalizedTarget,
                    nombre_completo: cells[nameColumn] ? cells[nameColumn].toString().trim() : 'N/A',
                    fecha_graduacion: cells[dateColumn] ? cells[dateColumn].toString().trim() : 'N/A',
                    numero_diploma: cells[diplomaColumn] ? cells[diplomaColumn].toString().trim() : 'N/A',
                    tipo_programa: tipo,
                    institucion: 'Inandina',
                    ciudad: 'Villavicencio'
                };
                
                console.log(`\nRESULTADO FINAL:`);
                console.log(JSON.stringify(rowData, null, 2));
                return rowData;
            }
        }
    }
    
    console.log(`\nNo se encontró la cédula ${targetId} en ${tipo}`);
    return null;
}

// Función para descargar CSV
function downloadCSV(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// Función principal de prueba
async function testSearch() {
    try {
        console.log('Descargando datos de técnicos...');
        const tecnicosCSV = await downloadCSV(TECNICOS_URL);
        
        console.log(`CSV descargado: ${tecnicosCSV.length} caracteres`);
        console.log(`Primeras 500 caracteres:\n${tecnicosCSV.substring(0, 500)}`);
        
        // Probar la cédula problemática
        const result = searchDirectInCSV(tecnicosCSV, '1123114905', 'Técnico');
        
        if (result) {
            console.log('\n✅ ¡ÉXITO! La cédula fue encontrada correctamente.');
        } else {
            console.log('\n❌ ERROR: La cédula no fue encontrada.');
        }
        
    } catch (error) {
        console.error('Error en la prueba:', error);
    }
}

testSearch();
