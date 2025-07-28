class GasolinerasApp {
    constructor() {
        this.mapa = null;
        this.marcadores = [];
        this.cache = { stamp: 0, data: null, ttl: 5 * 60 * 1000 };
        this.ubicacion = null;
        this.combustible = 'Precio Gasoleo A';
        this.radio = 5;
        this.direccionActual = '';
        this.colores = {
            'muy-barato': '#059669',
            'barato': '#84cc16',
            'medio': '#eab308',
            'caro': '#f97316',
            'muy-caro': '#dc2626'
        };
        this.keys = { fuel: 'fuel_pref', radio: 'radio_pref', loc: 'loc_prev' };
        this.inicializacionTimeout = null;
        this.currentZoom = 13;
        this.estacionesActuales = []; // AÑADIDO: Para guardar las estaciones actuales
        this.init();
    }

    init() {
        try {
            this.iniciarMapa();
            this.cargarPreferencias();
            this.vincularEventos();
            this.inicializacionTimeout = setTimeout(() => {
                if (document.getElementById('mapaInfo').textContent.includes('Iniciando')) {
                    this.setInfo('⚠️ Tarda más de lo normal. Prueba a buscar una ciudad manualmente.');
                }
            }, 10000);
            this.arranqueAutomatico();
        } catch (error) {
            console.error('Error en inicialización:', error);
            this.setInfo('❌ Error al iniciar. Prueba a recargar la página.');
        }
    }

    iniciarMapa() {
        this.mapa = L.map('mapa').setView([40.4168, -3.7038], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.mapa);
        this.mapa.zoomControl.setPosition('bottomleft');
        
        // CORREGIDO: Nueva lógica de transparencia para las 5 mejores
        this.mapa.on('zoomend', () => {
            this.currentZoom = this.mapa.getZoom();
            this.aplicarFiltrosZoomMapa();
        });
    }

    // CORREGIDO: Mostrar solo las 5 mejores (más baratas y cercanas)
    aplicarFiltrosZoomMapa() {
        const zoom = this.currentZoom;
        
        if (zoom < 13) {
            // Calcular las 5 mejores estaciones (precio + distancia)
            const mejoresEstaciones = this.calcularMejoresEstaciones();
            
            this.marcadores.forEach(marker => {
                const esMejor = mejoresEstaciones.some(est => 
                    marker.options.title === est.nombre
                );
                const estaSeleccionado = marker.selected;
                
                if (esMejor || estaSeleccionado) {
                    // Mostrar normal las 5 mejores y las seleccionadas
                    if (!this.mapa.hasLayer(marker)) this.mapa.addLayer(marker);
                    const markerElement = marker.getElement();
                    if (markerElement) markerElement.style.opacity = '1';
                } else {
                    // Mostrar transparente las demás
                    if (!this.mapa.hasLayer(marker)) this.mapa.addLayer(marker);
                    const markerElement = marker.getElement();
                    if (markerElement) markerElement.style.opacity = '0.3';
                }
            });
        } else {
            // Con zoom alto, mostrar todos normalmente
            this.marcadores.forEach(marker => {
                if (!this.mapa.hasLayer(marker)) this.mapa.addLayer(marker);
                const markerElement = marker.getElement();
                if (markerElement) markerElement.style.opacity = '1';
            });
        }
    }

    // NUEVA FUNCIÓN: Calcular las 5 mejores estaciones
    calcularMejoresEstaciones() {
        if (!this.estacionesActuales.length) return [];
        
        // Crear puntuación combinada: 70% precio + 30% distancia
        const estacionesConPuntuacion = this.estacionesActuales.map(est => {
            // Normalizar precio (invertido: menor precio = mejor puntuación)
            const precioMin = Math.min(...this.estacionesActuales.map(e => e.precio));
            const precioMax = Math.max(...this.estacionesActuales.map(e => e.precio));
            const precioPuntuacion = precioMax > precioMin ? 
                (precioMax - est.precio) / (precioMax - precioMin) : 1;
            
            // Normalizar distancia (invertido: menor distancia = mejor puntuación)
            const distMin = Math.min(...this.estacionesActuales.map(e => e.distancia));
            const distMax = Math.max(...this.estacionesActuales.map(e => e.distancia));
            const distPuntuacion = distMax > distMin ? 
                (distMax - est.distancia) / (distMax - distMin) : 1;
            
            // Puntuación combinada
            const puntuacionTotal = (precioPuntuacion * 0.7) + (distPuntuacion * 0.3);
            
            return { ...est, puntuacion: puntuacionTotal };
        });
        
        // Ordenar por puntuación descendente y tomar las 5 mejores
        return estacionesConPuntuacion
            .sort((a, b) => b.puntuacion - a.puntuacion)
            .slice(0, 5);
    }

    cargarPreferencias() {
        try {
            const fuel = localStorage.getItem(this.keys.fuel);
            if (fuel) this.combustible = fuel;
            const radio = localStorage.getItem(this.keys.radio);
            if (radio) {
                this.radio = parseInt(radio);
                document.getElementById('radioSlider').value = this.radio;
                document.getElementById('radioValue').textContent = `${this.radio} km`;
            }
            document.querySelectorAll('.fuel-chip').forEach(c => c.classList.toggle('active', c.dataset.fuel === this.combustible));
        } catch (error) {
            console.error('Error cargando preferencias:', error);
        }
    }

    guardarPreferencias() {
        try {
            localStorage.setItem(this.keys.fuel, this.combustible);
            localStorage.setItem(this.keys.radio, this.radio);
            if (this.ubicacion) localStorage.setItem(this.keys.loc, JSON.stringify(this.ubicacion));
        } catch (error) {
            console.error('Error guardando preferencias:', error);
        }
    }

    vincularEventos() {
        try {
            // Chips de combustible
            document.querySelectorAll('.fuel-chip').forEach(chip => chip.addEventListener('click', e => {
                document.querySelectorAll('.fuel-chip').forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.combustible = e.currentTarget.dataset.fuel;
                this.guardarPreferencias();
                if (this.cache.data) this.procesar(this.cache.data);
            }));

            // Evento click para texto Radio para decrecer radio
            const radioLabel = document.querySelector('.radio-label');
            const radioValue = document.querySelector('.radio-value');
            if (radioLabel) {
                radioLabel.addEventListener('click', () => {
                    if (this.radio > 1) {
                        this.radio -= 1;
                        document.getElementById('radioSlider').value = this.radio;
                        document.getElementById('radioValue').textContent = `${this.radio} km`;
                        this.guardarPreferencias();
                        if (this.cache.data && this.ubicacion) this.procesar(this.cache.data);
                    }
                });
            }
            if (radioValue) {
                radioValue.addEventListener('click', () => {
                    if (this.radio < 25) {
                        this.radio += 1;
                        document.getElementById('radioSlider').value = this.radio;
                        document.getElementById('radioValue').textContent = `${this.radio} km`;
                        this.guardarPreferencias();
                        if (this.cache.data && this.ubicacion) this.procesar(this.cache.data);
                    }
                });
            }

            // Slider radio
            const slider = document.getElementById('radioSlider');
            slider.addEventListener('input', e => {
                this.radio = parseInt(e.target.value);
                document.getElementById('radioValue').textContent = `${this.radio} km`;
                this.guardarPreferencias();
                if (this.cache.data && this.ubicacion) this.procesar(this.cache.data);
            });

            // Campo de búsqueda y botón X
            const inputDireccion = document.getElementById('direccionInput');
            const clearBtn = document.getElementById('clearBtn');
            if (inputDireccion) {
                inputDireccion.addEventListener('input', () => {
                    if (clearBtn) clearBtn.classList.toggle('show', inputDireccion.value.length > 0);
                });
            }
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    if (inputDireccion) {
                        inputDireccion.value = '';
                        clearBtn.classList.remove('show');
                        inputDireccion.focus();
                    }
                });
            }

            // Botón lupa
            const searchBtn = document.getElementById('searchIconBtn');
            if (searchBtn) {
                searchBtn.addEventListener('click', () => this.buscarDireccion());
            }

            // Enter en campo de búsqueda
            if (inputDireccion) {
                inputDireccion.addEventListener('keydown', e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.buscarDireccion();
                    }
                });
            }

            // Botón GPS flotante
            const ubicacionBtn = document.getElementById('ubicacionBtn');
            if (ubicacionBtn) {
                ubicacionBtn.addEventListener('click', () => this.obtenerGPS());
            }

            // Botón centrar en el mapa
            const centrarBtn = document.getElementById('centrarBtn');
            if (centrarBtn) {
                centrarBtn.addEventListener('click', () => this.centrarEnUbicacion());
            }
        } catch (error) {
            console.error('Error vinculando eventos:', error);
        }
    }

    centrarEnUbicacion() {
        if (this.ubicacion) {
            this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
            this.setInfo(`📍 Centrado en tu ubicación`);
        } else {
            this.obtenerGPS();
        }
    }

    async arranqueAutomatico() {
        this.setInfo('🔍 Iniciando…');
        if (navigator.geolocation) {
            try {
                this.setInfo('📍 Obteniendo ubicación GPS...');
                const pos = await Promise.race([
                    new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err, {
                        enableHighAccuracy: true,
                        timeout: 5000
                    })),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 6000))
                ]);
                this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
                if (this.inicializacionTimeout) {
                    clearTimeout(this.inicializacionTimeout);
                }
                await this.reverseGeocode();
                await this.cargarGasolineras();
                return;
            } catch (error) {
                console.log('GPS no disponible o timeout:', error.message);
                this.setInfo('📍 GPS no disponible, probando última ubicación...');
            }
        }

        try {
            const last = localStorage.getItem(this.keys.loc);
            if (last) {
                this.ubicacion = JSON.parse(last);
                this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
                if (this.inicializacionTimeout) {
                    clearTimeout(this.inicializacionTimeout);
                }
                await this.cargarGasolineras();
                return;
            }
        } catch (error) {
            console.log('Error al cargar última ubicación:', error);
        }

        try {
            this.ubicacion = { lat: 40.4168, lng: -3.7038 };
            this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 12);
            if (this.inicializacionTimeout) {
                clearTimeout(this.inicializacionTimeout);
            }
            this.setInfo('📍 Mostrando Madrid. Busca tu ciudad o usa el GPS');
            document.getElementById('direccionInput').placeholder = 'Busca tu ciudad aquí...';
            await this.cargarGasolineras();
        } catch (error) {
            console.error('Error en fallback:', error);
            this.setInfo('❌ Error de conexión. Verifica tu internet y recarga la página.');
        }
    }

    async obtenerGPS() {
        const fab = document.getElementById('ubicacionBtn');
        if (!fab) return;
        const originalText = fab.textContent;
        fab.textContent = '⏳';
        this.setInfo('🔍 Obteniendo GPS…');
        try {
            const pos = await Promise.race([
                new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err, {
                    enableHighAccuracy: true,
                    timeout: 8000
                })),
                new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 10000))
            ]);
            this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
            this.guardarPreferencias();
            await this.reverseGeocode();
            await this.cargarGasolineras();
        } catch (error) {
            console.error('Error GPS:', error);
            this.setInfo('❌ GPS no disponible. Busca tu ciudad manualmente.');
        } finally {
            fab.textContent = originalText;
        }
    }

    async buscarDireccion() {
        const inputElement = document.getElementById('direccionInput');
        if (!inputElement) return;
        const q = inputElement.value.trim();
        if (!q) {
            alert('Introduce una dirección');
            return;
        }
        this.setInfo('🔍 Buscando…');
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=es`;
            const r = await Promise.race([
                fetch(url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Búsqueda timeout')), 10000))
            ]);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const js = await r.json();
            if (!js.length) {
                throw new Error('No se encontró la dirección');
            }
            this.ubicacion = { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon) };
            this.direccionActual = js[0].display_name;
            this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
            this.guardarPreferencias();
            await this.cargarGasolineras();
        } catch (error) {
            console.error('Error búsqueda:', error);
            this.setInfo('❌ No se encontró la dirección. Prueba con otra ciudad.');
        }
    }

    async reverseGeocode() {
        if (!this.ubicacion) return;
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${this.ubicacion.lat}&lon=${this.ubicacion.lng}`;
            const r = await Promise.race([
                fetch(url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Geocoding timeout')), 8000))
            ]);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const js = await r.json();
            if (js.display_name) {
                this.direccionActual = js.display_name;
                const inputElement = document.getElementById('direccionInput');
                const clearBtn = document.getElementById('clearBtn');
                if (inputElement) inputElement.value = js.display_name;
                if (clearBtn) clearBtn.classList.add('show');
                this.setInfo(`📍 ${js.display_name}`);
            }
        } catch (error) {
            console.error('Error geocodificación inversa:', error);
        }
    }

    async cargarGasolineras() {
        this.setInfo('⛽ Cargando gasolineras…');
        const listadoElement = document.getElementById('listado');
        if (listadoElement) {
            listadoElement.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Cargando gasolineras...</div>';
        }

        try {
            const now = Date.now();
            if (this.cache.data && (now - this.cache.stamp) < this.cache.ttl) {
                this.procesar(this.cache.data);
                return;
            }

            const url = `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/`;
            const r = await Promise.race([
                fetch(url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('API timeout')), 15000))
            ]);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            this.cache = { stamp: now, data, ttl: 5 * 60 * 1000 };
            this.procesar(data);
        } catch (error) {
            console.error('Error cargando gasolineras:', error);
            this.setInfo('❌ Error cargando datos. Verifica tu conexión.');
            if (listadoElement) {
                listadoElement.innerHTML = '<div class="loading">❌ Error cargando datos</div>';
            }
        }
    }

    procesar(data) {
        if (!data || !data.ListaEESSPrecio || !this.ubicacion) return;

        const estaciones = data.ListaEESSPrecio
            .map(e => {
                const lat = parseFloat(e.Latitud?.replace(',', '.'));
                const lng = parseFloat(e['Longitud (WGS84)']?.replace(',', '.'));
                const precio = parseFloat(e[this.combustible]?.replace(',', '.'));

                if (!lat || !lng || !precio) return null;

                const dist = this.calcularDistancia(this.ubicacion.lat, this.ubicacion.lng, lat, lng);
                if (dist > this.radio) return null;

                return {
                    id: e.IDEESS,
                    nombre: e['Rótulo'],
                    direccion: e['Dirección'],
                    municipio: e['Municipio'],
                    precio,
                    lat,
                    lng,
                    distancia: dist,
                    horario: e.Horario
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.precio - b.precio);

        // AÑADIDO: Guardar estaciones actuales para cálculos
        this.estacionesActuales = estaciones;

        this.actualizarListado(estaciones);
        this.actualizarMapa(estaciones);
        this.setInfo(`⛽ ${estaciones.length} gasolineras encontradas en ${this.radio}km`);
        
        // Aplicar filtros solo al mapa después de actualizar
        setTimeout(() => this.aplicarFiltrosZoomMapa(), 100);
    }

    calcularDistancia(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    obtenerClasePrecio(precio, precios) {
        const p20 = this.percentil(precios, 20);
        const p40 = this.percentil(precios, 40);
        const p60 = this.percentil(precios, 60);
        const p80 = this.percentil(precios, 80);

        if (precio <= p20) return 'muy-barato';
        if (precio <= p40) return 'barato';
        if (precio <= p60) return 'medio';
        if (precio <= p80) return 'caro';
        return 'muy-caro';
    }

    percentil(arr, p) {
        const sorted = [...arr].sort((a, b) => a - b);
        const index = (p / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index % 1;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    formatearHorario(horario) {
        if (!horario || horario.trim() === '') return 'No disponible';
        
        let horarioLimpio = horario
            .replace(/L-D\s*/g, 'L-D: ')
            .replace(/L-V\s*/g, 'L-V: ')
            .replace(/S-D\s*/g, 'S-D: ')
            .replace(/\s+/g, ' ')
            .trim();

        if (horarioLimpio.length > 50) {
            horarioLimpio = horarioLimpio.substring(0, 47) + '...';
        }

        return horarioLimpio;
    }

    actualizarListado(estaciones) {
        const listado = document.getElementById('listado');
        if (!listado) return;

        if (!estaciones.length) {
            listado.innerHTML = '<div class="loading">❌ No hay gasolineras en este radio</div>';
            return;
        }

        const precios = estaciones.map(e => e.precio);
        listado.innerHTML = estaciones.map(e => {
            const clase = this.obtenerClasePrecio(e.precio, precios);
            const horarioFormateado = this.formatearHorario(e.horario);
            
            return `
                <div class="gasolinera-card ${clase}" data-id="${e.id}">
                    <div class="gasolinera-header">
                        <div class="gasolinera-nombre">${e.nombre}</div>
                        <div class="precio-badge ${clase}">${e.precio.toFixed(3)}€</div>
                    </div>
                    <div class="gasolinera-info">${e.direccion}, ${e.municipio}</div>
                    <div class="gasolinera-horario">🕒 ${horarioFormateado}</div>
                    <div class="gasolinera-acciones">
                        <div class="gasolinera-distancia">${e.distancia.toFixed(1)} km</div>
                        <button class="ruta-btn" onclick="window.open('https://www.google.com/maps/dir/${this.ubicacion.lat},${this.ubicacion.lng}/${e.lat},${e.lng}')">Ruta</button>
                    </div>
                </div>
            `;
        }).join('');

        listado.querySelectorAll('.gasolinera-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                const estacion = estaciones.find(e => e.id === id);
                if (estacion) {
                    this.seleccionarEstacion(estacion);
                }
            });
        });
    }

    seleccionarEstacion(estacion) {
        document.querySelectorAll('.gasolinera-card').forEach(c => c.classList.remove('selected'));
        document.querySelector(`[data-id="${estacion.id}"]`).classList.add('selected');
        
        this.marcadores.forEach(marker => {
            marker.selected = (marker.options.title === estacion.nombre);
        });
        
        this.mapa.setView([estacion.lat, estacion.lng], 16);
        this.setInfo(`📍 ${estacion.nombre} - ${estacion.precio.toFixed(3)}€`);
    }

    actualizarMapa(estaciones) {
        this.marcadores.forEach(m => this.mapa.removeLayer(m));
        this.marcadores = [];

        if (!estaciones.length) return;

        const precios = estaciones.map(e => e.precio);
        estaciones.forEach(e => {
            const clase = this.obtenerClasePrecio(e.precio, precios);
            const marker = L.marker([e.lat, e.lng], {
                icon: L.divIcon({
                    className: `mapa-marker ${clase}`,
                    html: `<div class="marker-container ${clase}">
                        <div class="marker-brand">${e.nombre.substring(0, 12)}</div>
                        <div class="marker-price">${e.precio.toFixed(3)}€</div>
                    </div>`,
                    iconSize: [130, 40], // AUMENTADO: de [90, 40] a [130, 40]
                    iconAnchor: [65, 40]  // AJUSTADO: de [45, 40] a [65, 40]
                }),
                title: e.nombre,
                className: clase
            });

            marker.bindPopup(`
                <strong>${e.nombre}</strong><br>
                ${e.direccion}<br>
                <strong>${e.precio.toFixed(3)}€</strong> - ${e.distancia.toFixed(1)} km<br>
                🕒 ${this.formatearHorario(e.horario)}
            `);

            marker.on('click', () => this.seleccionarEstacion(e));
            marker.selected = false;
            this.marcadores.push(marker);
            marker.addTo(this.mapa);
        });
    }

    setInfo(text) {
        const info = document.getElementById('mapaInfo');
        if (info) info.textContent = text;
    }
}

document.addEventListener('DOMContentLoaded', () => new GasolinerasApp());
