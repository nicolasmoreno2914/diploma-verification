# Sistema de Verificación de Diplomas 🎓

Un sistema web completo para la verificación de diplomas universitarios en tiempo real, permitiendo a estudiantes graduados consultar y validar sus títulos académicos mediante su número de cédula.

## 🚀 Características

- **Consulta en Tiempo Real**: Búsqueda instantánea en archivo Excel
- **Interfaz Moderna**: Diseño responsivo con Bootstrap 5 y animaciones CSS
- **Seguridad**: Rate limiting, validación de datos y protección contra ataques
- **API REST**: Endpoints seguros para consultas y estadísticas
- **Datos Completos**: Información del estudiante, diploma e institución
- **Código de Verificación**: Sistema de validación único por diploma

## 📋 Requisitos Previos

- Node.js (v14 o superior)
- npm o yarn
- Archivo Excel con datos de diplomas

## 🛠️ Instalación

1. **Clonar/Descargar el proyecto**
   ```bash
   cd diploma-verification
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Crear archivo Excel con datos de ejemplo**
   ```bash
   npm run create-excel
   ```
   
   Esto creará el archivo `data/diplomas.xlsx` con datos de prueba.

5. **Iniciar el servidor**
   ```bash
   npm start
   ```

## 🎯 Uso

1. Abrir navegador en `http://localhost:3000`
2. Ingresar número de cédula en el formulario
3. Hacer clic en "Buscar Diploma"
4. Ver resultados de verificación

### Cédulas de Prueba

El sistema incluye datos de ejemplo para testing:

- **12345678** - Juan Carlos Pérez García (Ing. Sistemas)
- **87654321** - María Fernanda López Rodríguez (Adm. Empresas)
- **11223344** - Carlos Andrés Martínez Silva (Ing. Civil)
- **44332211** - Ana Sofía González Herrera (Medicina)
- **55667788** - Diego Alejandro Ramírez Torres (Ing. Industrial)

## 📊 API Endpoints

### POST `/api/verify-diploma`
Verificar diploma por cédula

**Request:**
```json
{
  "cedula": "12345678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Diploma encontrado exitosamente",
  "data": {
    "estudiante": {
      "cedula": "12345678",
      "nombres": "Juan Carlos",
      "apellidos": "Pérez García",
      "email": "juan.perez@email.com"
    },
    "diploma": {
      "titulo": "Ingeniero de Sistemas",
      "programa_academico": "Ingeniería de Sistemas y Computación",
      "fecha_graduacion": "2020-12-15",
      "numero_diploma": "DIP-2020-001",
      "codigo_verificacion": "VER-SYS-2020-001"
    },
    "institucion": {
      "nombre": "Universidad Nacional de Colombia",
      "ciudad": "Bogotá",
      "pais": "Colombia"
    }
  }
}
```

### GET `/api/stats`
Obtener estadísticas del sistema

**Response:**
```json
{
  "success": true,
  "data": {
    "total_diplomas": 5,
    "total_estudiantes": 5,
    "total_instituciones": 5
  }
}
```

## 📊 Estructura del Archivo Excel

El archivo `data/diplomas.xlsx` debe contener las siguientes columnas:

- **Cédula** - Número de cédula del estudiante
- **Nombres** - Nombres del estudiante
- **Apellidos** - Apellidos del estudiante
- **Email** - Correo electrónico
- **Teléfono** - Número de teléfono
- **Título** - Título otorgado
- **Programa Académico** - Programa académico cursado
- **Fecha Graduación** - Fecha de graduación
- **Número Diploma** - Número único del diploma
- **Código Verificación** - Código de verificación único
- **Grado Académico** - Nivel académico (Técnico, Profesional, etc.)
- **Modalidad** - Modalidad de estudio (Presencial, Virtual, Mixta)
- **Institución** - Nombre de la institución
- **Ciudad** - Ciudad de la institución
- **País** - País de la institución

## 🔧 Scripts Disponibles

- `npm start` - Iniciar servidor en producción
- `npm run dev` - Iniciar servidor en desarrollo (con nodemon)
- `npm run create-excel` - Crear archivo Excel con datos de ejemplo

## 🛡️ Seguridad

- **Rate Limiting**: Máximo 100 consultas por IP cada 15 minutos
- **Helmet**: Headers de seguridad HTTP
- **CORS**: Control de acceso entre dominios
- **Validación**: Validación de entrada en frontend y backend
- **SQL Injection**: Uso de prepared statements

## 🎨 Tecnologías Utilizadas

- **Backend**: Node.js, Express.js, XLSX
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla), Bootstrap 5
- **Seguridad**: Helmet, CORS, Express Rate Limit
- **Almacenamiento**: Archivo Excel (.xlsx)
- **Iconos**: Font Awesome

## 📱 Características Responsivas

- Diseño adaptable a móviles, tablets y desktop
- Interfaz optimizada para diferentes tamaños de pantalla
- Animaciones y efectos visuales modernos

## 🚀 Despliegue

Para desplegar en producción:

1. Configurar variables de entorno de producción
2. Usar un gestor de procesos como PM2
3. Configurar proxy reverso (Nginx)
4. Configurar SSL/HTTPS
5. Optimizar base de datos para producción

## 📞 Soporte

Para soporte técnico o consultas sobre el sistema, contactar al administrador del sistema.

## 📄 Licencia

MIT License - Ver archivo LICENSE para más detalles.

---

**Sistema de Verificación de Diplomas** - Consulta Segura y Confiable 🎓
