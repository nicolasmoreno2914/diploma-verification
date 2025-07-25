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
    if (row && row.some(cell => cell && cell.toString().includes('NUMERO DE DOCUMENTO'))) {
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
    
    const numeroDocumento = rowData['NUMERO DE DOCUMENTO'];
    if (numeroDocumento && numeroDocumento.trim() !== '' && numeroDocumento.length >= 5) {
      rowData['Tipo_Grado'] = tipoGrado;
      processedData.push(rowData);
    }
  }
  
  return processedData;
}

// Función para leer datos de Google Sheets - Lee TODOS los registros sin limitaciones
async function readGoogleSheetsData() {
  try {
    // URLs que funcionan correctamente en Netlify deployment
    // GID correcto para egresados tecnicos: 1426995834 (hoja con 2000+ registros)
    // GID correcto para egresados bachilleres: 0
    const tecnicosUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1426995834`;
    const bachilleresUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=0`;
    
    console.log('Leyendo datos completos de Google Sheets...');
    
    // Leer ambas hojas en paralelo
    const [tecnicosResponse, bachilleresResponse] = await Promise.all([
      fetch(tecnicosUrl).then(response => response.text()),
      fetch(bachilleresUrl).then(response => response.text())
    ]);
    
    console.log('Datos de técnicos recibidos, tamaño:', tecnicosResponse.length);
    console.log('Datos de bachilleres recibidos, tamaño:', bachilleresResponse.length);
    
    // Parsear los datos CSV
    const tecnicosValues = parseCSV(tecnicosResponse);
    const bachilleresValues = parseCSV(bachilleresResponse);
    
    console.log('Filas de técnicos parseadas:', tecnicosValues.length);
    console.log('Filas de bachilleres parseadas:', bachilleresValues.length);
    
    // Procesar los datos
    const tecnicosData = processSheetData(tecnicosValues, 'Técnico');
    const bachilleresData = processSheetData(bachilleresValues, 'Bachiller');
    
    console.log('Registros válidos de técnicos:', tecnicosData.length);
    console.log('Registros válidos de bachilleres:', bachilleresData.length);
    
    const totalData = [...tecnicosData, ...bachilleresData];
    console.log('Total de registros combinados:', totalData.length);
    
    return totalData;
    
  } catch (error) {
    console.error('Error leyendo Google Sheets:', error);
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

// Ruta de debug temporal para ver estructura de datos
app.get('/api/debug', async (req, res) => {
  try {
    const diplomasData = await readGoogleSheetsData();
    const sampleData = diplomasData.slice(0, 2); // Solo los primeros 2 registros
    
    res.json({
      success: true,
      message: 'Debug data from Google Sheets',
      total_records: diplomasData.length,
      sample_data: sampleData,
      available_columns: sampleData.length > 0 ? Object.keys(sampleData[0]) : []
    });
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo datos de debug',
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
