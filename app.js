// AplicaciÃ³n de Gasolineras EspaÃ±a - VersiÃ³n mejorada
class GasolinerasApp {
    constructor() {
        this.mapa = null;
        this.marcadores = [];
        this.gasolineras = [];
        this.ubicacionActual = null;
        this.combustibleSeleccionado = 'Precio Gasoleo A';
        this.radioKm = 5;
        this.gasolineraSeleccionada = null;

        // ConfiguraciÃ³n de colores para marcadores
        this.colores = {
            barato: '#10b981',
            medio: '#f59e0b',
            caro: '#ef4444'
        };

        this.init();
    }

    init() {
        this.initMapa();
        this.initEventListeners();
        this.updateMapInfo('ðŸ“ Selecciona una ubicaciÃ³n para ver gasolineras');
    }

    initMapa() {
        // Inicializar mapa centrado en EspaÃ±a
        this.mapa = L.map('mapa', {
            center: [40.4168, -3.7038], // Madrid
            zoom: 6,
            zoomControl: true
        });

        // AÃ±adir capa de OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: 'Â© OpenStreetMap contributors'
        }).addTo(this.mapa);

        // Configurar controles del mapa
        this.mapa.zoomControl.setPosition('bottomleft');
    }

    initEventListeners() {
        // Selector de combustible
        document.querySelectorAll('.fuel-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                document.querySelectorAll('.fuel-chip').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.combustibleSeleccionado = e.currentTarget.dataset.fuel;
                if (this.gasolineras.length > 0) {
                    this.procesarGasolineras(this.gasolineras);
                }
            });
        });

        // BotÃ³n de geolocalizaciÃ³n (FAB)
        document.getElementById('ubicacionBtn').addEventListener('click', () => {
            this.obtenerUbicacion();
        });

        // BÃºsqueda por direcciÃ³n
        document.getElementById('buscarBtn').addEventListener('click', () => {
            this.buscarPorDireccion();
        });

        document.getElementById('direccionInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.buscarPorDireccion();
            }
        });

        // Control de radio
        const radioSlider = document.getElementById('radioSlider');
        const radioValue = document.getElementById('radioValue');
        
        radioSlider.addEventListener('input', (e) => {
            this.radioKm = parseInt(e.target.value);
            radioValue.textContent = this.radioKm;
        });

        radioSlider.addEventListener('change', () => {
            if (this.ubicacionActual) {
                this.buscarGasolineras(this.ubicacionActual.lat, this.ubicacionActual.lng);
            }
        });
    }

    obtenerUbicacion() {
        if (!navigator.geolocation) {
            alert('La geolocalizaciÃ³n no estÃ¡ soportada en este navegador');
            return;
        }

        this.showLoading(true);
        this.updateMapInfo('ðŸ“ Obteniendo tu ubicaciÃ³n...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                this.ubicacionActual = { lat, lng };
                
                // Zoom cercano a la ubicaciÃ³n (zoom 16-17 como solicitado)
                this.mapa.setView([lat, lng], 16, { animate: true });
                
                this.updateMapInfo('ðŸ“ UbicaciÃ³n encontrada, buscando gasolineras...');
                this.buscarGasolineras(lat, lng);
            },
            (error) => {
                this.showLoading(false);
                console.error('Error al obtener ubicaciÃ³n:', error);
                
                let mensaje = 'Error al obtener tu ubicaciÃ³n';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        mensaje = 'Permiso de ubicaciÃ³n denegado';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        mensaje = 'UbicaciÃ³n no disponible';
                        break;
                    case error.TIMEOUT:
                        mensaje = 'Tiempo de espera agotado';
                        break;
                }
                
                this.updateMapInfo(`âŒ ${mensaje}`);
                alert(mensaje);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    }

    async buscarPorDireccion() {
        const direccion = document.getElementById('direccionInput').value.trim();
        if (!direccion) return;

        this.showLoading(true);
        this.updateMapInfo('ðŸ” Buscando direcciÃ³n...');

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}, EspaÃ±a&limit=1&addressdetails=1`
            );
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                const resultado = data[0];
                const lat = parseFloat(resultado.lat);
                const lng = parseFloat(resultado.lon);
                
                this.ubicacionActual = { lat, lng };
                
                // Zoom cercano a la direcciÃ³n encontrada
                this.mapa.setView([lat, lng], 16, { animate: true });
                
                this.updateMapInfo('ðŸ“ DirecciÃ³n encontrada, buscando gasolineras...');
                this.buscarGasolineras(lat, lng);
            } else {
                this.showLoading(false);
                this.updateMapInfo('âŒ DirecciÃ³n no encontrada');
                alert('No se pudo encontrar la direcciÃ³n especificada');
            }
        } catch (error) {
            this.showLoading(false);
            console.error('Error en bÃºsqueda:', error);
            this.updateMapInfo('âŒ Error en la bÃºsqueda');
            alert('Error al buscar la direcciÃ³n');
        }
    }

    async buscarGasolineras(lat, lng) {
        try {
            const response = await fetch(
                'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/'
            );
            
            const data = await response.json();
            
            if (data && data.ListaEESSPrecio) {
                // Filtrar por radio de distancia
                const gasolinerasCercanas = data.ListaEESSPrecio.filter(estacion => {
                    if (!estacion.Latitud || !estacion.Longitud) return false;
                    
                    const latEstacion = parseFloat(estacion.Latitud.replace(',', '.'));
                    const lngEstacion = parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'));
                    
                    const distancia = this.calcularDistancia(lat, lng, latEstacion, lngEstacion);
                    return distancia <= this.radioKm;
                });

                this.gasolineras = gasolinerasCercanas;
                this.procesarGasolineras(gasolinerasCercanas);
            } else {
                this.showLoading(false);
                this.updateMapInfo('âŒ No se pudieron cargar las gasolineras');
                alert('Error al cargar los datos de gasolineras');
            }
        } catch (error) {
            this.showLoading(false);
            console.error('Error al buscar gasolineras:', error);
            this.updateMapInfo('âŒ Error al cargar gasolineras');
            alert('Error al conectar con el servicio de gasolineras');
        }
    }

    procesarGasolineras(gasolineras) {
        // Filtrar gasolineras que tienen el combustible seleccionado
        const gasolinerasConPrecio = gasolineras.filter(estacion => {
            const precio = estacion[this.combustibleSeleccionado];
            return precio && precio !== '' && precio !== '0,000';
        });

        if (gasolinerasConPrecio.length === 0) {
            this.showLoading(false);
            this.updateMapInfo('âŒ No hay gasolineras con el combustible seleccionado');
            this.mostrarListaVacia();
            return;
        }

        // ORDENAR POR PRECIO (MENOR A MAYOR) - Requisito principal
        gasolinerasConPrecio.sort((a, b) => {
            const precioA = parseFloat(a[this.combustibleSeleccionado].replace(',', '.'));
            const precioB = parseFloat(b[this.combustibleSeleccionado].replace(',', '.'));
            return precioA - precioB;
        });

        // Calcular rangos de precios para colores
        const precios = gasolinerasConPrecio.map(g => 
            parseFloat(g[this.combustibleSeleccionado].replace(',', '.'))
        );
        const precioMin = Math.min(...precios);
        const precioMax = Math.max(...precios);
        const rango = precioMax - precioMin;

        this.limpiarMarcadores();
        this.mostrarGasolinerasEnMapa(gasolinerasConPrecio, precioMin, rango);
        this.mostrarGasolinerasEnLista(gasolinerasConPrecio, precioMin, rango);

        this.showLoading(false);
        this.updateMapInfo(`â›½ ${gasolinerasConPrecio.length} gasolineras encontradas (ordenadas por precio)`);
        
        // Actualizar contador
        document.getElementById('stationsCount').textContent = 
            `${gasolinerasConPrecio.length} estaciones`;
    }

    mostrarGasolinerasEnMapa(gasolineras, precioMin, rango) {
        gasolineras.forEach((estacion, index) => {
            const lat = parseFloat(estacion.Latitud.replace(',', '.'));
            const lng = parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'));
            const precio = parseFloat(estacion[this.combustibleSeleccionado].replace(',', '.'));

            // Determinar color basado en precio relativo
            let colorClass = 'marker-low';
            if (rango > 0) {
                const porcentaje = (precio - precioMin) / rango;
                if (porcentaje > 0.66) {
                    colorClass = 'marker-high';
                } else if (porcentaje > 0.33) {
                    colorClass = 'marker-medium';
                }
            }

            // Crear marcador pequeÃ±o y sutil
            const marcadorDiv = L.divIcon({
                className: `custom-marker ${colorClass}`,
                iconSize: [16, 16], // Marcadores pequeÃ±os de 16px
                iconAnchor: [8, 8],
                html: ''
            });

            const marcador = L.marker([lat, lng], { 
                icon: marcadorDiv,
                riseOnHover: true
            }).addTo(this.mapa);

            // Evento de clic en marcador
            marcador.on('click', () => {
                this.seleccionarGasolinera(index);
                this.abrirGoogleMaps(estacion);
            });

            // Guardar referencia del marcador
            marcador._estacionIndex = index;
            this.marcadores.push(marcador);
        });
    }

    mostrarGasolinerasEnLista(gasolineras, precioMin, rango) {
        const lista = document.getElementById('listaGasolineras');
        lista.innerHTML = '';

        gasolineras.forEach((estacion, index) => {
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
                    <h3 class="station-name">${estacion.RÃ³tulo || 'Gasolinera'}</h3>
                    <div class="price-badge ${priceClass}">
                        ${precio.toFixed(3)}â‚¬
                    </div>
                </div>
                <div class="station-details">
                    <div class="station-address">
                        ðŸ“ ${estacion.DirecciÃ³n || 'DirecciÃ³n no disponible'}
                        ${estacion.Municipio ? `, ${estacion.Municipio}` : ''}
                        ${estacion.Provincia ? `, ${estacion.Provincia}` : ''}
                    </div>
                    <div class="station-distance">
                        ðŸš— ${distancia.toFixed(1)} km
                    </div>
                </div>
            `;

            // Evento de clic en tarjeta
            card.addEventListener('click', () => {
                this.seleccionarGasolinera(index);
                this.abrirGoogleMaps(estacion);
            });

            lista.appendChild(card);
        });
    }

    seleccionarGasolinera(index) {
        // Limpiar selecciÃ³n anterior
        document.querySelectorAll('.station-card').forEach(card => {
            card.classList.remove('selected');
        });
        this.marcadores.forEach(marcador => {
            marcador.getElement()?.classList.remove('selected');
        });

        // Seleccionar nueva gasolinera
        const card = document.querySelector(`[data-index="${index}"]`);
        if (card) {
            card.classList.add('selected');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const marcador = this.marcadores[index];
        if (marcador) {
            marcador.getElement()?.classList.add('selected');
        }

        this.gasolineraSeleccionada = index;
    }

    abrirGoogleMaps(estacion) {
        const lat = parseFloat(estacion.Latitud.replace(',', '.'));
        const lng = parseFloat(estacion['Longitud (WGS84)'].replace(',', '.'));
        const nombre = encodeURIComponent(estacion.RÃ³tulo || 'Gasolinera');
        
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${nombre}`;
        window.open(url, '_blank');
    }

    mostrarListaVacia() {
        const lista = document.getElementById('listaGasolineras');
        lista.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">â›½</div>
                <p>No hay gasolineras encontradas</p>
                <span class="no-results-subtitle">
                    Prueba aumentar el radio de bÃºsqueda o seleccionar otro combustible
                </span>
            </div>
        `;
        document.getElementById('stationsCount').textContent = '0 estaciones';
    }

    limpiarMarcadores() {
        this.marcadores.forEach(marcador => {
            this.mapa.removeLayer(marcador);
        });
        this.marcadores = [];
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

    showLoading(show) {
        const loadingElement = document.getElementById('loadingState');
        if (show) {
            loadingElement.classList.remove('hidden');
        } else {
            loadingElement.classList.add('hidden');
        }
    }

    updateMapInfo(texto) {
        document.getElementById('mapInfo').textContent = texto;
    }
}

// Inicializar aplicaciÃ³n cuando el DOM estÃ© listo
document.addEventListener('DOMContentLoaded', () => {
    new GasolinerasApp();
});
