const fetch = require('node-fetch');

// Función para parsear CSV
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const result = [];
  
  for (let line of lines) {
    if (line.trim()) {
      const row = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current.trim());
      result.push(row);
    }
  }
  
  return result;
}

// Función de búsqueda directa en CSV con mapeo correcto de columnas
function searchDirectInCSV(csvText, targetId) {
  const lines = csvText.split('\n');
  const normalizedTarget = targetId.toString().replace(/[^0-9]/g, '');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(normalizedTarget)) {
      // Parsear la línea encontrada
      const cells = parseCSV(line + '\n')[0] || [];
      
      // Mapeo basado en la estructura real del CSV de técnicos:
      // Columna 0: Número Celular
      // Columna 1: NOMBRES Y APELLIDOS
      // Columna 2: TÉCNICOS LABORAL NÚMERO DE DOCUMENTO
      // Columna 3: FECHA DE GRADO
      // Columna 4: No. Acta
      // Columna 5: NÚMERO DE DIPLOMA
      
      const rowData = {
        'NUMERO DE DOCUMENTO': cells[2] ? cells[2].toString().trim() : normalizedTarget,
        'NOMBRES Y APELLIDOS': cells[1] ? cells[1].toString().trim() : '',
        'FECHA DE GRADO': cells[3] ? cells[3].toString().trim() : '',
        'NUMERO DE DIPLOMA': cells[5] ? cells[5].toString().trim() : ''
      };
      
      // Verificar que realmente encontramos el documento correcto
      const documentoEncontrado = rowData['NUMERO DE DOCUMENTO'].replace(/[^0-9]/g, '');
      if (documentoEncontrado === normalizedTarget) {
        return rowData;
      }
    }
  }
  
  return null;
}

// Función para formatear fechas
function formatDate(dateString) {
  if (!dateString) return 'No especificada';
  
  try {
    // Si ya está en formato legible, devolverla tal como está
    if (dateString.includes('de')) {
      return dateString;
    }
    
    // Intentar parsear diferentes formatos de fecha
    let date;
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        // Formato DD/MM/YYYY o MM/DD/YYYY
        date = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    } else if (dateString.includes('-')) {
      date = new Date(dateString);
    }
    
    if (date && !isNaN(date.getTime())) {
      const months = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ];
      
      const day = date.getDate();
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      
      return `${day} de ${month} de ${year}`;
    }
    
    return dateString;
  } catch (error) {
    return dateString;
  }
}

exports.handler = async (event, context) => {
  // Configurar CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Manejar preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { id } = event.queryStringParameters || {};
    
    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Se requiere el parámetro id'
        })
      };
    }
    
    const cedulaNormalizada = id.toString().replace(/[^0-9]/g, '').trim();
    
    if (cedulaNormalizada.length < 5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'El número de documento debe tener al menos 5 dígitos'
        })
      };
    }
    
    console.log('Verificando diploma con búsqueda directa para ID:', cedulaNormalizada);
    
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
    
    // Si no se encontró en técnicos, buscar en bachilleres
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
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'No se encontró ningún diploma registrado para esta cédula'
        })
      };
    }
    
    // Formatear la fecha de graduación
    const fechaGraduacion = formatDate(diploma['FECHA DE GRADO'] || '');
    const numeroDiploma = diploma['NUMERO DE DIPLOMA'] || 'No disponible';
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Diploma encontrado exitosamente',
        data: {
          nombre_completo: diploma['NOMBRES Y APELLIDOS'] || 'No disponible',
          numero_documento: diploma['NUMERO DE DOCUMENTO'],
          fecha_graduacion: fechaGraduacion,
          codigo_verificacion: numeroDiploma,
          tipo_grado: diploma['Tipo_Grado'] || 'No disponible',
          institucion: 'Inandina',
          ciudad: 'Villavicencio'
        }
      })
    };
    
  } catch (error) {
    console.error('Error en verificación de diploma:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      })
    };
  }
};
