// Sistema de Verificación de Diplomas - Solución Cliente Completa

document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const form = document.getElementById('verificationForm');
    const cedulaInput = document.getElementById('cedula');
    const loadingDiv = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    const errorDiv = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    
    // Cargar estadísticas fijas
    loadStatistics();
    
    // Event listener para el formulario
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const cedula = cedulaInput.value.trim();
        
        if (!cedula) {
            showError('Por favor ingrese un número de cédula válido');
            return;
        }
        
        // Validar que solo contenga números
        if (!/^[0-9]+$/.test(cedula)) {
            showError('El número de cédula debe contener solo números');
            return;
        }
        
        // Validar longitud mínima
        if (cedula.length < 6) {
            showError('El número de cédula debe tener al menos 6 dígitos');
            return;
        }
        
        searchDiploma(cedula);
    });
    
    // Event listener para limpiar errores cuando el usuario escriba
    cedulaInput.addEventListener('input', function() {
        hideError();
    });
    
    // Event listener para el botón de nueva búsqueda
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'newSearchButton') {
            newSearch();
        }
    });

    // Función para buscar diploma directamente en Google Sheets
    async function searchDiploma(cedula) {
        try {
            // Mostrar loading
            showLoading();
            hideResults();
            hideError();

            const cedulaNormalizada = cedula.replace(/[^0-9]/g, '').trim();
            
            // URLs directas de Google Sheets
            const gvizTecnicosUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=1426995834`;
            const gvizBachilleresUrl = `https://docs.google.com/spreadsheets/d/1s4beQ2-EJOwkjKwy_6jvJOtABPjD1104QyxS7kympo0/gviz/tq?tqx=out:csv&gid=0`;
            
            let diploma = null;
            
            // Buscar en técnicos
            try {
                const tecnicosResponse = await fetch(gvizTecnicosUrl);
                const tecnicosText = await tecnicosResponse.text();
                diploma = searchDirectInCSV(tecnicosText, cedulaNormalizada, 'Técnico');
            } catch (error) {
                console.log('Error buscando en técnicos:', error);
            }
            
            // Si no se encontró en técnicos, buscar en bachilleres
            if (!diploma) {
                try {
                    const bachilleresResponse = await fetch(gvizBachilleresUrl);
                    const bachilleresText = await bachilleresResponse.text();
                    diploma = searchDirectInCSV(bachilleresText, cedulaNormalizada, 'Bachiller');
                } catch (error) {
                    console.log('Error buscando en bachilleres:', error);
                }
            }
            
            // Ocultar loading
            hideLoading();

            if (diploma) {
                // Mostrar resultados
                displayDiplomaInfo(diploma);
                showResults();
            } else {
                // Mostrar error
                showError('No se encontró información para esta cédula');
            }

        } catch (error) {
            hideLoading();
            console.error('Error en la búsqueda:', error);
            showError('Error de conexión. Por favor intente de nuevo más tarde.');
        }
    }
    
    // Función para buscar directamente en CSV con mapeo robusto
    function searchDirectInCSV(csvText, targetId, tipo) {
        const lines = csvText.split('\n');
        const normalizedTarget = targetId.toString().replace(/[^0-9]/g, '');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(normalizedTarget)) {
                // Parsear la línea encontrada
                const cells = parseCSVLine(line);
                
                // Buscar la columna que contiene el número de documento
                let documentColumn = -1;
                let nameColumn = -1;
                let dateColumn = -1;
                let diplomaColumn = -1;
                
                for (let j = 0; j < cells.length; j++) {
                    const cell = cells[j].toString().replace(/[^0-9]/g, '');
                    
                    // Si esta celda contiene exactamente nuestro número objetivo
                    if (cell === normalizedTarget) {
                        documentColumn = j;
                        
                        // Mapeo dinámico basado en la posición encontrada
                        if (tipo === 'Técnico') {
                            // Para técnicos: nombre suele estar 1 posición antes del documento
                            nameColumn = Math.max(0, j - 1);
                            // Fecha suele estar 1 posición después del documento
                            dateColumn = j + 1;
                            // Diploma suele estar 3 posiciones después del documento
                            diplomaColumn = j + 3;
                        } else {
                            // Para bachilleres: mapeo estándar
                            nameColumn = 1;
                            dateColumn = 3;
                            diplomaColumn = 5;
                        }
                        break;
                    }
                }
                
                // Si encontramos el documento, extraer los datos
                if (documentColumn >= 0) {
                    const rowData = {
                        numero_documento: cells[documentColumn] ? cells[documentColumn].toString().trim() : normalizedTarget,
                        nombre_completo: (nameColumn >= 0 && cells[nameColumn]) ? cells[nameColumn].toString().trim() : '',
                        fecha_graduacion: (dateColumn >= 0 && cells[dateColumn]) ? formatDate(cells[dateColumn].toString().trim()) : '',
                        codigo_verificacion: (diplomaColumn >= 0 && cells[diplomaColumn]) ? cells[diplomaColumn].toString().trim() : '',
                        tipo_grado: tipo,
                        institucion: 'Inandina',
                        ciudad: 'Villavicencio'
                    };
                    
                    // Verificar que tenemos datos válidos
                    if (rowData.nombre_completo && rowData.nombre_completo.length > 3) {
                        return rowData;
                    }
                }
            }
        }
        
        return null;
    }
    
    // Función para parsear una línea CSV
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

    // Función para mostrar información del diploma
    function displayDiplomaInfo(data) {
        const diplomaInfo = document.getElementById('diplomaInfo');
        diplomaInfo.innerHTML = `
            <div class="diploma-info fade-in">
                <!-- Información del Estudiante -->
                <div class="info-section">
                    <h5 class="text-primary mb-3">
                        <i class="fas fa-user me-2"></i>
                        Información del Graduado
                    </h5>
                    <div class="row">
                        <div class="col-md-12 mb-2">
                            <div class="info-label">Nombre Completo:</div>
                            <div class="info-value fw-bold">${data.nombre_completo}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Número de Documento:</div>
                            <div class="info-value">${data.numero_documento}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Tipo de Graduación:</div>
                            <div class="info-value">${data.tipo_grado}</div>
                        </div>
                    </div>
                </div>

                <!-- Información del Diploma -->
                <div class="info-section">
                    <h5 class="text-success mb-3">
                        <i class="fas fa-certificate me-2"></i>
                        Información del Diploma
                    </h5>
                    <div class="row">
                        <div class="col-md-6">
                            <div class="info-label">Fecha de Graduación:</div>
                            <div class="info-value">${data.fecha_graduacion}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Código de Verificación:</div>
                            <div class="info-value fw-bold text-success">${data.codigo_verificacion}</div>
                        </div>
                    </div>
                </div>

                <!-- Información Institucional -->
                <div class="info-section">
                    <h5 class="text-info mb-3">
                        <i class="fas fa-university me-2"></i>
                        Información Institucional
                    </h5>
                    <div class="row">
                        <div class="col-md-6">
                            <div class="info-label">Institución:</div>
                            <div class="info-value">${data.institucion}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Ciudad:</div>
                            <div class="info-value">${data.ciudad}</div>
                        </div>
                    </div>
                </div>

                <!-- Mensaje de Verificación -->
                <div class="text-center mt-4">
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle me-2"></i>
                        <strong>Diploma Verificado Exitosamente</strong><br>
                        Este diploma ha sido validado en nuestra base de datos oficial.
                    </div>
                </div>

                <!-- Botón para nueva búsqueda -->
                <div class="text-center mt-3">
                    <button type="button" class="btn btn-outline-primary" id="newSearchButton">
                        <i class="fas fa-search me-2"></i>
                        Nueva Búsqueda
                    </button>
                </div>
            </div>
        `;
    }

    // Función para cargar estadísticas fijas
    function loadStatistics() {
        // Usar valores fijos según decisión del usuario
        document.getElementById('totalDiplomas').textContent = '2,794';
        document.getElementById('totalEstudiantes').textContent = '2,794';
        document.getElementById('totalInstituciones').textContent = '1';
    }

    // Funciones de utilidad para mostrar/ocultar elementos
    function showLoading() {
        loadingDiv.style.display = 'block';
    }

    function hideLoading() {
        loadingDiv.style.display = 'none';
    }

    function showResults() {
        resultsDiv.style.display = 'block';
    }

    function hideResults() {
        resultsDiv.style.display = 'none';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorDiv.style.display = 'block';
    }

    function hideError() {
        errorDiv.style.display = 'none';
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

    // Función para limpiar formulario
    function clearForm() {
        cedulaInput.value = '';
        hideResults();
        hideError();
    }

    // Función para nueva búsqueda
    function newSearch() {
        clearForm();
        cedulaInput.focus();
    }
});
