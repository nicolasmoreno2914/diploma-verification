const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de seguridad
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.API_RATE_LIMIT) || 100,
  message: 'Demasiadas consultas desde esta IP, intente de nuevo más tarde.'
});
app.use('/api/', limiter);

// Configuración de Google Sheets
const SPREADSHEET_ID = '1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0';
const SHEETS_CONFIG = {
  tecnicos: 'tecnicos!A:Z',  // Rango completo de la hoja técnicos
  bachilleres: 'bachilleres!A:Z'  // Rango completo de la hoja bachilleres
};

// Función para leer datos de Google Sheets usando la API oficial
async function readGoogleSheetsData() {
  try {
    console.log('🔍 Iniciando lectura de Google Sheets con API oficial...');
    
    const sheets = google.sheets({ version: 'v4' });
    
    // Intentar leer con API key primero, luego sin autenticación
    const requestConfig = {
      spreadsheetId: SPREADSHEET_ID,
      range: 'A:Z', // Leer todas las columnas
    };
    
    // Si hay API key, usarla
    if (process.env.GOOGLE_API_KEY) {
      requestConfig.key = process.env.GOOGLE_API_KEY;
    }
    
    console.log('📡 Leyendo hojas con API oficial...');
    
    // Leer ambas hojas usando la API oficial
    const [tecnicosResponse, bachilleresResponse] = await Promise.all([
      // Leer hoja de técnicos
      sheets.spreadsheets.values.get({
        ...requestConfig,
        range: 'tecnicos!A:Z'
      }).catch(async (error) => {
        console.log('⚠️ Error con API oficial para técnicos, usando CSV fallback:', error.message);
        // Fallback a CSV con parámetros para leer todos los datos
        const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=0&single=true&output=csv`;
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        console.log(`📊 CSV técnicos - caracteres leídos: ${csvText.length}`);
        return { data: { values: parseCSV(csvText) } };
      }),
      
      // Leer hoja de bachilleres
      sheets.spreadsheets.values.get({
        ...requestConfig,
        range: 'bachilleres!A:Z'
      }).catch(async (error) => {
        console.log('⚠️ Error con API oficial para bachilleres, usando CSV fallback:', error.message);
        // Fallback a CSV con parámetros para leer todos los datos
        const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=1&single=true&output=csv`;
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        console.log(`📊 CSV bachilleres - caracteres leídos: ${csvText.length}`);
        return { data: { values: parseCSV(csvText) } };
      })
    ]);

    console.log('📊 Respuesta técnicos - filas:', tecnicosResponse.data.values ? tecnicosResponse.data.values.length : 0);
    console.log('📊 Respuesta bachilleres - filas:', bachilleresResponse.data.values ? bachilleresResponse.data.values.length : 0);
    
    // Procesar datos de técnicos
    const tecnicosData = processSheetData(tecnicosResponse.data.values || [], 'Técnico');
    
    // Procesar datos de bachilleres
    const bachilleresData = processSheetData(bachilleresResponse.data.values || [], 'Bachiller');
    
    // Combinar ambos datasets
    const allData = [...tecnicosData, ...bachilleresData];
    
    console.log(`✅ Google Sheets leído exitosamente:`);
    console.log(`   - Técnicos: ${tecnicosData.length} registros`);
    console.log(`   - Bachilleres: ${bachilleresData.length} registros`);
    console.log(`   - Total: ${allData.length} registros`);
    
    // Log de muestra de datos para debug
    if (allData.length > 0) {
      console.log('🔍 Muestra del primer registro:');
      console.log('   - Columnas disponibles:', Object.keys(allData[0]));
      console.log('   - Primer registro completo:', JSON.stringify(allData[0], null, 2));
    }
    
    return allData;
    
  } catch (error) {
    console.error('❌ Error leyendo Google Sheets:', error.message);
    throw error;
  }
}

// Función para parsear CSV
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  return lines.map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
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
    return values;
  });
}

// Función para procesar datos de una hoja específica (formato API de Google Sheets)
function processSheetData(values, tipoGrado) {
  if (!values || values.length === 0) {
    console.log(`⚠️ No hay datos para procesar en ${tipoGrado}`);
    return [];
  }

  console.log(`🔍 Procesando ${values.length} filas para ${tipoGrado}`);

  // Buscar la fila que contiene los encabezados reales
  let headerRowIndex = -1;
  let headers = [];
  
  for (let i = 0; i < Math.min(values.length, 10); i++) { // Buscar en las primeras 10 filas
    const row = values[i];
    if (row && row.some(cell => cell && cell.toString().includes('NUMERO DE DOCUMENTO'))) {
      headerRowIndex = i;
      headers = row.map(cell => cell ? cell.toString().trim() : '');
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    console.log(`❌ No se encontraron encabezados válidos en ${tipoGrado}`);
    console.log(`📝 Primeras 3 filas para debug:`);
    values.slice(0, 3).forEach((row, i) => {
      console.log(`   Fila ${i}:`, row ? row.slice(0, 5) : 'undefined');
    });
    return [];
  }
  
  console.log(`📋 Encabezados encontrados en fila ${headerRowIndex}:`, headers.slice(0, 8));
  
  // Procesar las filas de datos (después de los encabezados)
  const dataRows = values.slice(headerRowIndex + 1);
  const processedData = [];
  
  for (const row of dataRows) {
    if (!row || row.length === 0) continue; // Saltar filas vacías
    
    // Crear objeto con los datos de la fila
    const rowData = {};
    headers.forEach((header, index) => {
      if (header) {
        rowData[header] = row[index] ? row[index].toString().trim() : '';
      }
    });
    
    // Solo incluir filas que tengan número de documento válido
    const numeroDocumento = rowData['NUMERO DE DOCUMENTO'];
    if (numeroDocumento && numeroDocumento.trim() !== '' && numeroDocumento.length >= 5) {
      rowData['Tipo_Grado'] = tipoGrado;
      processedData.push(rowData);
    }
  }
  
  console.log(`📊 Procesados ${processedData.length} registros válidos de tipo ${tipoGrado}`);
  
  // Mostrar muestra de los primeros registros
  if (processedData.length > 0) {
    console.log(`📋 Muestra de primeros 3 registros de ${tipoGrado}:`);
    processedData.slice(0, 3).forEach((record, i) => {
      console.log(`   ${i + 1}. ${record['NOMBRES Y APELLIDOS']} - ${record['NUMERO DE DOCUMENTO']}`);
    });
  }
  
  return processedData;
}

// Ruta principal - servir la página web
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API para verificar diploma por cédula
app.post('/api/verify-diploma', async (req, res) => {
  const { cedula } = req.body;

  // Validación de entrada
  if (!cedula || cedula.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'El número de cédula es requerido'
    });
  }

  try {
    // Leer datos de Google Sheets
    const diplomasData = await readGoogleSheetsData();
    
    // Log para debug de búsqueda
    console.log(`🔍 Buscando cédula: "${cedula}"`);
    console.log(`📊 Total registros disponibles: ${diplomasData.length}`);
    
    // Mostrar algunas identificaciones disponibles para debug
    if (diplomasData.length > 0) {
      console.log('🔍 Primeras 5 identificaciones en los datos:');
      diplomasData.slice(0, 5).forEach((row, index) => {
        const identificacion = row['Cédula'] || row['Cedula'] || row['Identificación'] || 
                              row['Identificacion'] || row['ID'] || row['Numero de Identificacion'] ||
                              row['Número de Identificación'] || row['CEDULA'] || row['cedula'] || '';
        console.log(`   ${index + 1}. "${identificacion}" (Tipo: ${row.Tipo_Grado})`);
      });
    }
    
    // Buscar el diploma por cédula en ambas hojas
    const diploma = diplomasData.find(row => {
      // Buscar en diferentes posibles nombres de columna para cédula/identificación
      // Basado en la estructura real del Google Sheets
      const identificacion = row['NUMERO DE DOCUMENTO'] || row['Numero de Documento'] || 
                            row['Cédula'] || row['Cedula'] || row['Identificación'] || 
                            row['Identificacion'] || row['ID'] || row['Numero de Identificacion'] ||
                            row['Número de Identificación'] || row['CEDULA'] || row['cedula'] || '';
      
      const match = identificacion && identificacion.toString().trim() === cedula.trim();
      if (match) {
        console.log(`✅ ¡Encontrado! Identificación: "${identificacion}" coincide con "${cedula}"`);
      }
      return match;
    });
    
    console.log(`🎯 Resultado de búsqueda: ${diploma ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
    if (diploma) {
      console.log('📋 Datos encontrados:', JSON.stringify(diploma, null, 2));
    }

    if (!diploma) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró ningún diploma registrado para esta cédula'
      });
    }

    // Devolver información del diploma encontrado
    res.json({
      success: true,
      message: 'Diploma encontrado exitosamente',
      data: {
        estudiante: {
          cedula: diploma['NUMERO DE DOCUMENTO'] || diploma['Numero de Documento'] || diploma['Cédula'] || diploma['Cedula'],
          nombres: diploma['NOMBRES Y APELLIDOS'] || diploma['Nombres y Apellidos'] || diploma['Nombres'] || diploma['Nombre'],
          apellidos: '', // Los apellidos están incluidos en 'NOMBRES Y APELLIDOS'
          email: diploma['Email'] || diploma['Correo'] || diploma['Correo Electrónico'],
          telefono: diploma['Número Celular'] || diploma['Numero Celular'] || diploma['Teléfono'] || diploma['Telefono']
        },
        diploma: {
          titulo: diploma['Tipo_Grado'] || 'No especificado',
          programa_academico: diploma['ALIADO'] || diploma['Tipo_Grado'] || 'Programa Técnico',
          fecha_graduacion: diploma['FECHA DE GRADO'] || 'No especificada',
          numero_diploma: diploma['NUMERO DE DIPLOMA'] || 'No especificado',
          codigo_verificacion: diploma['Acta No.'] || 'No especificado',
          grado_academico: diploma['Tipo_Grado'] || 'No especificado',
          modalidad: diploma['ALIADO'] ? diploma['ALIADO'] : 'Presencial',
          fecha_emision: diploma['FECHA DE EMISIÓN'] || 'No especificada'
        },
        institucion: {
          nombre: 'Institución Universitaria Antonio José Camacho - INANDINA',
          ciudad: 'Cali',
          pais: 'Colombia'
        }
      }
    });

  } catch (error) {
    console.error('Error en la consulta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor. Intente de nuevo más tarde.'
    });
  }
});

// API de debug para ver la estructura de datos
app.get('/api/debug', async (req, res) => {
  try {
    const diplomasData = await readGoogleSheetsData();
    
    // Mostrar los primeros 3 registros de cada tipo para debug
    const tecnicosData = diplomasData.filter(row => row.Tipo_Grado === 'Técnico').slice(0, 3);
    const bachilleresData = diplomasData.filter(row => row.Tipo_Grado === 'Bachiller').slice(0, 3);
    
    res.json({
      success: true,
      debug: {
        total_registros: diplomasData.length,
        tecnicos_count: diplomasData.filter(row => row.Tipo_Grado === 'Técnico').length,
        bachilleres_count: diplomasData.filter(row => row.Tipo_Grado === 'Bachiller').length,
        sample_tecnicos: tecnicosData,
        sample_bachilleres: bachilleresData,
        all_column_names: diplomasData.length > 0 ? Object.keys(diplomasData[0]) : []
      }
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

// API para obtener estadísticas (opcional)
app.get('/api/stats', async (req, res) => {
  try {
    // Leer datos de Google Sheets
    const diplomasData = await readGoogleSheetsData();
    
    // Calcular estadísticas
    const totalDiplomas = diplomasData.length;
    const totalEstudiantes = diplomasData.length; // Cada fila es un estudiante único
    const uniqueInstitutions = [...new Set(diplomasData.map(row => row['Institución']))];
    const totalInstituciones = uniqueInstitutions.length;

    res.json({
      success: true,
      data: {
        total_diplomas: totalDiplomas,
        total_estudiantes: totalEstudiantes,
        total_instituciones: totalInstituciones
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estadísticas'
    });
  }
});

// Manejo de errores 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
