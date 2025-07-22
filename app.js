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
    
    // MEJORA: Timeout para evitar bloqueos
    this.inicializacionTimeout = null;
    
    this.init();
  }

  init() {
    try {
      this.iniciarMapa();
      this.cargarPreferencias();
      this.vincularEventos();
      
      // MEJORA: Timeout de seguridad
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '© OpenStreetMap' }).addTo(this.mapa);
    this.mapa.zoomControl.setPosition('bottomleft');
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
      
      document.querySelectorAll('.fuel-chip').forEach(c =>
        c.classList.toggle('active', c.dataset.fuel === this.combustible));
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
      document.querySelectorAll('.fuel-chip').forEach(chip =>
        chip.addEventListener('click', e => {
          document.querySelectorAll('.fuel-chip').forEach(c => c.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.combustible = e.currentTarget.dataset.fuel;
          this.guardarPreferencias();
          if (this.cache.data) this.procesar(this.cache.data);
        }));

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

  // MEJORA: Arranque automático con timeouts y fallbacks
  async arranqueAutomatico() {
    this.setInfo('🔍 Iniciando…');
    
    // MEJORA: Timeout más corto para GPS
    if (navigator.geolocation) {
      try {
        this.setInfo('📍 Obteniendo ubicación GPS...');
        const pos = await Promise.race([
          new Promise((ok, err) =>
            navigator.geolocation.getCurrentPosition(ok, err, { 
              enableHighAccuracy: true, 
              timeout: 5000  // REDUCIDO de 8000 a 5000ms
            })),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('GPS timeout')), 6000)) // Timeout adicional
        ]);
        
        this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
        
        // Limpiar timeout de inicialización
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
    
    // MEJORA: Intentar con última ubicación
    try {
      const last = localStorage.getItem(this.keys.loc);
      if (last) {
        this.ubicacion = JSON.parse(last);
        this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
        
        // Limpiar timeout de inicialización
        if (this.inicializacionTimeout) {
          clearTimeout(this.inicializacionTimeout);
        }
        
        await this.cargarGasolineras();
        return;
      }
    } catch (error) {
      console.log('Error al cargar última ubicación:', error);
    }
    
    // MEJORA: Fallback - cargar Madrid por defecto
    try {
      this.ubicacion = { lat: 40.4168, lng: -3.7038 }; // Madrid
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 12);
      
      // Limpiar timeout de inicialización
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
        new Promise((ok, err) =>
          navigator.geolocation.getCurrentPosition(ok, err, { 
            enableHighAccuracy: true, 
            timeout: 8000 
          })),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('GPS timeout')), 10000))
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
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Búsqueda timeout')), 10000))
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
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Geocoding timeout')), 8000))
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
      // No es crítico, continuar sin mostrar error al usuario
    }
  }

  // MEJORA: Carga de gasolineras con mejor manejo de errores
  async cargarGasolineras() {
    this.setInfo('⛽ Cargando gasolineras…');
    const listadoElement = document.getElementById('listado');
    if (listadoElement) {
      listadoElement.innerHTML = `
        <div class="loading">
          <div class="loading-spinner"></div>
          Cargando gasolineras oficiales...
        </div>
      `;
    }
    
    const now = Date.now();
    if (this.cache.data && now - this.cache.stamp < this.cache.ttl) {
      this.procesar(this.cache.data);
      return;
    }
    
    try {
      const r = await Promise.race([
        fetch('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('API timeout')), 15000))
      ]);
      
      if (!r.ok) {
        throw new Error(`HTTP error! status: ${r.status}`);
      }
      
      const js = await r.json();
      if (!js.ListaEESSPrecio) {
        throw new Error('Datos de API inválidos');
      }
      
      this.cache = { stamp: now, data: js.ListaEESSPrecio, ttl: this.cache.ttl };
      this.procesar(this.cache.data);
    } catch (error) {
      console.error('Error cargando gasolineras:', error);
      this.setInfo('❌ Error cargando datos oficiales');
      if (listadoElement) {
        listadoElement.innerHTML = `
          <div class="loading">
            ❌ No se pudieron cargar las gasolineras.<br>
            <small>Verifica tu conexión a internet y recarga la página</small>
          </div>
        `;
      }
    }
  }

  procesar(arr) {
    if (!this.ubicacion || !arr) {
      this.setInfo('❌ No hay ubicación o datos disponibles');
      return;
    }
    
    try {
      this.marcadores.forEach(m => this.mapa.removeLayer(m));
      this.marcadores = [];
      
      const lista = arr.map(g => {
        try {
          const lat = parseFloat(g.Latitud?.replace(',', '.'));
          const lng = parseFloat(g['Longitud (WGS84)']?.replace(',', '.'));
          const price = parseFloat(g[this.combustible]?.replace(',', '.'));
          
          if (isNaN(lat) || isNaN(lng) || isNaN(price) || price === 0) return null;
          
          const dist = this.dist(this.ubicacion.lat, this.ubicacion.lng, lat, lng);
          if (dist > this.radio) return null;
          
          return { 
            brand: g['Rótulo'] || 'Sin marca', 
            dir: g.Dirección || 'Sin dirección', 
            mun: g.Municipio || '', 
            lat, lng, 
            precio: price, 
            dist 
          };
        } catch (error) {
          return null;
        }
      }).filter(Boolean)
      .sort((a, b) => {
        if (Math.abs(a.precio - b.precio) < 0.001) return a.dist - b.dist;
        return a.precio - b.precio;
      });
      
      if (!lista.length) {
        this.setInfo(`❌ Sin gasolineras en ${this.radio} km`);
        const listadoElement = document.getElementById('listado');
        if (listadoElement) {
          listadoElement.innerHTML = `
            <div class="loading">
              No se encontraron gasolineras en el radio seleccionado.<br>
              <small>Intenta aumentar el radio de búsqueda</small>
            </div>
          `;
        }
        return;
      }
      
      this.marcar(lista);
      this.listar(lista);
      this.marcarUsuario();
      this.setInfo(`✅ ${lista.length} gasolineras encontradas`);
    } catch (error) {
      console.error('Error procesando datos:', error);
      this.setInfo('❌ Error procesando gasolineras');
    }
  }

  determinarCategoria(precio, min, max) {
    if (max === min) return 'muy-barato';
    
    const rango = max - min;
    const margen25 = rango * 0.25;
    
    if (precio === min) {
      return 'muy-barato';
    } else if (precio === max) {
      return 'muy-caro';
    } else if (precio <= min + margen25) {
      return 'barato';
    } else if (precio >= max - margen25) {
      return 'caro';
    } else {
      return 'medio';
    }
  }

  marcar(lista) {
    if (!lista.length) return;
    
    try {
      const min = Math.min(...lista.map(g => g.precio));
      const max = Math.max(...lista.map(g => g.precio));
      
      lista.forEach((g, i) => {
        const cat = this.determinarCategoria(g.precio, min, max);
        
        const icon = L.divIcon({
          className: `mapa-marker`,
          html: `
            <div class="marker-container ${cat}">
              <div class="marker-text">
                <div class="marker-brand">${g.brand}</div>
                <div class="marker-price">${g.precio.toFixed(3)}€</div>
              </div>
            </div>`,
          iconSize: [85, 32],
          iconAnchor: [42, 16]
        });
        
        const m = L.marker([g.lat, g.lng], { icon }).addTo(this.mapa);
        m.bindPopup(`<strong>${g.brand}</strong><br>${g.precio.toFixed(3)} €/L<br><small>${g.dir}, ${g.mun}</small>`);
        m.on('click', () => this.selectCard(i));
        this.marcadores.push(m);
      });
    } catch (error) {
      console.error('Error creando marcadores:', error);
    }
  }

  listar(lista) {
    if (!lista.length) return;
    
    try {
      const min = Math.min(...lista.map(g => g.precio));
      const max = Math.max(...lista.map(g => g.precio));
      
      const html = lista.map((g, i) => {
        const cat = this.determinarCategoria(g.precio, min, max);
        
        return `
          <div class="gasolinera-card ${cat}" data-i="${i}">
            <div class="gasolinera-header">
              <div class="gasolinera-nombre">${g.brand}</div>
              <div class="precio-badge ${cat}">${g.precio.toFixed(3)} €/L</div>
            </div>
            <div class="gasolinera-info">📍 ${g.dir}, ${g.mun}</div>
            <div class="gasolinera-acciones">
              <div class="gasolinera-distancia">🚗 ${g.dist.toFixed(1)} km</div>
              <button class="ruta-btn" onclick="app.ruta(${g.lat},${g.lng})">🗺️ Ir</button>
            </div>
          </div>`;
      }).join('');
      
      const cont = document.getElementById('listado');
      if (cont) {
        cont.innerHTML = html;
        cont.querySelectorAll('.gasolinera-card')
          .forEach(el => el.addEventListener('click', e => {
            if (e.target.classList.contains('ruta-btn')) return;
            this.selectCard(+el.dataset.i);
          }));
      }
    } catch (error) {
      console.error('Error creando listado:', error);
    }
  }

  selectCard(i) {
    try {
      document.querySelectorAll('.gasolinera-card').forEach(c => c.classList.remove('selected'));
      const card = document.querySelector(`.gasolinera-card[data-i="${i}"]`);
      if (card) {
        card.classList.add('selected');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (this.marcadores[i]) this.marcadores[i].openPopup();
    } catch (error) {
      console.error('Error seleccionando tarjeta:', error);
    }
  }

  marcarUsuario() {
    if (!this.ubicacion || !this.mapa) return;
    
    try {
      const marcadorUsuario = L.circleMarker([this.ubicacion.lat, this.ubicacion.lng], {
        radius: 10,
        fillColor: '#1a56db',
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1
      }).addTo(this.mapa);
      marcadorUsuario.bindPopup('<strong>📍 Tu ubicación</strong>');
      this.marcadores.push(marcadorUsuario);
    } catch (error) {
      console.error('Error marcando usuario:', error);
    }
  }
  
  ruta(lat, lng) {
    try {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    } catch (error) {
      console.error('Error abriendo ruta:', error);
    }
  }
  
  setInfo(t) { 
    try {
      const infoElement = document.getElementById('mapaInfo');
      if (infoElement) {
        infoElement.textContent = t;
      }
    } catch (error) {
      console.error('Error actualizando info:', error);
    }
  }
  
  dist(a1, o1, a2, o2) {
    const R = 6371;
    const dLat = (a2 - a1) * Math.PI / 180;
    const dLon = (o2 - o1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(a1 * Math.PI / 180) * Math.cos(a2 * Math.PI / 180) * 
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

// Inicialización con mejor manejo de errores
let app;
window.addEventListener('DOMContentLoaded', () => {
  try {
    app = new GasolinerasApp();
  } catch (error) {
    console.error('Error al inicializar la aplicación:', error);
    
    // Mostrar error al usuario
    const infoElement = document.getElementById('mapaInfo');
    if (infoElement) {
      infoElement.textContent = '❌ Error de inicialización. Recarga la página.';
    }
  }
});
