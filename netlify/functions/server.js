const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { google } = require('googleapis');

const app = express();

// Middleware de seguridad
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de 100 requests por ventana por IP
});
app.use('/api/', limiter);

// Configuración de Google Sheets
const SPREADSHEET_ID = '1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0';

// Función para formatear fechas desde Google Sheets (DD/MM/YYYY -> formato legible)
function formatDate(dateString) {
  if (!dateString || dateString.trim() === '') return 'No especificada';
  
  try {
    // Si viene en formato DD/MM/YYYY (como "08/01/2020")
    if (dateString.includes('/')) {
      const [day, month, year] = dateString.split('/');
      const date = new Date(year, month - 1, day); // month - 1 porque los meses van de 0-11
      
      if (isNaN(date.getTime())) {
        return dateString; // Si no se puede parsear, devolver original
      }
      
      // Formatear como "8 de enero de 2020"
      const months = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      
      return `${parseInt(day)} de ${months[date.getMonth()]} de ${year}`;
    }
    
    // Si viene en otro formato, intentar parsearlo directamente
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Si no se puede parsear, devolver original
    }
    
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formateando fecha:', error);
    return dateString; // En caso de error, devolver la fecha original
  }
}

// Función para parsear CSV
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      // Parseo simple de CSV - maneja comillas básicas
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      result.push(values);
    }
  }
  
  return result;
}

// Función para procesar datos de una hoja específica
function processSheetData(values, tipoGrado) {
  if (!values || values.length === 0) {
    return [];
  }

  // Buscar la fila que contiene los encabezados reales
  let headerRowIndex = -1;
  let headers = [];
  
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    const row = values[i];
    if (row && row.some(cell => cell && (cell.toString().includes('NUMERO DE DOCUMENTO') || 
                                         cell.toString().includes('TÉCNICOS LABORAL NÚMERO') ||
                                         cell.toString().includes('BACHILLERES NUMERO DE D')))) {
      headerRowIndex = i;
      headers = row.map(cell => cell ? cell.toString().trim() : '');
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    return [];
  }
  
  // Procesar las filas de datos
  const dataRows = values.slice(headerRowIndex + 1);
  const processedData = [];
  
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    
    const rowData = {};
    headers.forEach((header, index) => {
      if (header) {
        rowData[header] = row[index] ? row[index].toString().trim() : '';
      }
    });
    
    // Buscar el número de documento en las diferentes columnas posibles
    const numeroDocumento = rowData['NUMERO DE DOCUMENTO'] || 
                           rowData['TÉCNICOS LABORAL NÚMERO'] || 
                           rowData['BACHILLERES NUMERO DE D'] ||
                           rowData['BACHILLERES NUMERO DE DOCUMENTO'] ||
                           rowData['NUMERO DE CEDULA'] ||
                           rowData['CEDULA'] ||
                           '';
    
    if (numeroDocumento && numeroDocumento.trim() !== '' && numeroDocumento.length >= 5) {
      // Normalizar el número de documento (solo números)
      const numeroLimpio = numeroDocumento.toString().replace(/[^0-9]/g, '');
      if (numeroLimpio.length >= 5) {
        rowData['NUMERO DE DOCUMENTO'] = numeroLimpio; // Normalizar la clave
        rowData['Tipo_Grado'] = tipoGrado;
        processedData.push(rowData);
      }
    }
  }
  
  return processedData;
}

// Función para leer datos de Google Sheets con múltiples estrategias de fallback
async function readGoogleSheetsData() {
  try {
    console.log('Iniciando lectura de datos de Google Sheets...');
    
    // Estrategia 1: URLs gviz/tq
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1426995834`;
    const gvizBachilleresUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
    
    // Estrategia 2: URLs export (fallback)
    const exportTecnicosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1426995834`;
    const exportBachilleresUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=0`;
    
    let tecnicosData = [];
    let bachilleresData = [];
    
    // Intentar estrategia 1: gviz/tq
    try {
      console.log('Intentando estrategia 1: gviz/tq URLs');
      const [tecnicosResponse, bachilleresResponse] = await Promise.all([
        fetch(gvizTecnicosUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)'
          }
        }).then(response => {
          console.log('Respuesta técnicos gviz status:', response.status);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        }),
        fetch(gvizBachilleresUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)'
          }
        }).then(response => {
          console.log('Respuesta bachilleres gviz status:', response.status);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })
      ]);
      
      console.log('Datos técnicos gviz recibidos, tamaño:', tecnicosResponse.length);
      console.log('Datos bachilleres gviz recibidos, tamaño:', bachilleresResponse.length);
      
      if (tecnicosResponse.length > 100 && bachilleresResponse.length > 100) {
        const tecnicosValues = parseCSV(tecnicosResponse);
        const bachilleresValues = parseCSV(bachilleresResponse);
        
        tecnicosData = processSheetData(tecnicosValues, 'Técnico');
        bachilleresData = processSheetData(bachilleresValues, 'Bachiller');
        
        console.log('Estrategia 1 exitosa - Técnicos:', tecnicosData.length, 'Bachilleres:', bachilleresData.length);
      } else {
        throw new Error('Datos insuficientes en estrategia 1');
      }
    } catch (gvizError) {
      console.log('Estrategia 1 falló:', gvizError.message);
      
      // Intentar estrategia 2: export URLs
      try {
        console.log('Intentando estrategia 2: export URLs');
        const [tecnicosResponse, bachilleresResponse] = await Promise.all([
          fetch(exportTecnicosUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)'
            }
          }).then(response => {
            console.log('Respuesta técnicos export status:', response.status);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
          }),
          fetch(exportBachilleresUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)'
            }
          }).then(response => {
            console.log('Respuesta bachilleres export status:', response.status);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
          })
        ]);
        
        console.log('Datos técnicos export recibidos, tamaño:', tecnicosResponse.length);
        console.log('Datos bachilleres export recibidos, tamaño:', bachilleresResponse.length);
        
        const tecnicosValues = parseCSV(tecnicosResponse);
        const bachilleresValues = parseCSV(bachilleresResponse);
        
        tecnicosData = processSheetData(tecnicosValues, 'Técnico');
        bachilleresData = processSheetData(bachilleresValues, 'Bachiller');
        
        console.log('Estrategia 2 exitosa - Técnicos:', tecnicosData.length, 'Bachilleres:', bachilleresData.length);
      } catch (exportError) {
        console.error('Ambas estrategias fallaron:', { gvizError: gvizError.message, exportError: exportError.message });
        throw new Error('No se pudieron obtener datos de Google Sheets con ninguna estrategia');
      }
    }
    
    const totalData = [...tecnicosData, ...bachilleresData];
    console.log('Total de registros combinados:', totalData.length);
    
    if (totalData.length === 0) {
      throw new Error('No se encontraron registros válidos en Google Sheets');
    }
    
    return totalData;
    
  } catch (error) {
    console.error('Error crítico leyendo Google Sheets:', error);
    throw error;
  }
}

// Ruta para verificar diploma
app.get('/api/verify-diploma', async (req, res) => {
  try {
    const cedula = req.query.id || req.query.cedula;
    
    if (!cedula || cedula.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El número de cédula es requerido'
      });
    }
    
    const diplomasData = await readGoogleSheetsData();
    
    const diploma = diplomasData.find(row => {
      const identificacion = row['NUMERO DE DOCUMENTO'] || row['Numero de Documento'] || 
                            row['Cédula'] || row['Cedula'] || row['Identificación'] || 
                            row['Identificacion'] || row['ID'] || row['Numero de Identificacion'] ||
                            row['Número de Identificación'] || row['CEDULA'] || row['cedula'] || '';
      
      return identificacion && identificacion.toString().trim() === cedula.trim();
    });

    if (!diploma) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró ningún diploma registrado para esta cédula'
      });
    }

    res.json({
      success: true,
      message: 'Diploma encontrado exitosamente',
      data: {
        estudiante: {
          cedula: diploma['NUMERO DE DOCUMENTO'] || diploma['Numero de Documento'] || diploma['Cédula'] || diploma['Cedula'],
          nombres: diploma['NOMBRES Y APELLIDOS'] || diploma['Nombres y Apellidos'] || diploma['Nombres'] || diploma['Nombre'],
          apellidos: '',
          email: diploma['Email'] || diploma['Correo'] || diploma['Correo Electrónico'],
          telefono: diploma['Número Celular'] || diploma['Numero Celular'] || diploma['Teléfono'] || diploma['Telefono']
        },
        diploma: {
          titulo: diploma['Tipo_Grado'] || 'No especificado',
          programa_academico: diploma['ALIADO'] || diploma['Tipo_Grado'] || 'Programa Técnico',
          fecha_graduacion: diploma['FECHA DE GRADO'] ? formatDate(diploma['FECHA DE GRADO']) : 'No especificada',
          numero_diploma: diploma['NUMERO DE DIPLOMA'] || 'No especificado',
          codigo_verificacion: diploma['NUMERO DE DIPLOMA'] || 'No especificado',
          grado_academico: diploma['Tipo_Grado'] || 'No especificado',
          modalidad: diploma['ALIADO'] ? diploma['ALIADO'] : 'Presencial',
          fecha_emision: diploma['FECHA DE EMISIÓN'] || 'No especificada'
        },
        institucion: {
          nombre: 'Inandina',
          ciudad: 'Villavicencio',
          pais: 'Colombia'
        }
      }
    });
    
  } catch (error) {
    console.error('Error en verificación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Endpoint para obtener estadísticas del sistema - Valores fijos según solicitud del usuario
app.get('/api/statistics', async (req, res) => {
  try {
    // Valores fijos: 751 bachilleres + 2048 técnicos = 2799, redondeado a 2794 según solicitud
    res.json({
      success: true,
      message: 'Estadísticas del sistema obtenidas exitosamente',
      data: {
        diplomas_registrados: 2794,
        estudiantes: 2794, // Cada diploma representa un estudiante
        instituciones: 1 // Solo INANDINA
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas del sistema',
      error: error.message
    });
  }
});

// Endpoint de debug temporal para inspeccionar datos
app.get('/api/debug', async (req, res) => {
  try {
    const diplomasData = await readGoogleSheetsData();
    
    const sampleData = diplomasData.slice(0, 3);
    const availableColumns = diplomasData.length > 0 ? Object.keys(diplomasData[0]) : [];
    
    // Separar por tipo de grado para debug
    const tecnicos = diplomasData.filter(d => d.Tipo_Grado === 'Técnico');
    const bachilleres = diplomasData.filter(d => d.Tipo_Grado === 'Bachiller');
    
    res.json({
      success: true,
      message: 'Debug data from Google Sheets',
      total_records: diplomasData.length,
      tecnicos_count: tecnicos.length,
      bachilleres_count: bachilleres.length,
      sample_data: sampleData,
      available_columns: availableColumns,
      sample_tecnicos: tecnicos.slice(0, 2),
      sample_bachilleres: bachilleres.slice(0, 2)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error en debug',
      error: error.message
    });
  }
});

// Endpoint de test de URLs
app.get('/api/test-urls', async (req, res) => {
  try {
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1426995834`;
    const gvizBachilleresUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
    
    const [tecnicosResponse, bachilleresResponse] = await Promise.all([
      fetch(gvizTecnicosUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)'
        }
      }).then(response => response.text()),
      fetch(gvizBachilleresUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)'
        }
      }).then(response => response.text())
    ]);
    
    res.json({
      success: true,
      message: 'Test de URLs completado',
      tecnicos: {
        url: gvizTecnicosUrl,
        data_length: tecnicosResponse.length,
        first_100_chars: tecnicosResponse.substring(0, 100)
      },
      bachilleres: {
        url: gvizBachilleresUrl,
        data_length: bachilleresResponse.length,
        first_100_chars: bachilleresResponse.substring(0, 100)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error en test de URLs',
      error: error.message
    });
  }
});

// Endpoint específico para probar solo técnicos
app.get('/api/test-tecnicos', async (req, res) => {
  try {
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1426995834`;
    
    const tecnicosResponse = await fetch(gvizTecnicosUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)'
      }
    }).then(response => response.text());
    
    console.log('Datos técnicos recibidos, tamaño:', tecnicosResponse.length);
    
    // Procesar los datos
    const tecnicosValues = parseCSV(tecnicosResponse);
    const tecnicosData = processSheetData(tecnicosValues, 'Técnico');
    
    // Buscar la cédula específica
    const cedulaBuscada = '1123114905';
    const encontrado = tecnicosData.find(row => {
      const identificacion = row['NUMERO DE DOCUMENTO'] || '';
      return identificacion.toString().trim() === cedulaBuscada;
    });
    
    res.json({
      success: true,
      message: 'Test de técnicos completado',
      raw_data_length: tecnicosResponse.length,
      parsed_rows: tecnicosValues.length,
      processed_records: tecnicosData.length,
      cedula_1123114905_found: !!encontrado,
      found_record: encontrado || null,
      sample_records: tecnicosData.slice(0, 3),
      available_columns: tecnicosData.length > 0 ? Object.keys(tecnicosData[0]) : []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error en test de técnicos',
      error: error.message
    });
  }
});

// Endpoint de búsqueda directa que busca en ambas hojas por separado
app.get('/api/search-direct', async (req, res) => {
  try {
    const cedula = req.query.id || req.query.cedula;
    
    if (!cedula || cedula.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El número de cédula es requerido'
      });
    }
    
    const cedulaNormalizada = cedula.toString().replace(/[^0-9]/g, '').trim();
    
    // URLs de ambas hojas
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=1426995834`;
    const gvizBachilleresUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
    
    console.log('Búsqueda directa para cédula:', cedulaNormalizada);
    
    // Buscar en técnicos
    let diploma = null;
    let tipoEncontrado = null;
    
    try {
      const tecnicosResponse = await fetch(gvizTecnicosUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)' }
      }).then(response => response.text());
      
      const tecnicosValues = parseCSV(tecnicosResponse);
      const tecnicosData = processSheetData(tecnicosValues, 'Técnico');
      
      diploma = tecnicosData.find(row => {
        const identificacion = row['TÉCNICOS LABORAL NÚMERO'] || row['NUMERO DE DOCUMENTO'] || '';
        const idNormalizada = identificacion.toString().replace(/[^0-9]/g, '').trim();
        return idNormalizada === cedulaNormalizada;
      });
      
      if (diploma) {
        tipoEncontrado = 'Técnicos';
        console.log('Diploma encontrado en técnicos');
      }
    } catch (error) {
      console.log('Error buscando en técnicos:', error.message);
    }
    
    // Si no se encontró en técnicos, buscar en bachilleres
    if (!diploma) {
      try {
        const bachilleresResponse = await fetch(gvizBachilleresUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)' }
        }).then(response => response.text());
        
        const bachilleresValues = parseCSV(bachilleresResponse);
        const bachilleresData = processSheetData(bachilleresValues, 'Bachiller');
        
        diploma = bachilleresData.find(row => {
          const identificacion = row['BACHILLERES NUMERO DE D'] || row['NUMERO DE DOCUMENTO'] || '';
          const idNormalizada = identificacion.toString().replace(/[^0-9]/g, '').trim();
          return idNormalizada === cedulaNormalizada;
        });
        
        if (diploma) {
          tipoEncontrado = 'Bachilleres';
          console.log('Diploma encontrado en bachilleres');
        }
      } catch (error) {
        console.log('Error buscando en bachilleres:', error.message);
      }
    }
    
    if (!diploma) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró ningún diploma registrado para esta cédula'
      });
    }
    
    // Formatear respuesta
    const fechaGraduacion = formatDate(diploma['FECHA DE GRADO'] || '');
    const numeroDiploma = diploma['NUMERO DE DIPLOMA'] || 'No disponible';
    
    res.json({
      success: true,
      message: 'Diploma encontrado exitosamente',
      found_in: tipoEncontrado,
      data: {
        nombre_completo: diploma['NOMBRES Y APELLIDOS'] || 'No disponible',
        numero_documento: diploma['TÉCNICOS LABORAL NÚMERO'] || diploma['BACHILLERES NUMERO DE D'] || diploma['NUMERO DE DOCUMENTO'],
        fecha_graduacion: fechaGraduacion,
        codigo_verificacion: numeroDiploma,
        tipo_grado: diploma['Tipo_Grado'] || 'No disponible',
        institucion: 'Inandina',
        ciudad: 'Villavicencio'
      }
    });
    
  } catch (error) {
    console.error('Error en búsqueda directa:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor en búsqueda directa',
      error: error.message
    });
  }
});

// Endpoint para debug detallado de encabezados CSV
app.get('/api/debug-headers', async (req, res) => {
  try {
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=1426995834`;
    const gvizBachilleresUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=0`;
    
    // Fetch técnicos data
    const tecnicosResponse = await fetch(gvizTecnicosUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)' }
    }).then(response => response.text());
    
    const tecnicosLines = tecnicosResponse.split('\n');
    const tecnicosFirst10Lines = tecnicosLines.slice(0, 10).map((line, index) => ({
      line_number: index,
      content: line,
      parsed_cells: parseCSV(line + '\n')[0] || []
    }));
    
    // Fetch bachilleres data
    const bachilleresResponse = await fetch(gvizBachilleresUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)' }
    }).then(response => response.text());
    
    const bachilleresLines = bachilleresResponse.split('\n');
    const bachilleresFirst10Lines = bachilleresLines.slice(0, 10).map((line, index) => ({
      line_number: index,
      content: line,
      parsed_cells: parseCSV(line + '\n')[0] || []
    }));
    
    res.json({
      success: true,
      message: 'Debug de encabezados CSV',
      tecnicos: {
        total_lines: tecnicosLines.length,
        first_10_lines: tecnicosFirst10Lines
      },
      bachilleres: {
        total_lines: bachilleresLines.length,
        first_10_lines: bachilleresFirst10Lines
      }
    });
    
  } catch (error) {
    console.error('Error en debug de encabezados:', error);
    res.status(500).json({
      success: false,
      message: 'Error en debug de encabezados',
      error: error.message
    });
  }
});

// Ruta de estadísticas
app.get('/api/stats', async (req, res) => {
  try {
    const diplomasData = await readGoogleSheetsData();
    
    res.json({
      success: true,
      stats: {
        total_diplomas: diplomasData.length,
        por_tipo: {
          tecnicos: diplomasData.filter(d => d.Tipo_Grado === 'Técnico').length,
          bachilleres: diplomasData.filter(d => d.Tipo_Grado === 'Bachiller').length
        },
        ultima_actualizacion: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports.handler = serverless(app);
