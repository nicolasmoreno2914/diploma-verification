const XLSX = require('xlsx');
const path = require('path');

// Datos de ejemplo para el archivo Excel
const diplomasData = [
  {
    'Cédula': '12345678',
    'Nombres': 'Juan Carlos',
    'Apellidos': 'Pérez García',
    'Email': 'juan.perez@email.com',
    'Teléfono': '3001234567',
    'Título': 'Ingeniero de Sistemas',
    'Programa Académico': 'Ingeniería de Sistemas y Computación',
    'Fecha Graduación': '2020-12-15',
    'Número Diploma': 'DIP-2020-001',
    'Código Verificación': 'VER-SYS-2020-001',
    'Grado Académico': 'Profesional',
    'Modalidad': 'Presencial',
    'Institución': 'Universidad Nacional de Colombia',
    'Ciudad': 'Bogotá',
    'País': 'Colombia'
  },
  {
    'Cédula': '87654321',
    'Nombres': 'María Fernanda',
    'Apellidos': 'López Rodríguez',
    'Email': 'maria.lopez@email.com',
    'Teléfono': '3109876543',
    'Título': 'Administradora de Empresas',
    'Programa Académico': 'Administración de Empresas',
    'Fecha Graduación': '2019-06-20',
    'Número Diploma': 'DIP-2019-045',
    'Código Verificación': 'VER-ADM-2019-045',
    'Grado Académico': 'Profesional',
    'Modalidad': 'Presencial',
    'Institución': 'Universidad de los Andes',
    'Ciudad': 'Bogotá',
    'País': 'Colombia'
  },
  {
    'Cédula': '11223344',
    'Nombres': 'Carlos Andrés',
    'Apellidos': 'Martínez Silva',
    'Email': 'carlos.martinez@email.com',
    'Teléfono': '3201122334',
    'Título': 'Ingeniero Civil',
    'Programa Académico': 'Ingeniería Civil',
    'Fecha Graduación': '2021-11-30',
    'Número Diploma': 'DIP-2021-078',
    'Código Verificación': 'VER-CIV-2021-078',
    'Grado Académico': 'Profesional',
    'Modalidad': 'Presencial',
    'Institución': 'Universidad Pontificia Bolivariana',
    'Ciudad': 'Medellín',
    'País': 'Colombia'
  },
  {
    'Cédula': '44332211',
    'Nombres': 'Ana Sofía',
    'Apellidos': 'González Herrera',
    'Email': 'ana.gonzalez@email.com',
    'Teléfono': '3154433221',
    'Título': 'Médica Cirujana',
    'Programa Académico': 'Medicina',
    'Fecha Graduación': '2022-05-25',
    'Número Diploma': 'DIP-2022-012',
    'Código Verificación': 'VER-MED-2022-012',
    'Grado Académico': 'Profesional',
    'Modalidad': 'Presencial',
    'Institución': 'Universidad del Valle',
    'Ciudad': 'Cali',
    'País': 'Colombia'
  },
  {
    'Cédula': '55667788',
    'Nombres': 'Diego Alejandro',
    'Apellidos': 'Ramírez Torres',
    'Email': 'diego.ramirez@email.com',
    'Teléfono': '3185566778',
    'Título': 'Ingeniero Industrial',
    'Programa Académico': 'Ingeniería Industrial',
    'Fecha Graduación': '2018-12-10',
    'Número Diploma': 'DIP-2018-156',
    'Código Verificación': 'VER-IND-2018-156',
    'Grado Académico': 'Profesional',
    'Modalidad': 'Presencial',
    'Institución': 'Universidad Industrial de Santander',
    'Ciudad': 'Bucaramanga',
    'País': 'Colombia'
  }
];

function createExcelFile() {
  try {
    // Crear un nuevo libro de trabajo
    const workbook = XLSX.utils.book_new();
    
    // Convertir los datos a una hoja de trabajo
    const worksheet = XLSX.utils.json_to_sheet(diplomasData);
    
    // Agregar la hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Diplomas');
    
    // Definir la ruta del archivo
    const filePath = path.join(__dirname, '..', 'data', 'diplomas.xlsx');
    
    // Escribir el archivo
    XLSX.writeFile(workbook, filePath);
    
    console.log('✅ Archivo Excel creado exitosamente en:', filePath);
    console.log('📊 Registros incluidos:', diplomasData.length);
    console.log('');
    console.log('🔍 Cédulas de prueba disponibles:');
    diplomasData.forEach(diploma => {
      console.log(`   - ${diploma['Cédula']} (${diploma['Nombres']} ${diploma['Apellidos']})`);
    });
    
  } catch (error) {
    console.error('❌ Error creando el archivo Excel:', error.message);
  }
}

// Ejecutar la función
createExcelFile();
