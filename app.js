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
            const logoSVG = this.obtenerLogoSVG(e.nombre);
            const nombreFormateado = this.formatearMarca(e.nombre);
            
            return `
                <div class="gasolinera-card ${clase}" data-id="${e.id}">
                    <div class="gasolinera-header">
                        <div class="gasolinera-brand-wrapper">
                            ${logoSVG}
                            <div class="gasolinera-nombre">${nombreFormateado}</div>
                        </div>
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
        const selectedCard = document.querySelector(`[data-id="${estacion.id}"]`);
        if (selectedCard) selectedCard.classList.add('selected');
        
        this.marcadores.forEach(marker => {
            marker.selected = (marker.options.title === estacion.nombre);
        });
        
        this.mapa.setView([estacion.lat, estacion.lng], 16);
        const nombreFormateado = this.formatearMarca(estacion.nombre);
        this.setInfo(`📍 ${nombreFormateado} - ${estacion.precio.toFixed(3)}€`);
    }

    actualizarMapa(estaciones) {
        this.marcadores.forEach(m => this.mapa.removeLayer(m));
        this.marcadores = [];

        if (!estaciones.length) return;

        const precios = estaciones.map(e => e.precio);
        estaciones.forEach(e => {
            const clase = this.obtenerClasePrecio(e.precio, precios);
            const logoSVG = this.obtenerLogoSVG(e.nombre);
            const nombreFormateado = this.formatearMarca(e.nombre);

            const marker = L.marker([e.lat, e.lng], {
                icon: L.divIcon({
                    className: `mapa-marker ${clase}`,
                    html: `<div class="custom-map-pin ${clase}">
                        <div class="pin-logo-area">
                            ${logoSVG}
                        </div>
                        <div class="pin-price-area">
                            ${e.precio.toFixed(3)}<span class="pin-currency">€</span>
                        </div>
                        <div class="pin-pointer"></div>
                    </div>`,
                    iconSize: [95, 34],
                    iconAnchor: [47.5, 34]
                }),
                title: e.nombre,
                className: clase
            });

            marker.bindPopup(`
                <strong>${nombreFormateado}</strong><br>
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

    obtenerLogoSVG(nombre) {
        const n = nombre.toUpperCase();
        
        if (n.includes('REPSOL')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <ellipse cx="12" cy="6.5" rx="8.5" ry="3.5" fill="#FF4E00" />
                <ellipse cx="12" cy="11.5" rx="9" ry="4" fill="#FFB800" />
                <ellipse cx="12" cy="17" rx="8.5" ry="3.5" fill="#002A54" />
            </svg>`;
        }
        if (n.includes('CEPSA')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#E30613" />
                <path d="M7 12a5 5 0 0 1 8-4M17 12a5 5 0 0 1-8 4" stroke="#FFF" stroke-width="3" fill="none" stroke-linecap="round" />
            </svg>`;
        }
        if (n.includes('BP') || n.includes('BRITISH PETROLEUM')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#00853F" />
                <path d="M12 3 L13.5 8 L18.5 6.5 L15.5 10.5 L20.5 12 L15.5 13.5 L18.5 17.5 L13.5 16 L12 21 L10.5 16 L5.5 17.5 L8.5 13.5 L3.5 12 L8.5 10.5 L5.5 6.5 L10.5 8 Z" fill="#FFD100" />
                <circle cx="12" cy="12" r="4.5" fill="#FFFFFF" />
                <circle cx="12" cy="12" r="2.5" fill="#00853F" />
            </svg>`;
        }
        if (n.includes('GALP')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#FF6600" />
                <path d="M12 4a8 8 0 0 1 8 8c0 4.4-3.6 8-8 8s-8-3.6-8-8c0-2 1-4 3-5.5S10 4 12 4z" fill="#FFF" opacity="0.85"/>
                <circle cx="12" cy="12" r="3.5" fill="#FF6600" />
            </svg>`;
        }
        if (n.includes('SHELL')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#FFD500" />
                <path d="M12 4.5C9.5 4.5 7 6.5 7 10c0 2.5 1.5 5 3 6l-0.8 1.5h5.6L14 16c1.5-1 3-3.5 3-6 0-3.5-2.5-5.5-5-5.5z" fill="#E30613" />
                <path d="M12 6.2c-1.5 0-3 1.2-3 3.8 0 1.8 1 3.5 2.2 4.2l-0.4 1h2.4l-0.4-1c1.2-.7 2.2-2.4 2.2-4.2 0-2.6-1.5-3.8-3-3.8z" fill="#FFD500" />
            </svg>`;
        }
        if (n.includes('PLENOIL')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#002D62" />
                <path d="M12 4.5s5 4 5 8a5 5 0 0 1-10 0c0-4 5-8 5-8z" fill="#FF6600" />
                <path d="M12 6s3 2.5 3 6a3 3 0 0 1-6 0c0-3.5 3-6 3-6z" fill="#FFF" opacity="0.35" />
            </svg>`;
        }
        if (n.includes('BALLENOIL')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#00529B" />
                <path d="M5 12c0-3.5 3-6.5 7-6.5s7 3 7 6.5c0 2-1.5 3.5-3.5 3.5-.8 0-1.5-.3-2-.7l-.5.7h-2l-.5-.7c-.5.4-1.2.7-2 .7-2 0-3.5-1.5-3.5-3.5z" fill="#FFF" />
                <circle cx="12" cy="12" r="2" fill="#00529B" />
            </svg>`;
        }
        if (n.includes('PETROPRIX')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#0099FF" />
                <path d="M8 7h5a3.5 3.5 0 0 1 0 7H10v4H8V7zm2 2v3h3a1.5 1.5 0 1 0 0-3H10z" fill="#FFF" />
                <circle cx="15.5" cy="15.5" r="3.5" fill="#00CC66" />
            </svg>`;
        }
        if (n.includes('AVIA')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#E30613" />
                <path d="M12 5.5 L17.5 16.5 L6.5 16.5 Z" fill="#FFF" />
                <circle cx="12" cy="12.5" r="2.5" fill="#E30613" />
            </svg>`;
        }
        if (n.includes('Q8')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#FF8000" />
                <path d="M12 6a5 5 0 1 0 3 9l2 2v-1a5 5 0 0 0-5-10zm0 2a3 3 0 1 1-3 3 3 3 0 0 1 3-3z" fill="#FFF" />
                <path d="M15 15l2 2" stroke="#FFF" stroke-width="2" stroke-linecap="round" />
            </svg>`;
        }
        if (n.includes('CAMPSA')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#002D62" />
                <path d="M6 7h12v2H6V7zm0 4h12v2H6v-2zm0 4h12v2H6v-2z" fill="#FFD100" />
                <path d="M9 5h6v14H9V5z" fill="#E30613" />
            </svg>`;
        }
        if (n.includes('PETRONOR')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#006633" />
                <path d="M6 8 L18 8 L12 18 Z" fill="#FFF" />
                <path d="M8 9 L16 9 L12 16 Z" fill="#E30613" />
            </svg>`;
        }
        if (n.includes('BONAREA')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#00A2E8" />
                <path d="M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0V8z" fill="#FFF" />
                <circle cx="12" cy="12" r="2.5" fill="#3F48CC" />
            </svg>`;
        }
        if (n.includes('VALCARCE')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#1A1A1A" />
                <path d="M12 4.5 L19.5 12 L12 19.5 L4.5 12 Z" fill="#E30613" />
                <circle cx="12" cy="12" r="3.5" fill="#FFF" />
            </svg>`;
        }
        if (n.includes('CARREFOUR')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#0056B3" />
                <path d="M12 6a6 6 0 0 0-6 6c0 3.3 2.7 6 6 6l-2-6 2-6z" fill="#E30613" />
                <path d="M12 6c3.3 0 6 2.7 6 6 0 3.3-2.7 6-6 6l2-6-2-6z" fill="#FFF" />
            </svg>`;
        }
        if (n.includes('ALCAMPO')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#E30613" />
                <path d="M7 14c1.5-2 4-5 6-5s3 2 3 3-1 3-3 3-4-1-6-1z" fill="#FFF" />
                <circle cx="15" cy="11" r="2" fill="#E30613" />
            </svg>`;
        }
        if (n.includes('EROSKI')) {
            return `<svg viewBox="0 0 24 24" style="display:block;">
                <circle cx="12" cy="12" r="10" fill="#E30613" />
                <circle cx="12" cy="12" r="5" fill="#FFF" />
                <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill="#0056B3" />
            </svg>`;
        }
        
        return `<svg viewBox="0 0 24 24" style="display:block;">
            <circle cx="12" cy="12" r="10" fill="#475569" />
            <path d="M8.5 7.5h5c.8 0 1.5.7 1.5 1.5v7.5H8.5V7.5zm7.5 3.8c0-1.1-.8-1.9-1.9-1.9H13v6c0 .4.4.8.8.8s.8-.4.8-.8v-3h.8v2.2c0 .4.4.8.8.8s.8-.4.8-.8v-3.8zm-5-2.2H9.8v1.5h1.2V9.1zm0 3H9.8v1.5h1.2v-1.5z" fill="#FFF" />
        </svg>`;
    }

    formatearMarca(nombre) {
        const n = nombre.toUpperCase();
        if (n.includes('REPSOL')) return 'Repsol';
        if (n.includes('CEPSA')) return 'Cepsa';
        if (n.includes('BP') || n.includes('BRITISH PETROLEUM')) return 'BP';
        if (n.includes('GALP')) return 'Galp';
        if (n.includes('SHELL')) return 'Shell';
        if (n.includes('PLENOIL')) return 'Plenoil';
        if (n.includes('BALLENOIL')) return 'Ballenoil';
        if (n.includes('PETROPRIX')) return 'Petroprix';
        if (n.includes('AVIA')) return 'Avia';
        if (n.includes('Q8')) return 'Q8';
        if (n.includes('CAMPSA')) return 'Campsa';
        if (n.includes('PETRONOR')) return 'Petronor';
        if (n.includes('BONAREA')) return 'Bonarea';
        if (n.includes('VALCARCE')) return 'Valcarce';
        if (n.includes('CARREFOUR')) return 'Carrefour';
        if (n.includes('ALCAMPO')) return 'Alcampo';
        if (n.includes('EROSKI')) return 'Eroski';
        
        return nombre.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    setInfo(text) {
        const info = document.getElementById('mapaInfo');
        if (info) info.textContent = text;
    }
}

document.addEventListener('DOMContentLoaded', () => new GasolinerasApp());
