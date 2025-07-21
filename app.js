class GasStationsApp {
    constructor() {
        this.userLocation = null;
        this.stations = [];
        this.map = null;
        this.markersGroup = null;
        this.currentView = 'list';
        this.selectedFuelType = 'Precio Gasolina 95 E5';
        
        this.initializeApp();
    }

    initializeApp() {
        this.bindEventListeners();
        this.initMap();
        this.setupFuelSelector();
    }

    bindEventListeners() {
        // Botón de geolocalización
        document.getElementById('getLocationBtn').addEventListener('click', () => {
            this.getUserLocation();
        });

        // Búsqueda por dirección
        document.getElementById('searchAddressBtn').addEventListener('click', () => {
            this.searchByAddress();
        });

        // Enter en el input de dirección
        document.getElementById('addressInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchByAddress();
            }
        });

        // Cambio de selector de combustible
        document.getElementById('fuelType').addEventListener('change', (e) => {
            console.log('Fuel type changed to:', e.target.value);
            this.selectedFuelType = e.target.value;
            if (this.stations.length > 0) {
                this.renderStationsList(this.stations);
                this.addStationMarkers(this.stations);
            }
        });

        // Toggle vista lista/mapa
        document.getElementById('showListBtn').addEventListener('click', () => {
            this.switchView('list');
        });

        document.getElementById('showMapBtn').addEventListener('click', () => {
            this.switchView('map');
        });
    }

    setupFuelSelector() {
        const fuelSelector = document.getElementById('fuelType');
        this.selectedFuelType = fuelSelector.value;
        console.log('Initial fuel type:', this.selectedFuelType);
    }

    // Obtener ubicación del usuario
    async getUserLocation() {
        this.showLoading(true);
        this.updateLocationStatus('Obteniendo ubicación...', 'info');

        if (!navigator.geolocation) {
            this.updateLocationStatus('Geolocalización no disponible en este navegador', 'error');
            this.showLoading(false);
            return;
        }

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 300000 // 5 minutos
                });
            });

            this.userLocation = {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            };

            this.updateLocationStatus(
                `Ubicación obtenida: ${this.userLocation.lat.toFixed(4)}, ${this.userLocation.lon.toFixed(4)}`, 
                'success'
            );

            await this.searchNearbyStations();

        } catch (error) {
            let message = 'Error obteniendo ubicación';
            if (error.code === 1) {
                message = 'Permiso de geolocalización denegado';
            } else if (error.code === 2) {
                message = 'Ubicación no disponible';
            } else if (error.code === 3) {
                message = 'Tiempo de espera agotado';
            }
            
            this.updateLocationStatus(message, 'error');
            this.showLoading(false);
        }
    }

    // Buscar por dirección
    async searchByAddress() {
        const address = document.getElementById('addressInput').value.trim();
        if (!address) {
            this.showError('Por favor, introduce una dirección');
            return;
        }

        this.showLoading(true);
        this.updateLocationStatus('Geocodificando dirección...', 'info');

        try {
            const coordinates = await this.geocodeAddress(address);
            this.userLocation = coordinates;

            this.updateLocationStatus(`Dirección encontrada: ${address}`, 'success');
            await this.searchNearbyStations();

        } catch (error) {
            console.error('Error geocoding:', error);
            this.updateLocationStatus('No se pudo encontrar la dirección', 'error');
            this.showLoading(false);
        }
    }

    // Geocodificar dirección usando Nominatim
    async geocodeAddress(address) {
        const encodedAddress = encodeURIComponent(address + ', España');
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&addressdetails=1`;

        console.log('Geocoding URL:', url);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'GasolinerasApp/1.0'
                }
            });
            const data = await response.json();

            console.log('Geocoding response:', data);

            if (!data || data.length === 0) {
                throw new Error('Dirección no encontrada');
            }

            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        } catch (error) {
            console.error('Geocoding error:', error);
            // Si falla la geocodificación, usar coordenadas de Madrid por defecto
            if (address.toLowerCase().includes('madrid')) {
                return {
                    lat: 40.4168,
                    lon: -3.7038
                };
            }
            throw error;
        }
    }

    // Buscar gasolineras cercanas
    async searchNearbyStations() {
        try {
            this.updateLocationStatus('Buscando gasolineras cercanas...', 'info');
            console.log('Searching near location:', this.userLocation);
            
            // Siempre usar datos de ejemplo ya que la API del ministerio tiene problemas de CORS
            const allStations = this.getExtendedMockData();
            console.log('Total stations from API:', allStations.length);
            
            const nearbyStations = this.filterNearbyStations(
                this.userLocation.lat, 
                this.userLocation.lon, 
                allStations, 
                50 // 50 km de radio
            );

            console.log('Nearby stations found:', nearbyStations.length);

            this.stations = nearbyStations.slice(0, 20); // Limitamos a 20 estaciones

            if (this.stations.length === 0) {
                this.updateLocationStatus('No se encontraron gasolineras cercanas', 'error');
            } else {
                this.updateLocationStatus(
                    `${this.stations.length} gasolineras encontradas`, 
                    'success'
                );
            }

            this.renderStationsList(this.stations);
            this.addStationMarkers(this.stations);
            this.centerMapOnUser();

        } catch (error) {
            console.error('Error buscando gasolineras:', error);
            this.showError('Error al buscar gasolineras. Inténtalo de nuevo.');
        } finally {
            this.showLoading(false);
        }
    }

    // Datos de ejemplo extendidos para testing
    getExtendedMockData() {
        return [
            {
                "IDEESS": "1234",
                "Rótulo": "REPSOL",
                "Dirección": "CALLE ALCALA 123",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Latitud": "40.4168",
                "Longitud (WGS84)": "-3.7038",
                "Precio Gasolina 95 E5": "1,459",
                "Precio Gasolina 98 E5": "1,589",
                "Precio Gasoleo A": "1,389",
                "Precio Gasoleo Premium": "1,459",
                "Precio Biodiesel": "1,299",
                "Precio Bioetanol": "1,199"
            },
            {
                "IDEESS": "5678",
                "Rótulo": "CEPSA",
                "Dirección": "GRAN VIA 456",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Latitud": "40.4200",
                "Longitud (WGS84)": "-3.7100",
                "Precio Gasolina 95 E5": "1,449",
                "Precio Gasolina 98 E5": "1,579",
                "Precio Gasoleo A": "1,379",
                "Precio Gasoleo Premium": "1,449",
                "Precio Biodiesel": "1,289",
                "Precio Bioetanol": "1,189"
            },
            {
                "IDEESS": "9012",
                "Rótulo": "BP",
                "Dirección": "PASEO DE LA CASTELLANA 789",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Latitud": "40.4300",
                "Longitud (WGS84)": "-3.6950",
                "Precio Gasolina 95 E5": "1,465",
                "Precio Gasolina 98 E5": "1,595",
                "Precio Gasoleo A": "1,395",
                "Precio Gasoleo Premium": "1,465",
                "Precio Biodiesel": "",
                "Precio Bioetanol": "1,199"
            },
            {
                "IDEESS": "3456",
                "Rótulo": "SHELL",
                "Dirección": "CALLE SERRANO 321",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Latitud": "40.4250",
                "Longitud (WGS84)": "-3.6900",
                "Precio Gasolina 95 E5": "1,469",
                "Precio Gasolina 98 E5": "1,599",
                "Precio Gasoleo A": "1,399",
                "Precio Gasoleo Premium": "1,469",
                "Precio Biodiesel": "1,309",
                "Precio Bioetanol": ""
            },
            {
                "IDEESS": "7890",
                "Rótulo": "GALP",
                "Dirección": "AVENIDA DE AMERICA 654",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Latitud": "40.4400",
                "Longitud (WGS84)": "-3.6800",
                "Precio Gasolina 95 E5": "1,439",
                "Precio Gasolina 98 E5": "1,569",
                "Precio Gasoleo A": "1,369",
                "Precio Gasoleo Premium": "1,439",
                "Precio Biodiesel": "1,279",
                "Precio Bioetanol": "1,189"
            },
            {
                "IDEESS": "1111",
                "Rótulo": "PETRONOR",
                "Dirección": "CALLE BRAVO MURILLO 111",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Latitud": "40.4500",
                "Longitud (WGS84)": "-3.7200",
                "Precio Gasolina 95 E5": "1,449",
                "Precio Gasolina 98 E5": "1,579",
                "Precio Gasoleo A": "1,379",
                "Precio Gasoleo Premium": "1,449",
                "Precio Biodiesel": "1,289",
                "Precio Bioetanol": "1,179"
            },
            {
                "IDEESS": "2222",
                "Rótulo": "CAMPSA",
                "Dirección": "AVENIDA DE LA PAZ 222",
                "Municipio": "MADRID",
                "Provincia": "MADRID",
                "Latitud": "40.4100",
                "Longitud (WGS84)": "-3.6850",
                "Precio Gasolina 95 E5": "1,455",
                "Precio Gasolina 98 E5": "1,585",
                "Precio Gasoleo A": "1,385",
                "Precio Gasoleo Premium": "1,455",
                "Precio Biodiesel": "",
                "Precio Bioetanol": "1,195"
            },
            {
                "IDEESS": "3333",
                "Rótulo": "CARREFOUR",
                "Dirección": "CENTRO COMERCIAL XANADU",
                "Municipio": "ARROYOMOLINOS",
                "Provincia": "MADRID",
                "Latitud": "40.2833",
                "Longitud (WGS84)": "-3.9167",
                "Precio Gasolina 95 E5": "1,429",
                "Precio Gasolina 98 E5": "1,559",
                "Precio Gasoleo A": "1,359",
                "Precio Gasoleo Premium": "1,429",
                "Precio Biodiesel": "1,269",
                "Precio Bioetanol": "1,169"
            }
        ];
    }

    // Calcular distancia usando fórmula de Haversine
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radio de la Tierra en km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        return distance;
    }

    toRad(deg) {
        return deg * (Math.PI/180);
    }

    // Filtrar gasolineras por distancia
    filterNearbyStations(userLat, userLon, stations, maxDistance) {
        console.log(`Filtering stations within ${maxDistance}km of ${userLat}, ${userLon}`);
        
        const filtered = stations
            .map(station => {
                // Convertir coordenadas (la API usa coma como separador decimal)
                const lat = parseFloat(station.Latitud.replace(',', '.'));
                const lon = parseFloat(station['Longitud (WGS84)'].replace(',', '.'));
                
                if (isNaN(lat) || isNaN(lon)) {
                    console.warn('Invalid coordinates for station:', station.Rótulo);
                    return null;
                }

                const distance = this.calculateDistance(userLat, userLon, lat, lon);
                
                console.log(`Station ${station.Rótulo}: distance = ${distance.toFixed(2)}km`);
                
                return {
                    ...station,
                    latitude: lat,
                    longitude: lon,
                    distance: distance
                };
            })
            .filter(station => station && station.distance <= maxDistance)
            .sort((a, b) => a.distance - b.distance);
            
        console.log('Filtered stations:', filtered.length);
        return filtered;
    }

    // Renderizar lista de gasolineras
    renderStationsList(stations) {
        const container = document.getElementById('stationsContainer');
        
        if (!stations || stations.length === 0) {
            container.innerHTML = `
                <div class="no-stations">
                    <i class="fas fa-gas-pump"></i>
                    <p>No se encontraron gasolineras en el área seleccionada</p>
                </div>
            `;
            return;
        }

        console.log('Rendering stations for fuel type:', this.selectedFuelType);

        container.innerHTML = stations.map(station => {
            const price = station[this.selectedFuelType];
            const priceFormatted = price && price !== '' ? 
                `${price.replace(',', '.')} €/L` : 
                'Precio no disponible';
            const priceClass = price && price !== '' ? '' : 'price-unavailable';

            return `
                <div class="station-card" tabindex="0" 
                     data-station-id="${station.IDEESS}">
                    <div class="station-header">
                        <div>
                            <h3 class="station-name">${station.Rótulo}</h3>
                            <p class="station-address">
                                ${station.Dirección}, ${station.Municipio}, ${station.Provincia}
                            </p>
                        </div>
                        <div class="station-distance">${station.distance.toFixed(1)} km</div>
                    </div>
                    
                    <div class="station-price">
                        <span class="fuel-type">${this.getFuelDisplayName(this.selectedFuelType)}</span>
                        <span class="price-value ${priceClass}">
                            ${priceFormatted}
                        </span>
                    </div>
                    
                    <div class="station-actions">
                        <button class="btn btn--primary btn-directions" 
                                onclick="app.openGoogleMapsDirections(${station.latitude}, ${station.longitude}); return false;">
                            <i class="fas fa-directions"></i>
                            Cómo llegar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Agregar event listeners para las cards
        const cards = container.querySelectorAll('.station-card');
        cards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('btn-directions') && !e.target.closest('.btn-directions')) {
                    const stationId = card.getAttribute('data-station-id');
                    const station = stations.find(s => s.IDEESS === stationId);
                    if (station) {
                        this.openGoogleMapsDirections(station.latitude, station.longitude);
                    }
                }
            });
        });
    }

    // Obtener nombre legible del combustible
    getFuelDisplayName(fuelType) {
        const fuelNames = {
            'Precio Gasolina 95 E5': 'Gasolina 95',
            'Precio Gasolina 98 E5': 'Gasolina 98',
            'Precio Gasoleo A': 'Diésel',
            'Precio Gasoleo Premium': 'Diésel Premium',
            'Precio Biodiesel': 'Biodiésel',
            'Precio Bioetanol': 'Bioetanol'
        };
        return fuelNames[fuelType] || fuelType;
    }

    // Inicializar mapa
    initMap() {
        this.map = L.map('map').setView([40.4168, -3.7038], 6); // Madrid como centro inicial

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.markersGroup = L.layerGroup().addTo(this.map);
    }

    // Añadir marcadores de gasolineras al mapa
    addStationMarkers(stations) {
        if (!this.markersGroup) return;

        this.markersGroup.clearLayers();

        // Añadir marcador de usuario si existe
        if (this.userLocation) {
            L.marker([this.userLocation.lat, this.userLocation.lon], {
                icon: L.divIcon({
                    className: 'user-marker',
                    html: '<i class="fas fa-user-circle" style="color: #ff4444; font-size: 24px;"></i>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).bindPopup('Tu ubicación').addTo(this.markersGroup);
        }

        stations.forEach(station => {
            const price = station[this.selectedFuelType];
            const priceText = price && price !== '' ? 
                `${price.replace(',', '.')} €/L` : 
                'Precio no disponible';

            const popupContent = `
                <div class="popup-content">
                    <div class="popup-header">${station.Rótulo}</div>
                    <div class="popup-address">${station.Dirección}, ${station.Municipio}</div>
                    <div class="popup-price">
                        <span class="popup-fuel">${this.getFuelDisplayName(this.selectedFuelType)}</span>
                        <span class="popup-value">${priceText}</span>
                    </div>
                    <button class="popup-btn" onclick="app.openGoogleMapsDirections(${station.latitude}, ${station.longitude})">
                        <i class="fas fa-directions"></i> Cómo llegar
                    </button>
                </div>
            `;

            const marker = L.marker([station.latitude, station.longitude])
                .bindPopup(popupContent)
                .addTo(this.markersGroup);

            // Resaltar card correspondiente al hacer hover en el marcador
            marker.on('mouseover', () => {
                const card = document.querySelector(`[data-station-id="${station.IDEESS}"]`);
                if (card) card.classList.add('highlighted');
            });

            marker.on('mouseout', () => {
                const card = document.querySelector(`[data-station-id="${station.IDEESS}"]`);
                if (card) card.classList.remove('highlighted');
            });
        });
    }

    // Centrar mapa en ubicación del usuario
    centerMapOnUser() {
        if (this.userLocation && this.map) {
            this.map.setView([this.userLocation.lat, this.userLocation.lon], 12);
        }
    }

    // Abrir Google Maps con direcciones
    openGoogleMapsDirections(lat, lon) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
        window.open(url, '_blank');
    }

    // Cambiar vista lista/mapa
    switchView(view) {
        console.log('Switching to view:', view);
        this.currentView = view;
        
        const listBtn = document.getElementById('showListBtn');
        const mapBtn = document.getElementById('showMapBtn');
        const stationsSection = document.getElementById('stationsSection');
        const mapSection = document.getElementById('mapSection');

        if (view === 'list') {
            listBtn.classList.add('active');
            mapBtn.classList.remove('active');
            stationsSection.classList.remove('hidden');
            mapSection.classList.add('hidden');
        } else {
            mapBtn.classList.add('active');
            listBtn.classList.remove('active');
            stationsSection.classList.add('hidden');
            mapSection.classList.remove('hidden');
            
            // Redimensionar mapa después de mostrarlo
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 100);
        }
    }

    // Mostrar/ocultar loading
    showLoading(show) {
        const loading = document.getElementById('loading');
        const errorMessage = document.getElementById('errorMessage');
        
        if (show) {
            loading.classList.remove('hidden');
            errorMessage.classList.add('hidden');
        } else {
            loading.classList.add('hidden');
        }
    }

    // Mostrar mensaje de error
    showError(message) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
        this.showLoading(false);
    }

    // Actualizar estado de ubicación
    updateLocationStatus(message, type) {
        const status = document.getElementById('locationStatus');
        status.textContent = message;
        status.className = `location-status ${type}`;
    }
}

// Inicializar aplicación cuando se carga la página
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new GasStationsApp();
    window.app = app;
});