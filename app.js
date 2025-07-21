// app.js - Lógica de gasolineras con caché y marcadores personalizados

class GasolinerasApp {
  constructor() {
    this.mapa = null;
    this.marcadores = [];
    this.gasolineras = [];
    this.ubicacionActual = null;
    this.combustibleSeleccionado = 'Precio Gasoleo A';
    this.radioKm = 5;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
    this.cacheTimestamp = 0;
    this.cacheData = null;

    this.colores = {
      barato: '#10b981',
      medio: '#f59e0b',
      caro: '#ef4444'
    };

    this.STORAGE_KEYS = {
      combustible: 'gasolineras_combustible_preferido',
      ubicacion: 'gasolineras_ultima_ubicacion',
      radio: 'gasolineras_radio_preferido'
    };

    this.init();
  }

  /* ---------------------- Inicialización ---------------------- */
  init() {
    this.initMapa();
    this.loadPreferences();
    this.initListeners();
    this.autoStart();
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
  }

  initListeners() {
    document.querySelectorAll('.fuel-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        document.querySelectorAll('.fuel-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.combustibleSeleccionado = e.currentTarget.dataset.fuel;
        this.savePreferences();
        if (this.gasolineras.length) this.processGasStations(this.gasolineras);
      });
    });

    document.getElementById('ubicacionBtn').addEventListener('click', () => this.getLocation());

    document.getElementById('buscarBtn').addEventListener('click', () => this.searchAddress());
    document.getElementById('direccionInput').addEventListener('keypress', e => {
      if (e.key === 'Enter') this.searchAddress();
    });

    const slider = document.getElementById('radioSlider');
    slider.addEventListener('input', e => {
      this.radioKm = parseInt(e.target.value);
      document.getElementById('radioValue').textContent = `${this.radioKm} km`;
      this.savePreferences();
      if (this.gasolineras.length) this.processGasStations(this.gasolineras);
    });
  }

  /* ------------------ Preferencias y persistencia ------------------ */
  loadPreferences() {
    const fuel = localStorage.getItem(this.STORAGE_KEYS.combustible);
    if (fuel) this.combustibleSeleccionado = fuel;

    const radio = localStorage.getItem(this.STORAGE_KEYS.radio);
    if (radio) {
      this.radioKm = parseInt(radio);
      document.getElementById('radioSlider').value = this.radioKm;
      document.getElementById('radioValue').textContent = `${this.radioKm} km`;
    }

    this.updateFuelUI();
  }

  savePreferences() {
    localStorage.setItem(this.STORAGE_KEYS.combustible, this.combustibleSeleccionado);
    localStorage.setItem(this.STORAGE_KEYS.radio, this.radioKm.toString());
    if (this.ubicacionActual) {
      localStorage.setItem(this.STORAGE_KEYS.ubicacion, JSON.stringify(this.ubicacionActual));
    }
  }

  updateFuelUI() {
    document.querySelectorAll('.fuel-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.fuel === this.combustibleSeleccionado);
    });
  }

  /* -------------------- Inicio automático -------------------- */
  async autoStart() {
    this.setMapInfo('🔍 Iniciando aplicación...');

    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
        this.ubicacionActual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.mapa.setView([pos.coords.latitude, pos.coords.longitude], 16);
        await this.reverseGeocode();
        await this.loadGasStations();
        return;
      } catch (e) {
        console.log('GPS falló, usando última ubicación...', e);
      }
    }

    const last = localStorage.getItem(this.STORAGE_KEYS.ubicacion);
    if (last) {
      this.ubicacionActual = JSON.parse(last);
      this.mapa.setView([this.ubicacionActual.lat, this.ubicacionActual.lng], 16);
      await this.loadGasStations();
      return;
    }

    this.setMapInfo('📍 Pulsa 📍 para tu ubicación o busca una dirección');
    document.getElementById('listado').innerHTML = '<div class="loading">Pulsa 📍 o busca una dirección</div>';
  }

  /* -------------------- Geolocalización -------------------- */
  async getLocation() {
    const btn = document.getElementById('ubicacionBtn');
    btn.textContent = '⏳';
    btn.style.transform = 'scale(0.9)';
    this.setMapInfo('🔍 Obteniendo tu ubicación...');

    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }));
      this.ubicacionActual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      this.mapa.setView([pos.coords.latitude, pos.coords.longitude], 16);
      this.savePreferences();
      await this.reverseGeocode();
      await this.loadGasStations();
    } catch (e) {
      this.showError('No se pudo obtener GPS');
    } finally {
      btn.textContent = '📍';
      btn.style.transform = 'scale(1)';
    }
  }

  /* ------------------- Búsqueda de dirección ------------------- */
  async searchAddress() {
    const q = document.getElementById('direccionInput').value.trim();
    if (!q) return alert('Introduce una dirección');
    this.setMapInfo('🔍 Buscando dirección...');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=es`);
      const js = await r.json();
      if (!js.length) throw new Error('No encontrada');
      this.ubicacionActual = { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon) };
      this.mapa.setView([this.ubicacionActual.lat, this.ubicacionActual.lng], 16);
      this.savePreferences();
      await this.loadGasStations();
    } catch (e) {
      this.showError('Dirección no encontrada');
    }
  }

  /* --------------- Geocodificación inversa (dirección) --------------- */
  async reverseGeocode() {
    if (!this.ubicacionActual) return;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${this.ubicacionActual.lat}&lon=${this.ubicacionActual.lng}`);
      const js = await r.json();
      if (js.display_name) this.setMapInfo(`📍 ${js.display_name}`);
    } catch (e) {
      console.log('Reverse geocode failed', e);
    }
  }

  /* -------------------- Carga de gasolineras -------------------- */
  async loadGasStations() {
    this.setMapInfo('⛽ Cargando gasolineras...');
    document.getElementById('listado').innerHTML = '<div class="loading"><div class="loading-spinner"></div>Cargando...</div>';

    // usar caché si no ha expirado
    const now = Date.now();
    if (this.cacheData && now - this.cacheTimestamp < this.cacheTimeout) {
      this.processGasStations(this.cacheData);
      return;
    }

    try {
      const res = await fetch('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/');
      const data = await res.json();
      this.cacheData = data.ListaEESSPrecio;
      this.cacheTimestamp = Date.now();
      this.processGasStations(this.cacheData);
    } catch (e) {
      this.showError('Error al cargar gasolineras');
    }
  }

  /* --------------- Procesar y filtrar gasolineras --------------- */
  processGasStations(raw) {
    if (!this.ubicacionActual) return;
    this.marcadores.forEach(m => this.mapa.removeLayer(m));
    this.marcadores = [];

    const processed = raw
      .map(g => this.mapGasStation(g))
      .filter(g => g && g.dist <= this.radioKm)
      .sort((a, b) => a.precio - b.precio);

    if (!processed.length) {
      this.showError(`No hay gasolineras en ${this.radioKm} km`);
      return;
    }

    this.createMarkers(processed);
    this.renderList(processed);
    this.markUser();
    this.setMapInfo(`✅ ${processed.length} gasolineras encontradas`);
  }

  mapGasStation(g) {
    const lat = parseFloat(g.Latitud.replace(',', '.'));
    const lng = parseFloat(g['Longitud (WGS84)'].replace(',', '.'));
    const price = parseFloat(g[this.combustibleSeleccionado].replace(',', '.'));
    if (isNaN(lat) || isNaN(lng) || isNaN(price) || !price) return null;
    const dist = this.haversine(this.ubicacionActual.lat, this.ubicacionActual.lng, lat, lng);
    return {
      brand: g['Rótulo'] || 'Sin marca',
      dir: g.Dirección,
      mun: g.Municipio,
      prov: g.Provincia,
      lat, lng,
      precio: price,
      dist
    };
  }

  /* -------------------- Crear marcadores -------------------- */
  createMarkers(list) {
    const prices = list.map(g => g.precio);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const tercio = (max - min) / 3;

    list.forEach((g, i) => {
      let cat = 'barato';
      if (g.precio > min + tercio * 2) cat = 'caro';
      else if (g.precio > min + tercio) cat = 'medio';

      const icon = L.divIcon({
        className: `mapa-marker ${cat}`,
        html: `
          <div class="marker-text-container">
            <div class="marker-brand">${g.brand}</div>
            <div class="marker-price-container">
              <div class="marker-circle ${cat}"></div>
              <div class="marker-price">${g.precio.toFixed(3)}€</div>
            </div>
          </div>
        `,
        iconSize: [90, 40],
        iconAnchor: [45, 20]
      });

      const m = L.marker([g.lat, g.lng], { icon });
      m.bindPopup(`<strong>${g.brand}</strong><br>${g.precio.toFixed(3)} €/L<br><small>${g.dir}, ${g.mun}</small>`);
      m.on('click', () => this.selectCard(i));
      m.addTo(this.mapa);
      this.marcadores.push(m);
    });
  }

  /* -------------------- Listado -------------------- */
  renderList(list) {
    const prices = list.map(g => g.precio);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const tercio = (max - min) / 3;

    const html = list.map((g, i) => {
      let cat = 'barato';
      if (g.precio > min + tercio * 2) cat = 'caro';
      else if (g.precio > min + tercio) cat = 'medio';
      return `
        <div class="gasolinera-card" data-i="${i}">
          <div class="gasolinera-header">
            <div class="gasolinera-nombre">${g.brand}</div>
            <div class="precio-badge ${cat}">${g.precio.toFixed(3)} €/L</div>
          </div>
          <div class="gasolinera-info">📍 ${g.dir}, ${g.mun}</div>
          <div class="gasolinera-acciones">
            <div class="gasolinera-distancia">🚗 ${g.dist.toFixed(1)} km</div>
            <button class="ruta-btn" onclick="app.openRoute(${g.lat}, ${g.lng})">🗺️ Ir</button>
          </div>
        </div>
      `;
    }).join('');
    const cont = document.getElementById('listado');
    cont.innerHTML = html;
    cont.querySelectorAll('.gasolinera-card').forEach(el => el.addEventListener('click', e => {
      if (e.target.classList.contains('ruta-btn')) return;
      this.selectCard(parseInt(el.dataset.i));
    }));
  }

  selectCard(i) {
    document.querySelectorAll('.gasolinera-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.gasolinera-card[data-i="${i}"]`);
    if (card) {
      card.classList.add('selected');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (this.marcadores[i]) this.marcadores[i].openPopup();
  }

  /* -------------------- Utilidades -------------------- */
  markUser() {
    if (!this.ubicacionActual) return;
    L.circleMarker([this.ubicacionActual.lat, this.ubicacionActual.lng], {
      radius: 8,
      fillColor: '#1a56db',
      color: 'white',
      weight: 3,
      fillOpacity: 1
    }).addTo(this.mapa).bindPopup('📍 Tú');
  }

  openRoute(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }

  setMapInfo(t) { document.getElementById('mapaInfo').textContent = t; }

  showError(m) {
    this.setMapInfo(`❌ ${m}`);
    document.getElementById('listado').innerHTML = `<div class="loading" style="color:#ef4444;">${m}</div>`;
  }

  haversine(a1, o1, a2, o2) {
    const R = 6371;
    const dLat = ((a2 - a1) * Math.PI) / 180;
    const dLon = ((o2 - o1) * Math.PI) / 180;
    const aa = Math.sin(dLat / 2) ** 2 + Math.cos((a1 * Math.PI) / 180) * Math.cos((a2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  }
}

let app;
window.addEventListener('DOMContentLoaded', () => (app = new GasolinerasApp()));