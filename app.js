// Aplicación de Gasolineras España - Versión optimizada con marcadores mejorados
class GasolinerasApp {
    constructor() {
        this.mapa = null;
        this.gasolineras = [];
        this.gasolinerasRaw = [];
        this.marcadores = [];
        this.ubicacionActual = null;
        this.direccionActual = '';
        this.combustibleSeleccionado = 'Precio Gasoleo A';
        this.radioKm = 5;
        this.gasolineraSeleccionada = null;

        // Caché para optimizar búsquedas
        this.cache = {
            data: null,
            timestamp: null,
            duration: 5 * 60 * 1000 // 5 minutos
        };

        this.init();
    }

    init() {
        this.initMapa();
        this.initEventListeners();
        this.cargarPreferencias();
        this.updateMapInfo('📍 Obtén tu ubicación para ver gasolineras cercanas');
        
        // Auto-iniciar con GPS si hay preferencias guardadas
        const ultimaUbicacion = localStorage.getItem('ultima_ubicacion');
        if (!ultimaUbicacion) {
            this.obtenerUbicacion();
        }
    }

    initMapa() {
        this.mapa = L.map('mapa', {
            center: [40.4168, -3.7038],
            zoom: 6,
            zoomControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.mapa);

        this.mapa.zoomControl.setPosition('bottomleft');

        // Eventos del mapa
        this.mapa.on('zoomend moveend', () => {
            this.actualizarMarcadores();
        });
    }

    initEventListeners() {
        // Selector de combustible
        document.querySelectorAll('.fuel-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.querySelectorAll('.fuel-chip').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.combustibleSeleccionado = e.currentTarget.dataset.fuel;
                this.guardarPreferencias();
                
                if (this.gasolinerasRaw.length > 0 && this.ubicacionActual) {
                    this.procesarGasolineras();
                }
            });
        });

        // FAB geolocalización
        document.getElementById('ubicacionBtn').addEventListener('click', () => {
            this.obtenerUbicacion();
        });

        // Búsqueda por dirección
        document.getElementById('buscarBtn').addEventListener('click', () => {
            this.buscarPorDireccion();
        });
        
        document.getElementById('direccionInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.buscarPorDireccion();
            }
        });

        // Slider de radio
        const radioSlider = document.getElementById('radioSlider');
        const radioValue = document.getElementById('radioValue');
        
        radioSlider.addEventListener('input', (e) => {
            this.radioKm = parseInt(e.target.value);
            radioValue.textContent = this.radioKm;
        });

        radioSlider.addEventListener('change', () => {
            this.guardarPreferencias();
            if (this.gasolinerasRaw.length > 0 && this.ubicacionActual) {
                this.procesarGasolineras();
            }
        });
    }

    async obtenerUbicacion() {
        if (!navigator.geolocation) {
            alert('La geolocalización no está soportada en este navegador');
            return;
        }

        this.showLoading(true, 'Obteniendo tu ubicación...');
        this.updateMapInfo('📍 Obteniendo tu ubicación...');

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                this.ubicacionActual = { lat, lng };
                this.mapa.setView([lat, lng], 15, { animate: true });
                
                // Geocodificación inversa para obtener la dirección
                try {
                    this.showLoading(true, 'Obteniendo dirección...');
                    await this.obtenerDireccionGPS(lat, lng);
                } catch (error) {
                    console.error('Error en geocodificación inversa:', error);
                    this.direccionActual = 'Ubicación actual';
                }
                
                this.guardarPreferencias();
                this.updateMapInfo(`📍 ${this.direccionActual}`);
                this.showLoading(true, 'Buscando gasolineras cercanas...');
                await this.buscarGasolineras();
            },
            (error) => {
                this.showLoading(false);
                let mensaje = 'Error al obtener ubicación';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensaje = 'Permiso de ubicación denegado';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensaje = 'Ubicación no disponible';
                        break;
                    case error.TIMEOUT:
                        mensaje = 'Tiempo de espera agotado';
                        break;
                }
                this.updateMapInfo(`❌ ${mensaje}`);
                alert(mensaje);
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 60000
            }
        );
    }

    async obtenerDireccionGPS(lat, lng) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=es`
            );
            const data = await response.json();
            
            if (data && data.display_name) {
                // Extraer partes relevantes de la dirección
                const address = data.address || {};
                let direccionCorta = '';
                
                if (address.road) {
                    direccionCorta += address.road;
                    if (address.house_number) {
                        direccionCorta += ` ${address.house_number}`;
                    }
                }
                
                if (address.city || address.town || address.village) {
                    const localidad = address.city || address.town || address.village;
                    direccionCorta += direccionCorta ? `, ${localidad}` : localidad;
                }
                
                this.direccionActual = direccionCorta || data.display_name.split(',')[0] || 'Ubicación actual';
            } else {
                this.direccionActual = 'Ubicación actual';
            }
        } catch (error) {
            console.error('Error en geocodificación inversa:', error);
            this.direccionActual = 'Ubicación actual';
        }
    }

    async buscarPorDireccion() {
        const direccion = document.getElementById('direccionInput').value.trim();
        if (!direccion) return;

        this.showLoading(true, 'Buscando dirección...');
        this.updateMapInfo('🔍 Buscando dirección...');

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}, España&limit=1&addressdetails=1`
            );
            const data = await response.json();
            
            if (data && data.length > 0) {
                const resultado = data[0];
                const lat = parseFloat(resultado.lat);
                const lng = parseFloat(resultado.lon);
                
                this.ubicacionActual = { lat, lng };
                this.direccionActual = resultado.display_name.split(',')[0] || direccion;
                this.mapa.setView([lat, lng], 15, { animate: true });
                
                this.guardarPreferencias();
                this.updateMapInfo(`📍 ${this.direccionActual}`);
                this.showLoading(true, 'Buscando gasolineras cercanas...');
                await this.buscarGasolineras();
            } else {
                this.showLoading(false);
                this.updateMapInfo('❌ Dirección no encontrada');
                alert('No se encontró la dirección especificada');
            }
        } catch (error) {
            this.showLoading(false);
            console.error('Error en búsqueda:', error);
            this.updateMapInfo('❌ Error en la búsqueda');
            alert('Error al buscar la dirección');
        }
    }

    async buscarGasolineras() {
        try {
            // Verificar caché primero
            const ahora = Date.now();
            if (this.cache.data && this.cache.timestamp && 
                (ahora - this.cache.timestamp < this.cache.duration)) {
                console.log('Usando datos del caché');
                this.gasolinerasRaw = this.cache.data;
                this.procesarGasolineras();
                return;
            }

            this.showLoading(true, 'Cargando datos de gasolineras...');
            this.updateMapInfo('⛽ Cargando datos de gasolineras...');
            
            const response = await fetch(
                'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/'
            );
            
            const data = await response.json();
            
            if (data && data.ListaEESSPrecio) {
                // Filtrar datos válidos y guardar en caché
                this.gasolinerasRaw = data.ListaEESSPrecio.filter(estacion => {
                    return estacion.Latitud && 
                           estacion['Longitud (WGS84)'] && 
                           estacion.Latitud !== '' && 
                           estacion['Longitud (WGS84)'] !== '';
                });
                
                // Actualizar caché
                this.cache.data = this.gasolinerasRaw;
                this.cache.timestamp = ahora;
                
                console.log(`Datos cargados: ${this.gasolinerasRaw.length} gasolineras (guardado en caché)`);
                this.procesarGasolineras();
                
            } else {
                throw new Error('No se recibieron datos válidos');
            }
            
        } catch (error) {
            this.showLoading(false);
            console.error('Error al buscar gasolineras:', error);
            this.updateMapInfo('❌ Error al cargar gasolineras');
            this.mostrarListaVacia('Error al conectar con el servicio de gasolineras');
        }
    }

    procesarGasolineras() {
        if (!this.ubicacionActual || !this.gasolinerasRaw.length) {
            this.showLoading(false);
            return;
        }

        this.showLoading(true, 'Procesando gasolineras...');

        // Procesar de forma asíncrona para mejor rendimiento
        setTimeout(() => {
            // Filtrar por radio de distancia
            const gasolinerasCercanas = this.gasolinerasRaw.filter(estacion => {
                const latEstacion = parseFloat(estacion.Latitud.replace(',', '.'));
                const lngEstacion = parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'));
                
                if (isNaN(latEstacion) || isNaN(lngEstacion)) return false;
                
                const distancia = this.calcularDistancia(
                    this.ubicacionActual.lat, 
                    this.ubicacionActual.lng, 
                    latEstacion, 
                    lngEstacion
                );
                
                return distancia <= this.radioKm;
            });

            console.log(`Gasolineras en radio ${this.radioKm}km: ${gasolinerasCercanas.length}`);

            // Filtrar por combustible con precio válido
            const gasolinerasConPrecio = gasolinerasCercanas.filter(estacion => {
                const precio = estacion[this.combustibleSeleccionado];
                return precio && 
                       precio !== '' && 
                       precio !== '0,000' && 
                       precio !== '0' &&
                       parseFloat(precio.replace(',', '.')) > 0;
            });

            console.log(`Con precio ${this.combustibleSeleccionado}: ${gasolinerasConPrecio.length}`);

            if (gasolinerasConPrecio.length === 0) {
                this.showLoading(false);
                this.updateMapInfo(`❌ No hay gasolineras con el combustible seleccionado en ${this.radioKm}km`);
                this.mostrarListaVacia('No hay gasolineras con el combustible seleccionado en este radio');
                this.limpiarMarcadores();
                return;
            }

            // Ordenar por precio (menor a mayor)
            gasolinerasConPrecio.sort((a, b) => {
                const precioA = parseFloat(a[this.combustibleSeleccionado].replace(',', '.'));
                const precioB = parseFloat(b[this.combustibleSeleccionado].replace(',', '.'));
                return precioA - precioB;
            });

            this.gasolineras = gasolinerasConPrecio;
            this.mostrarGasolinerasEnLista();
            this.mostrarMarcadoresEnMapa();

            this.showLoading(false);
            this.updateMapInfo(`⛽ ${gasolinerasConPrecio.length} gasolineras encontradas - ${this.direccionActual}`);
            document.getElementById('stationsCount').textContent = `${gasolinerasConPrecio.length} estaciones`;
        }, 100);
    }

    mostrarMarcadoresEnMapa() {
        this.limpiarMarcadores();
        
        // Calcular rangos de precios para colores
        const precios = this.gasolineras.map(g => 
            parseFloat(g[this.combustibleSeleccionado].replace(',', '.'))
        );
        const precioMin = Math.min(...precios);
        const precioMax = Math.max(...precios);
        const rango = precioMax - precioMin;

        this.gasolineras.forEach((estacion, index) => {
            const lat = parseFloat(estacion.Latitud.replace(',', '.'));
            const lng = parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'));
            const precio = parseFloat(estacion[this.combustibleSeleccionado].replace(',', '.'));
            
            // Determinar clase de precio
            let priceClass = 'price-low';
            if (rango > 0) {
                const porcentaje = (precio - precioMin) / rango;
                if (porcentaje > 0.66) {
                    priceClass = 'price-high';
                } else if (porcentaje > 0.33) {
                    priceClass = 'price-medium';
                }
            }

            // Obtener nombre de marca limpio
            const marcaNombre = this.limpiarNombreMarca(estacion.Rótulo || 'Gasolinera');

            // Crear marcador personalizado
            const markerHTML = `
                <div class="custom-marker ${priceClass}" data-index="${index}">
                    <div class="marker-brand">${marcaNombre}</div>
                    <div class="marker-price">${precio.toFixed(3)}€</div>
                </div>
            `;

            const marcador = L.marker([lat, lng], {
                icon: L.divIcon({
                    html: markerHTML,
                    className: 'custom-div-icon',
                    iconSize: [60, 40],
                    iconAnchor: [30, 40]
                })
            }).addTo(this.mapa);

            // Eventos del marcador
            marcador.on('click', () => {
                this.seleccionarGasolinera(index, true);
            });

            this.marcadores.push(marcador);
        });

        this.actualizarMarcadores();
    }

    limpiarNombreMarca(nombreCompleto) {
        // Limpiar y acortar nombres de marcas conocidas
        const marcas = {
            'REPSOL': 'REPSOL',
            'CEPSA': 'CEPSA',
            'BP': 'BP',
            'SHELL': 'SHELL',
            'GALP': 'GALP',
            'CAMPSA': 'CAMPSA',
            'BALLENOIL': 'BALLENOIL',
            'PLENOIL': 'PLENOIL',
            'PETRONOR': 'PETRONOR',
            'DISA': 'DISA',
            'SARAS': 'SARAS'
        };

        const nombreUpper = nombreCompleto.toUpperCase();
        for (const [marca, nombre] of Object.entries(marcas)) {
            if (nombreUpper.includes(marca)) {
                return nombre;
            }
        }
        
        // Si no se encuentra marca conocida, usar primeras 8 letras
        return nombreCompleto.length > 8 ? nombreCompleto.substring(0, 8) + '...' : nombreCompleto;
    }

    actualizarMarcadores() {
        // Mostrar/ocultar marcadores según el zoom
        const zoom = this.mapa.getZoom();
        const mostrarMarcadores = zoom >= 12;
        
        this.marcadores.forEach(marcador => {
            if (mostrarMarcadores) {
                if (!this.mapa.hasLayer(marcador)) {
                    marcador.addTo(this.mapa);
                }
            } else {
                if (this.mapa.hasLayer(marcador)) {
                    this.mapa.removeLayer(marcador);
                }
            }
        });
    }

    limpiarMarcadores() {
        this.marcadores.forEach(marcador => {
            this.mapa.removeLayer(marcador);
        });
        this.marcadores = [];
    }

    mostrarGasolinerasEnLista() {
        const lista = document.getElementById('listaGasolineras');
        lista.innerHTML = '';

        // Calcular rangos de precios para colores
        const precios = this.gasolineras.map(g => 
            parseFloat(g[this.combustibleSeleccionado].replace(',', '.'))
        );
        const precioMin = Math.min(...precios);
        const precioMax = Math.max(...precios);
        const rango = precioMax - precioMin;

        this.gasolineras.forEach((estacion, index) => {
            const precio = parseFloat(estacion[this.combustibleSeleccionado].replace(',', '.'));
            const distancia = this.calcularDistancia(
                this.ubicacionActual.lat,
                this.ubicacionActual.lng,
                parseFloat(estacion.Latitud.replace(',', '.')),
                parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'))
            );

            // Determinar clase de precio
            let priceClass = 'low';
            if (rango > 0) {
                const porcentaje = (precio - precioMin) / rango;
                if (porcentaje > 0.66) {
                    priceClass = 'high';
                } else if (porcentaje > 0.33) {
                    priceClass = 'medium';
                }
            }

            const card = document.createElement('div');
            card.className = 'station-card';
            card.dataset.index = index;

            card.innerHTML = `
                <div class="station-header">
                    <h3 class="station-name">${estacion.Rótulo || 'Gasolinera'}</h3>
                    <div class="price-badge ${priceClass}">
                        ${precio.toFixed(3)}€
                    </div>
                </div>
                <div class="station-details">
                    <div class="station-address">
                        📍 ${estacion.Dirección || 'Dirección no disponible'}
                        ${estacion.Municipio ? `, ${estacion.Municipio}` : ''}
                        ${estacion.Provincia ? `, ${estacion.Provincia}` : ''}
                    </div>
                    <div class="station-distance">
                        🚗 ${distancia.toFixed(1)} km
                    </div>
                    <div class="station-actions">
                        <button class="route-btn" onclick="app.abrirGoogleMaps(${index})">
                            Ir 🗺️
                        </button>
                    </div>
                </div>
            `;

            // Evento de clic para selección
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('route-btn')) {
                    this.seleccionarGasolinera(index, false);
                }
            });

            lista.appendChild(card);
        });
    }

    seleccionarGasolinera(index, desdeMarker = false) {
        // Limpiar selección anterior
        document.querySelectorAll('.station-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelectorAll('.custom-marker').forEach(marker => {
            marker.classList.remove('selected');
        });

        // Seleccionar nueva gasolinera
        this.gasolineraSeleccionada = index;
        const card = document.querySelector(`[data-index="${index}"]`);
        const marker = document.querySelector(`.custom-marker[data-index="${index}"]`);
        
        if (card) {
            card.classList.add('selected');
            if (desdeMarker) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        if (marker) {
            marker.classList.add('selected');
        }

        // Centrar mapa en la gasolinera si se seleccionó desde la lista
        if (!desdeMarker && this.gasolineras[index]) {
            const estacion = this.gasolineras[index];
            const lat = parseFloat(estacion.Latitud.replace(',', '.'));
            const lng = parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'));
            this.mapa.setView([lat, lng], Math.max(this.mapa.getZoom(), 15), { animate: true });
        }
    }

    abrirGoogleMaps(index) {
        const estacion = this.gasolineras[index];
        const lat = parseFloat(estacion.Latitud.replace(',', '.'));
        const lng = parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'));
        const nombre = encodeURIComponent(estacion.Rótulo || 'Gasolinera');
        
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${nombre}`;
        window.open(url, '_blank');
    }

    mostrarListaVacia(mensaje = 'No hay gasolineras encontradas') {
        const lista = document.getElementById('listaGasolineras');
        lista.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">⛽</div>
                <p>${mensaje}</p>
                <span class="no-results-subtitle">
                    Prueba aumentar el radio de búsqueda o seleccionar otro combustible
                </span>
            </div>
        `;
        document.getElementById('stationsCount').textContent = '0 estaciones';
    }

    calcularDistancia(lat1, lng1, lat2, lng2) {
        const R = 6371; // Radio de la Tierra en km
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRad(valor) {
        return valor * (Math.PI / 180);
    }

    showLoading(show, texto = 'Cargando...') {
        const loadingElement = document.getElementById('loadingState');
        const loadingText = document.getElementById('loadingText');
        
        if (show) {
            loadingText.textContent = texto;
            loadingElement.classList.remove('hidden');
        } else {
            loadingElement.classList.add('hidden');
        }
    }

    updateMapInfo(texto) {
        document.getElementById('mapInfo').textContent = texto;
    }

    guardarPreferencias() {
        const preferencias = {
            combustible: this.combustibleSeleccionado,
            radio: this.radioKm,
            ubicacion: this.ubicacionActual,
            direccion: this.direccionActual
        };
        localStorage.setItem('gas_preferences', JSON.stringify(preferencias));
        localStorage.setItem('ultima_ubicacion', JSON.stringify(this.ubicacionActual));
    }

    cargarPreferencias() {
        try {
            const preferencias = JSON.parse(localStorage.getItem('gas_preferences'));
            if (preferencias) {
                // Restaurar combustible
                if (preferencias.combustible) {
                    this.combustibleSeleccionado = preferencias.combustible;
                    document.querySelectorAll('.fuel-chip').forEach(chip => {
                        chip.classList.remove('active');
                        if (chip.dataset.fuel === preferencias.combustible) {
                            chip.classList.add('active');
                        }
                    });
                }

                // Restaurar radio
                if (preferencias.radio) {
                    this.radioKm = preferencias.radio;
                    document.getElementById('radioSlider').value = this.radioKm;
                    document.getElementById('radioValue').textContent = this.radioKm;
                }

                // Restaurar ubicación si existe
                if (preferencias.ubicacion) {
                    this.ubicacionActual = preferencias.ubicacion;
                    this.direccionActual = preferencias.direccion || 'Ubicación guardada';
                    this.mapa.setView([this.ubicacionActual.lat, this.ubicacionActual.lng], 15);
                    this.updateMapInfo(`📍 ${this.direccionActual} (guardada)`);
                    
                    // Buscar gasolineras automáticamente
                    setTimeout(() => {
                        this.buscarGasolineras();
                    }, 1000);
                }
            }
        } catch (error) {
            console.error('Error cargando preferencias:', error);
        }
    }
}

// Variable global para acceso desde HTML
let app;

// Inicializar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    app = new GasolinerasApp();
});