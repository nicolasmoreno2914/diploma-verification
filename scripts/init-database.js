const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuración de la base de datos
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

async function initializeDatabase() {
  let connection;
  
  try {
    console.log('🔄 Conectando a MySQL...');
    connection = await mysql.createConnection(dbConfig);
    
    // Crear base de datos si no existe
    const dbName = process.env.DB_NAME || 'diploma_verification';
    console.log(`📊 Creando base de datos: ${dbName}`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    await connection.execute(`USE ${dbName}`);
    
    // Crear tabla de instituciones
    console.log('🏛️ Creando tabla de instituciones...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS instituciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre_institucion VARCHAR(255) NOT NULL,
        ciudad VARCHAR(100) NOT NULL,
        pais VARCHAR(100) NOT NULL,
        codigo_institucion VARCHAR(50) UNIQUE,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activa BOOLEAN DEFAULT TRUE
      )
    `);

    // Crear tabla de estudiantes
    console.log('👨‍🎓 Creando tabla de estudiantes...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS estudiantes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cedula VARCHAR(20) UNIQUE NOT NULL,
        nombres VARCHAR(100) NOT NULL,
        apellidos VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL,
        telefono VARCHAR(20),
        fecha_nacimiento DATE,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de diplomas
    console.log('🎓 Creando tabla de diplomas...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS diplomas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        estudiante_id INT NOT NULL,
        institucion_id INT NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        programa_academico VARCHAR(255) NOT NULL,
        fecha_graduacion DATE NOT NULL,
        numero_diploma VARCHAR(100) UNIQUE NOT NULL,
        codigo_verificacion VARCHAR(100) UNIQUE NOT NULL,
        grado_academico ENUM('Técnico', 'Tecnólogo', 'Profesional', 'Especialización', 'Maestría', 'Doctorado') NOT NULL,
        modalidad ENUM('Presencial', 'Virtual', 'Mixta') DEFAULT 'Presencial',
        fecha_expedicion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activo BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id) ON DELETE CASCADE,
        FOREIGN KEY (institucion_id) REFERENCES instituciones(id) ON DELETE CASCADE
      )
    `);

    // Insertar datos de ejemplo
    console.log('📝 Insertando datos de ejemplo...');
    
    // Instituciones de ejemplo
    await connection.execute(`
      INSERT IGNORE INTO instituciones (nombre_institucion, ciudad, pais, codigo_institucion) VALUES
      ('Universidad Nacional de Colombia', 'Bogotá', 'Colombia', 'UNAL001'),
      ('Universidad de los Andes', 'Bogotá', 'Colombia', 'UANDES002'),
      ('Universidad Pontificia Bolivariana', 'Medellín', 'Colombia', 'UPB003'),
      ('Universidad del Valle', 'Cali', 'Colombia', 'UNIVALLE004'),
      ('Universidad Industrial de Santander', 'Bucaramanga', 'Colombia', 'UIS005')
    `);

    // Estudiantes de ejemplo
    await connection.execute(`
      INSERT IGNORE INTO estudiantes (cedula, nombres, apellidos, email, telefono, fecha_nacimiento) VALUES
      ('12345678', 'Juan Carlos', 'Pérez García', 'juan.perez@email.com', '3001234567', '1995-03-15'),
      ('87654321', 'María Fernanda', 'López Rodríguez', 'maria.lopez@email.com', '3109876543', '1993-07-22'),
      ('11223344', 'Carlos Andrés', 'Martínez Silva', 'carlos.martinez@email.com', '3201122334', '1994-11-08'),
      ('44332211', 'Ana Sofía', 'González Herrera', 'ana.gonzalez@email.com', '3154433221', '1996-01-30'),
      ('55667788', 'Diego Alejandro', 'Ramírez Torres', 'diego.ramirez@email.com', '3185566778', '1992-09-12')
    `);

    // Diplomas de ejemplo
    await connection.execute(`
      INSERT IGNORE INTO diplomas (estudiante_id, institucion_id, titulo, programa_academico, fecha_graduacion, numero_diploma, codigo_verificacion, grado_academico, modalidad) VALUES
      (1, 1, 'Ingeniero de Sistemas', 'Ingeniería de Sistemas y Computación', '2020-12-15', 'DIP-2020-001', 'VER-SYS-2020-001', 'Profesional', 'Presencial'),
      (2, 2, 'Administradora de Empresas', 'Administración de Empresas', '2019-06-20', 'DIP-2019-045', 'VER-ADM-2019-045', 'Profesional', 'Presencial'),
      (3, 3, 'Ingeniero Civil', 'Ingeniería Civil', '2021-11-30', 'DIP-2021-078', 'VER-CIV-2021-078', 'Profesional', 'Presencial'),
      (4, 4, 'Médica Cirujana', 'Medicina', '2022-05-25', 'DIP-2022-012', 'VER-MED-2022-012', 'Profesional', 'Presencial'),
      (5, 5, 'Ingeniero Industrial', 'Ingeniería Industrial', '2018-12-10', 'DIP-2018-156', 'VER-IND-2018-156', 'Profesional', 'Presencial')
    `);

    console.log('✅ Base de datos inicializada correctamente!');
    console.log('📊 Datos de ejemplo insertados:');
    console.log('   - 5 Instituciones');
    console.log('   - 5 Estudiantes');
    console.log('   - 5 Diplomas');
    console.log('');
    console.log('🔍 Cédulas de prueba disponibles:');
    console.log('   - 12345678 (Juan Carlos Pérez García)');
    console.log('   - 87654321 (María Fernanda López Rodríguez)');
    console.log('   - 11223344 (Carlos Andrés Martínez Silva)');
    console.log('   - 44332211 (Ana Sofía González Herrera)');
    console.log('   - 55667788 (Diego Alejandro Ramírez Torres)');

  } catch (error) {
    console.error('❌ Error inicializando la base de datos:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Ejecutar inicialización
initializeDatabase();
