// Sistema de Verificación de Diplomas - Frontend JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Elementos del DOM
    const form = document.getElementById('verificationForm');
    const cedulaInput = document.getElementById('cedula');
    const searchBtn = document.getElementById('searchBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultsCard = document.getElementById('resultsCard');
    const errorCard = document.getElementById('errorCard');
    const diplomaInfo = document.getElementById('diplomaInfo');
    const errorMessage = document.getElementById('errorMessage');

    // Cargar estadísticas al inicializar
    loadStatistics();

    // Validación en tiempo real del input de cédula
    cedulaInput.addEventListener('input', function(e) {
        // Solo permitir números
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        
        // Validar longitud
        if (e.target.value.length > 15) {
            e.target.value = e.target.value.slice(0, 15);
        }
    });

    // Manejar envío del formulario
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const cedula = cedulaInput.value.trim();
        
        // Validaciones
        if (!cedula) {
            showError('Por favor ingrese un número de cédula válido');
            return;
        }

        if (cedula.length < 6) {
            showError('El número de cédula debe tener al menos 6 dígitos');
            return;
        }

        // Realizar búsqueda
        searchDiploma(cedula);
    });

    // Función para buscar diploma
    async function searchDiploma(cedula) {
        try {
            // Mostrar loading
            showLoading();
            hideResults();
            hideError();

            // Realizar petición a la API
            const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? `/api/verify-diploma?id=${encodeURIComponent(cedula)}`
                : `/.netlify/functions/verify-diploma?id=${encodeURIComponent(cedula)}`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();

            // Ocultar loading
            hideLoading();

            if (data.success) {
                // Mostrar resultados
                displayDiplomaInfo(data.data);
                showResults();
            } else {
                // Mostrar error
                showError(data.message || 'No se encontró información para esta cédula');
            }

        } catch (error) {
            hideLoading();
            console.error('Error en la búsqueda:', error);
            showError('Error de conexión. Por favor intente de nuevo más tarde.');
        }
    }

    // Función para mostrar información del diploma
    function displayDiplomaInfo(data) {
        const { estudiante, diploma, institucion } = data;
        
        diplomaInfo.innerHTML = `
            <div class="diploma-info fade-in">
                <!-- Información del Estudiante -->
                <div class="info-section">
                    <h5 class="text-primary mb-3">
                        <i class="fas fa-user me-2"></i>
                        Información del Graduado
                    </h5>
                    <div class="row">
                        <div class="col-md-6">
                            <div class="info-label">Nombres:</div>
                            <div class="info-value">${estudiante.nombres}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Apellidos:</div>
                            <div class="info-value">${estudiante.apellidos}</div>
                        </div>
                        <div class="col-md-6 mt-2">
                            <div class="info-label">Cédula:</div>
                            <div class="info-value">${estudiante.cedula}</div>
                        </div>
                        <div class="col-md-6 mt-2">
                            <div class="info-label">Email:</div>
                            <div class="info-value">${estudiante.email}</div>
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
                        <div class="col-md-12 mb-2">
                            <div class="info-label">Título Otorgado:</div>
                            <div class="info-value fw-bold">${diploma.titulo}</div>
                        </div>
                        <div class="col-md-12 mb-2">
                            <div class="info-label">Programa Académico:</div>
                            <div class="info-value">${diploma.programa_academico}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Fecha de Graduación:</div>
                            <div class="info-value">${diploma.fecha_graduacion}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Número de Diploma:</div>
                            <div class="info-value">${diploma.numero_diploma}</div>
                        </div>
                        <div class="col-md-12 mt-2">
                            <div class="info-label">Código de Verificación:</div>
                            <div class="info-value">
                                <span class="verification-badge">
                                    <i class="fas fa-shield-alt me-1"></i>
                                    ${diploma.codigo_verificacion}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Información de la Institución -->
                <div class="info-section">
                    <h5 class="text-info mb-3">
                        <i class="fas fa-university me-2"></i>
                        Institución Educativa
                    </h5>
                    <div class="row">
                        <div class="col-md-12 mb-2">
                            <div class="info-label">Institución:</div>
                            <div class="info-value fw-bold">${institucion.nombre}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">Ciudad:</div>
                            <div class="info-value">${institucion.ciudad}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="info-label">País:</div>
                            <div class="info-value">${institucion.pais}</div>
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
            </div>
        `;
    }

    // Función para cargar estadísticas reales del sistema
    async function loadStatistics() {
        try {
            const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? '/api/statistics'
                : '/.netlify/functions/statistics';
            
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.success) {
                document.getElementById('totalDiplomas').textContent = data.data.diplomas_registrados.toLocaleString();
                document.getElementById('totalEstudiantes').textContent = data.data.estudiantes.toLocaleString();
                document.getElementById('totalInstituciones').textContent = data.data.instituciones;
            }
        } catch (error) {
            console.error('Error cargando estadísticas:', error);
            // Mostrar valores por defecto en caso de error
            document.getElementById('totalDiplomas').textContent = '---';
            document.getElementById('totalEstudiantes').textContent = '---';
            document.getElementById('totalInstituciones').textContent = '---';
        }
    }

    // Funciones de utilidad para mostrar/ocultar elementos
    function showLoading() {
        loadingSpinner.style.display = 'block';
        searchBtn.disabled = true;
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Buscando...';
    }

    function hideLoading() {
        loadingSpinner.style.display = 'none';
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<i class="fas fa-search me-2"></i>Buscar Diploma';
    }

    function showResults() {
        resultsCard.style.display = 'block';
        resultsCard.classList.add('fade-in');
    }

    function hideResults() {
        resultsCard.style.display = 'none';
        resultsCard.classList.remove('fade-in');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorCard.style.display = 'block';
        errorCard.classList.add('fade-in');
    }

    function hideError() {
        errorCard.style.display = 'none';
        errorCard.classList.remove('fade-in');
    }

    // Función para formatear fechas
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Función para limpiar formulario
    function clearForm() {
        cedulaInput.value = '';
        hideResults();
        hideError();
    }

    // Agregar botón para nueva búsqueda
    window.newSearch = function() {
        clearForm();
        cedulaInput.focus();
    };
});
