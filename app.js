class GasolinerasAppOptimizada {
  constructor() {
    this.mapa = null;
    this.marcadores = [];
    // MEJORA: Caché extendido y por zonas
    this.cache = { 
      stamp: 0, 
      data: null, 
      ttl: 15 * 60 * 1000,  // 15 minutos
      ubicacionCache: new Map(),  // Caché por ubicación
      maxEntries: 10  // Máximo 10 ubicaciones en caché
    };
    this.ubicacion = null;
    this.combustible = 'Precio Gasoleo A';
    this.radio = 5;
    this.direccionActual = '';
    
    // MEJORA: Worker para cálculos pesados
    this.worker = null;
    this.initWorker();
    
    this.colores = { 
      'muy-barato': '#059669',
      'barato': '#84cc16',
      'medio': '#eab308',
      'caro': '#f97316',
      'muy-caro': '#dc2626'
    };
    
    this.keys = { fuel: 'fuel_pref', radio: 'radio_pref', loc: 'loc_prev' };
    this.inicializacionTimeout = null;
    
    this.init();
  }

  // NUEVO: Web Worker para cálculos de distancia
  initWorker() {
    const workerScript = `
      self.onmessage = function(e) {
        const { gasolineras, userLat, userLng, radio, combustible } = e.data;
        
        function calcDistancia(lat1, lon1, lat2, lon2) {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + 
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                    Math.sin(dLon / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        
        const resultados = gasolineras.map(g => {
          try {
            const lat = parseFloat(g.Latitud?.replace(',', '.'));
            const lng = parseFloat(g['Longitud (WGS84)']?.replace(',', '.'));
            const price = parseFloat(g[combustible]?.replace(',', '.'));
            
            if (isNaN(lat) || isNaN(lng) || isNaN(price) || price === 0) return null;
            
            const dist = calcDistancia(userLat, userLng, lat, lng);
            if (dist > radio) return null;
            
            return { 
              brand: g['Rótulo'] || 'Sin marca', 
              dir: g.Dirección || 'Sin dirección', 
              mun: g.Municipio || '', 
              lat, lng, 
              precio: price, 
              dist 
            };
          } catch {
            return null;
          }
        }).filter(Boolean)
        .sort((a, b) => {
          if (Math.abs(a.precio - b.precio) < 0.001) return a.dist - b.dist;
          return a.precio - b.precio;
        });
        
        self.postMessage(resultados);
      };
    `;
    
    try {
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
    } catch (error) {
      console.log('Web Workers no disponibles, usando procesamiento directo');
    }
  }

  init() {
    try {
      this.iniciarMapa();
      this.cargarPreferencias();
      this.vincularEventos();
      
      this.inicializacionTimeout = setTimeout(() => {
        if (document.getElementById('mapaInfo').textContent.includes('Iniciando')) {
          this.setInfo('⚠️ Tarda más de lo normal. Prueba a buscar una ciudad.');
        }
      }, 8000);  // Reducido de 10s a 8s
      
      this.arranqueAutomatico();
    } catch (error) {
      console.error('Error en inicialización:', error);
      this.setInfo('❌ Error al iniciar. Recarga la página.');
    }
  }

  // MEJORA: Clave de caché por ubicación aproximada
  getCacheKey(lat, lng) {
    // Redondear a 2 decimales para crear zonas de caché
    const roundLat = Math.round(lat * 100) / 100;
    const roundLng = Math.round(lng * 100) / 100;
    return `${roundLat},${roundLng}`;
  }

  // MEJORA: Limpieza automática del caché
  limpiarCacheAntiguo() {
    const now = Date.now();
    for (const [key, data] of this.cache.ubicacionCache.entries()) {
      if (now - data.timestamp > this.cache.ttl) {
        this.cache.ubicacionCache.delete(key);
      }
    }
    
    // Limitar número de entradas
    if (this.cache.ubicacionCache.size > this.cache.maxEntries) {
      const keys = Array.from(this.cache.ubicacionCache.keys());
      const oldestKeys = keys.slice(0, keys.length - this.cache.maxEntries);
      oldestKeys.forEach(key => this.cache.ubicacionCache.delete(key));
    }
  }

  // Resto de métodos manteniendo la funcionalidad anterior...
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

  vincularEventos() {
    try {
      // Events listeners igual que antes pero optimizados
      document.querySelectorAll('.fuel-chip').forEach(chip =>
        chip.addEventListener('click', e => {
          document.querySelectorAll('.fuel-chip').forEach(c => c.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.combustible = e.currentTarget.dataset.fuel;
          this.guardarPreferencias();
          // MEJORA: Procesamiento inmediato si hay datos
          if (this.cache.data) this.procesarOptimizado(this.cache.data);
        }));

      const slider = document.getElementById('radioSlider');
      slider.addEventListener('input', e => {
        this.radio = parseInt(e.target.value);
        document.getElementById('radioValue').textContent = `${this.radio} km`;
        this.guardarPreferencias();
        // MEJORA: Actualización inmediata
        if (this.cache.data && this.ubicacion) this.procesarOptimizado(this.cache.data);
      });

      // Resto de eventos igual...
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

      const searchBtn = document.getElementById('searchIconBtn');
      if (searchBtn) {
        searchBtn.addEventListener('click', () => this.buscarDireccion());
      }
      
      if (inputDireccion) {
        inputDireccion.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.buscarDireccion();
          }
        });
      }

      const ubicacionBtn = document.getElementById('ubicacionBtn');
      if (ubicacionBtn) {
        ubicacionBtn.addEventListener('click', () => this.obtenerGPS());
      }

      const centrarBtn = document.getElementById('centrarBtn');
      if (centrarBtn) {
        centrarBtn.addEventListener('click', () => this.centrarEnUbicacion());
      }

    } catch (error) {
      console.error('Error vinculando eventos:', error);
    }
  }

  // OPTIMIZACIÓN: Carga con caché por ubicación
  async cargarGasolinerasOptimizado() {
    this.setInfo('⛽ Buscando gasolineras...');
    
    if (!this.ubicacion) return;
    
    // Verificar caché por ubicación
    const cacheKey = this.getCacheKey(this.ubicacion.lat, this.ubicacion.lng);
    const cachedData = this.cache.ubicacionCache.get(cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp < this.cache.ttl)) {
      this.setInfo('📋 Datos desde caché...');
      this.procesarOptimizado(cachedData.data);
      return;
    }

    // Limpiar caché antiguo
    this.limpiarCacheAntiguo();
    
    const listadoElement = document.getElementById('listado');
    if (listadoElement) {
      listadoElement.innerHTML = `
        <div class="loading">
          <div class="loading-spinner"></div>
          Cargando datos oficiales... ⚡
        </div>
      `;
    }
    
    const now = Date.now();
    
    // Verificar caché global
    if (this.cache.data && now - this.cache.stamp < this.cache.ttl) {
      // Guardar en caché por ubicación
      this.cache.ubicacionCache.set(cacheKey, {
        data: this.cache.data,
        timestamp: now
      });
      this.procesarOptimizado(this.cache.data);
      return;
    }
    
    try {
      const r = await Promise.race([
        fetch('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout de red')), 12000))  // Timeout más corto
      ]);
      
      if (!r.ok) {
        throw new Error(`Error HTTP: ${r.status}`);
      }
      
      const js = await r.json();
      if (!js.ListaEESSPrecio) {
        throw new Error('Datos inválidos de la API');
      }
      
      // Actualizar ambos cachés
      this.cache = { ...this.cache, stamp: now, data: js.ListaEESSPrecio };
      this.cache.ubicacionCache.set(cacheKey, {
        data: js.ListaEESSPrecio,
        timestamp: now
      });
      
      this.procesarOptimizado(this.cache.data);
    } catch (error) {
      console.error('Error cargando gasolineras:', error);
      this.setInfo('❌ Error de conexión');
      if (listadoElement) {
        listadoElement.innerHTML = `
          <div class="loading">
            ❌ Error de conexión. Verifica internet y recarga.
          </div>
        `;
      }
    }
  }

  // NUEVO: Procesamiento optimizado con Web Worker
  async procesarOptimizado(arr) {
    if (!this.ubicacion || !arr) {
      this.setInfo('❌ Sin ubicación o datos');
      return;
    }
    
    this.setInfo('⚡ Procesando datos...');
    
    try {
      this.marcadores.forEach(m => this.mapa.removeLayer(m));
      this.marcadores = [];
      
      if (this.worker) {
        // Usar Web Worker para cálculos pesados
        this.worker.postMessage({
          gasolineras: arr,
          userLat: this.ubicacion.lat,
          userLng: this.ubicacion.lng,
          radio: this.radio,
          combustible: this.combustible
        });
        
        this.worker.onmessage = (e) => {
          const lista = e.data;
          this.finalizarProcesamiento(lista);
        };
      } else {
        // Fallback: procesamiento directo (más rápido para pocos datos)
        const lista = this.procesarDirecto(arr);
        this.finalizarProcesamiento(lista);
      }
    } catch (error) {
      console.error('Error procesando:', error);
      this.setInfo('❌ Error procesando datos');
    }
  }

  // Procesamiento directo optimizado
  procesarDirecto(arr) {
    const resultados = [];
    const batch = 100;  // Procesar en lotes de 100
    
    for (let i = 0; i < arr.length; i += batch) {
      const lote = arr.slice(i, i + batch);
      
      for (const g of lote) {
        try {
          const lat = parseFloat(g.Latitud?.replace(',', '.'));
          const lng = parseFloat(g['Longitud (WGS84)']?.replace(',', '.'));
          const price = parseFloat(g[this.combustible]?.replace(',', '.'));
          
          if (isNaN(lat) || isNaN(lng) || isNaN(price) || price === 0) continue;
          
          const dist = this.dist(this.ubicacion.lat, this.ubicacion.lng, lat, lng);
          if (dist > this.radio) continue;
          
          resultados.push({ 
            brand: g['Rótulo'] || 'Sin marca', 
            dir: g.Dirección || 'Sin dirección', 
            mun: g.Municipio || '', 
            lat, lng, 
            precio: price, 
            dist 
          });
        } catch {
          continue;
        }
      }
      
      // Permitir que el navegador respire entre lotes
      if (i % (batch * 5) === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    return resultados.sort((a, b) => {
      if (Math.abs(a.precio - b.precio) < 0.001) return a.dist - b.dist;
      return a.precio - b.precio;
    });
  }

  finalizarProcesamiento(lista) {
    if (!lista.length) {
      this.setInfo(`❌ Sin gasolineras en ${this.radio} km`);
      const listadoElement = document.getElementById('listado');
      if (listadoElement) {
        listadoElement.innerHTML = `
          <div class="loading">
            Sin gasolineras en el radio. Aumenta la distancia.
          </div>
        `;
      }
      return;
    }
    
    // Mostrar resultados rápidamente
    this.marcarOptimizado(lista);
    this.listarOptimizado(lista);
    this.marcarUsuario();
    this.setInfo(`✅ ${lista.length} gasolineras (⚡ carga rápida)`);
  }

  // OPTIMIZACIÓN: Creación de marcadores en lotes
  marcarOptimizado(lista) {
    if (!lista.length) return;
    
    try {
      const min = Math.min(...lista.map(g => g.precio));
      const max = Math.max(...lista.map(g => g.precio));
      const marcadoresLote = [];
      
      // Crear marcadores en lotes pequeños
      const batchSize = 20;
      let currentBatch = 0;
      
      const procesarLote = () => {
        const inicio = currentBatch * batchSize;
        const fin = Math.min(inicio + batchSize, lista.length);
        
        for (let i = inicio; i < fin; i++) {
          const g = lista[i];
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
        }
        
        currentBatch++;
        if (currentBatch * batchSize < lista.length) {
          // Continuar con el siguiente lote
          setTimeout(procesarLote, 10);
        }
      };
      
      procesarLote();
    } catch (error) {
      console.error('Error creando marcadores:', error);
    }
  }

  // OPTIMIZACIÓN: Listado con rendering eficiente
  listarOptimizado(lista) {
    if (!lista.length) return;
    
    try {
      const min = Math.min(...lista.map(g => g.precio));
      const max = Math.max(...lista.map(g => g.precio));
      
      // Renderizar solo los primeros 50 elementos visibles
      const listaVisible = lista.slice(0, 50);
      
      const html = listaVisible.map((g, i) => {
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
        
        // Mostrar información sobre resultados limitados
        if (lista.length > 50) {
          cont.innerHTML += `
            <div class="loading">
              📋 Mostrando las 50 gasolineras más cercanas de ${lista.length} encontradas
            </div>
          `;
        }
        
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

  // Resto de métodos iguales...
  async arranqueAutomatico() {
    this.setInfo('🔍 Iniciando...');
    
    if (navigator.geolocation) {
      try {
        this.setInfo('📍 Obteniendo GPS...');
        const pos = await Promise.race([
          new Promise((ok, err) =>
            navigator.geolocation.getCurrentPosition(ok, err, { 
              enableHighAccuracy: true, 
              timeout: 4000  // Timeout más agresivo
            })),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('GPS timeout')), 5000))
        ]);
        
        this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
        
        if (this.inicializacionTimeout) {
          clearTimeout(this.inicializacionTimeout);
        }
        
        await this.reverseGeocode();
        await this.cargarGasolinerasOptimizado();  // Usar versión optimizada
        return;
      } catch (error) {
        console.log('GPS no disponible:', error.message);
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
        
        await this.cargarGasolinerasOptimizado();  // Usar versión optimizada
        return;
      }
    } catch (error) {
      console.log('Error cargando última ubicación:', error);
    }
    
    // Fallback a Madrid
    try {
      this.ubicacion = { lat: 40.4168, lng: -3.7038 };
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 12);
      
      if (this.inicializacionTimeout) {
        clearTimeout(this.inicializacionTimeout);
      }
      
      this.setInfo('📍 Madrid por defecto. Busca tu ciudad o usa GPS');
      document.getElementById('direccionInput').placeholder = 'Busca tu ciudad...';
      
      await this.cargarGasolinerasOptimizado();  // Usar versión optimizada
    } catch (error) {
      console.error('Error en fallback:', error);
      this.setInfo('❌ Error de conexión. Verifica internet y recarga.');
    }
  }

  // Resto de métodos mantienen la misma funcionalidad pero usando las versiones optimizadas
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

  // Limpiar recursos al cerrar
  destruir() {
    if (this.worker) {
      this.worker.terminate();
    }
    if (this.inicializacionTimeout) {
      clearTimeout(this.inicializacionTimeout);
    }
  }
}

// Inicialización optimizada
let app;
window.addEventListener('DOMContentLoaded', () => {
  try {
    app = new GasolinerasAppOptimizada();
  } catch (error) {
    console.error('Error al inicializar:', error);
    const infoElement = document.getElementById('mapaInfo');
    if (infoElement) {
      infoElement.textContent = '❌ Error de inicialización. Recarga la página.';
    }
  }
});

// Limpiar recursos al cerrar página
window.addEventListener('beforeunload', () => {
  if (app && app.destruir) {
    app.destruir();
  }
});
