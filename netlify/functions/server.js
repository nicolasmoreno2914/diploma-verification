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

// Función para procesar datos de una hoja específica con detección robusta
function processSheetData(values, tipoGrado) {
  if (!values || values.length === 0) {
    return [];
  }
  
  const processedData = [];
  
  // Procesar todas las filas buscando patrones de números de documento
  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    if (!row || row.length === 0) continue;
    
    // Buscar número de documento válido en cualquier columna
    let numeroDocumento = null;
    let documentoColumnIndex = -1;
    
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const cellValue = row[colIndex] ? row[colIndex].toString().trim() : '';
      
      // Verificar si es un número de documento válido (solo números, 7-12 dígitos)
      const numeroLimpio = cellValue.replace(/[^0-9]/g, '');
      if (numeroLimpio.length >= 7 && numeroLimpio.length <= 12) {
        // Verificar que no sea una fecha u otro tipo de número
        if (!cellValue.includes('/') && !cellValue.includes('-') && 
            !cellValue.includes(':') && !cellValue.includes('.') &&
            numeroLimpio !== '0' && numeroLimpio !== '00000000') {
          numeroDocumento = numeroLimpio;
          documentoColumnIndex = colIndex;
          break;
        }
      }
    }
    
    // Si encontramos un número de documento válido, procesar la fila
    if (numeroDocumento && documentoColumnIndex !== -1) {
      const rowData = {
        'NUMERO DE DOCUMENTO': numeroDocumento,
        'Tipo_Grado': tipoGrado
      };
      
      // Mapear otras columnas importantes basándose en patrones comunes
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cellValue = row[colIndex] ? row[colIndex].toString().trim() : '';
        
        if (colIndex !== documentoColumnIndex && cellValue) {
          // Detectar nombres (contiene letras y espacios, más de 5 caracteres)
          if (/^[A-Za-zÀ-ÿ\s]+$/.test(cellValue) && cellValue.length > 5) {
            if (!rowData['NOMBRES Y APELLIDOS'] || cellValue.length > rowData['NOMBRES Y APELLIDOS'].length) {
              rowData['NOMBRES Y APELLIDOS'] = cellValue;
            }
          }
          
          // Detectar fechas (formato dd/mm/yyyy, dd-mm-yyyy, etc.)
          if (/\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.test(cellValue) || 
              /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(cellValue)) {
            rowData['FECHA DE GRADO'] = cellValue;
          }
          
          // Detectar números de diploma (números de 2-5 dígitos que no sean el documento)
          const numeroLimpio = cellValue.replace(/[^0-9]/g, '');
          if (numeroLimpio.length >= 2 && numeroLimpio.length <= 5 && 
              numeroLimpio !== numeroDocumento) {
            rowData['NUMERO DE DIPLOMA'] = cellValue;
          }
        }
      }
      
      processedData.push(rowData);
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

// Función de búsqueda directa en CSV sin procesamiento complejo
function searchDirectInCSV(csvText, targetId) {
  const lines = csvText.split('\n');
  const normalizedTarget = targetId.toString().replace(/[^0-9]/g, '');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(normalizedTarget)) {
      // Parsear la línea encontrada
      const cells = parseCSV(line + '\n')[0] || [];
      
      // Crear objeto con los datos encontrados
      const rowData = {
        'NUMERO DE DOCUMENTO': normalizedTarget,
        'NOMBRES Y APELLIDOS': '',
        'FECHA DE GRADO': '',
        'NUMERO DE DIPLOMA': ''
      };
      
      // Mapear datos de las celdas
      for (let j = 0; j < cells.length; j++) {
        const cellValue = cells[j] ? cells[j].toString().trim() : '';
        
        // Detectar nombres (letras y espacios, más de 5 caracteres)
        if (/^[A-Za-zÀ-ÿ\s]+$/.test(cellValue) && cellValue.length > 5) {
          if (!rowData['NOMBRES Y APELLIDOS'] || cellValue.length > rowData['NOMBRES Y APELLIDOS'].length) {
            rowData['NOMBRES Y APELLIDOS'] = cellValue;
          }
        }
        
        // Detectar fechas
        if (/\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.test(cellValue) || 
            /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/.test(cellValue)) {
          rowData['FECHA DE GRADO'] = cellValue;
        }
        
        // Detectar números de diploma (2-5 dígitos que no sean el documento)
        const numeroLimpio = cellValue.replace(/[^0-9]/g, '');
        if (numeroLimpio.length >= 2 && numeroLimpio.length <= 5 && 
            numeroLimpio !== normalizedTarget) {
          rowData['NUMERO DE DIPLOMA'] = cellValue;
        }
      }
      
      return rowData;
    }
  }
  
  return null;
}

// Endpoint de búsqueda directa que busca en ambas hojas por separado
app.get('/api/search-direct', async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere el parámetro id'
      });
    }
    
    const cedulaNormalizada = id.toString().replace(/[^0-9]/g, '').trim();
    
    if (cedulaNormalizada.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'El número de documento debe tener al menos 5 dígitos'
      });
    }
    
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=1426995834`;
    const gvizBachilleresUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=0`;
    
    // Buscar en técnicos usando búsqueda directa
    let diploma = null;
    let tipoEncontrado = null;
    
    try {
      const tecnicosResponse = await fetch(gvizTecnicosUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)' }
      }).then(response => response.text());
      
      diploma = searchDirectInCSV(tecnicosResponse, cedulaNormalizada);
      
      if (diploma) {
        diploma['Tipo_Grado'] = 'Técnico';
        tipoEncontrado = 'Técnicos';
        console.log('Diploma encontrado en técnicos con búsqueda directa');
      }
    } catch (error) {
      console.log('Error buscando en técnicos:', error.message);
    }
    
    // Si no se encontró en técnicos, buscar en bachilleres usando búsqueda directa
    if (!diploma) {
      try {
        const bachilleresResponse = await fetch(gvizBachilleresUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)' }
        }).then(response => response.text());
        
        diploma = searchDirectInCSV(bachilleresResponse, cedulaNormalizada);
        
        if (diploma) {
          diploma['Tipo_Grado'] = 'Bachiller';
          tipoEncontrado = 'Bachilleres';
          console.log('Diploma encontrado en bachilleres con búsqueda directa');
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

// Endpoint para análisis línea por línea de técnicos
app.get('/api/raw-tecnicos-search', async (req, res) => {
  try {
    const targetId = '1123114905';
    const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=1426995834`;
    
    const tecnicosResponse = await fetch(gvizTecnicosUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiplomaVerification/1.0)' }
    }).then(response => response.text());
    
    const lines = tecnicosResponse.split('\n');
    const foundLines = [];
    
    // Buscar la cédula en cada línea
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(targetId)) {
        const parsedLine = parseCSV(line + '\n')[0] || [];
        foundLines.push({
          line_number: i,
          raw_content: line,
          parsed_cells: parsedLine,
          cell_count: parsedLine.length
        });
      }
    }
    
    // También buscar líneas que contengan números similares
    const similarLines = [];
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const line = lines[i];
      // Buscar cualquier número de 10 dígitos que empiece con 112
      if (/112\d{7}/.test(line)) {
        const parsedLine = parseCSV(line + '\n')[0] || [];
        similarLines.push({
          line_number: i,
          raw_content: line.substring(0, 200) + (line.length > 200 ? '...' : ''),
          parsed_cells: parsedLine.slice(0, 10), // Solo primeras 10 columnas
          matches_target: line.includes(targetId)
        });
      }
    }
    
    res.json({
      success: true,
      message: `Búsqueda de cédula ${targetId} en técnicos`,
      target_id: targetId,
      total_lines: lines.length,
      exact_matches: foundLines,
      exact_match_count: foundLines.length,
      similar_patterns: similarLines,
      similar_pattern_count: similarLines.length,
      first_10_lines_sample: lines.slice(0, 10).map((line, index) => ({
        line_number: index,
        content: line.substring(0, 100) + (line.length > 100 ? '...' : '')
      }))
    });
    
  } catch (error) {
    console.error('Error en búsqueda raw de técnicos:', error);
    res.status(500).json({
      success: false,
      message: 'Error en búsqueda raw de técnicos',
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
