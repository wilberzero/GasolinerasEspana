class GasolinerasApp {
  constructor() {
    this.mapa = null;
    this.marcadores = [];
    this.marcadorUbicacion = null;
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
        c.classList.toggle('active', c.dataset.fuel === this.combustible)
      );
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
      document.querySelectorAll('.fuel-chip').forEach(chip => chip.addEventListener('click', e => {
        document.querySelectorAll('.fuel-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.combustible = e.currentTarget.dataset.fuel;
        this.guardarPreferencias();
        if (this.cache.data) this.procesar(this.cache.data);
      }));

      const slider = document.getElementById('radioSlider');
      slider.addEventListener('input', e => {
        this.radio = parseInt(e.target.value);
        document.getElementById('radioValue').textContent = `${this.radio} km`;
        this.guardarPreferencias();
        if (this.cache.data && this.ubicacion) this.procesar(this.cache.data);
      });

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

  centrarEnUbicacion() {
    if (this.ubicacion) {
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
      this.setInfo(`📍 Centrado en tu ubicación`);
    } else {
      this.obtenerGPS();
    }
  }

  agregarMarcadorUbicacion() {
    if (this.marcadorUbicacion) {
      this.mapa.removeLayer(this.marcadorUbicacion);
    }
    if (this.ubicacion) {
      this.marcadorUbicacion = L.marker([this.ubicacion.lat, this.ubicacion.lng])
        .addTo(this.mapa)
        .bindPopup('📍 Tu ubicación');
    }
  }

  async arranqueAutomatico() {
    this.setInfo('🔍 Iniciando…');
    if (navigator.geolocation) {
      try {
        this.setInfo('📍 Obteniendo ubicación GPS...');
        const pos = await Promise.race([
          new Promise((ok, err) =>
            navigator.geolocation.getCurrentPosition(ok, err, { enableHighAccuracy: true, timeout: 5000 })),
          new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 6000))
        ]);
        this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
        this.agregarMarcadorUbicacion();
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
        this.agregarMarcadorUbicacion();
        if (this.inicializacionTimeout) { clearTimeout(this.inicializacionTimeout); }
        await this.cargarGasolineras();
        return;
      }
    } catch (error) {
      console.log('Error al cargar última ubicación:', error);
    }
    try {
      this.ubicacion = { lat: 40.4168, lng: -3.7038 };
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 12);
      this.agregarMarcadorUbicacion();
      if (this.inicializacionTimeout) { clearTimeout(this.inicializacionTimeout); }
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
          navigator.geolocation.getCurrentPosition(ok, err, { enableHighAccuracy: true, timeout: 8000 })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GPS timeout')), 10000))
      ]);
      this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
      this.agregarMarcadorUbicacion();
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
      this.agregarMarcadorUbicacion();
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

  setInfo(msg) {
    const el = document.getElementById('mapaInfo');
    if (el) el.textContent = msg;
  }

  // UTILIDADES DE FECHA Y HORARIO
  formateaFecha(dateObj) {
    if (!dateObj) return "--";
    const d = typeof dateObj === 'string' ? new Date(dateObj) : dateObj;
    return (
      d.getDate().toString().padStart(2, "0") + "/" +
      (d.getMonth() + 1).toString().padStart(2, "0") + "/" +
      d.getFullYear().toString() +
      " " +
      d.getHours().toString().padStart(2, "0") + ":" +
      d.getMinutes().toString().padStart(2, "0")
    );
  }

  estaAbierta(horario, ahora = new Date()) {
    if (!horario) return null;
    if (horario.trim().toUpperCase().includes("24")) return true;
    const partes = horario.split("-");
    if (partes.length !== 2) return null;
    const [ini, fin] = partes;
    const [hi, mi] = ini.split(":").map(Number);
    const [hf, mf] = fin.split(":").map(Number);
    if ([hi, mi, hf, mf].some(isNaN)) return null;
    const nowMins = ahora.getHours() * 60 + ahora.getMinutes();
    const iniMins = hi * 60 + mi;
    const finMins = hf * 60 + mf;
    return nowMins >= iniMins && nowMins < finMins;
  }

  clasificarPrecio(precio, precios) {
    if (!precios.length) return 'medio';
    precios.sort((a, b) => a - b);
    const p20 = precios[Math.floor(precios.length * 0.2)];
    const p40 = precios[Math.floor(precios.length * 0.4)];
    const p60 = precios[Math.floor(precios.length * 0.6)];
    const p80 = precios[Math.floor(precios.length * 0.8)];
    
    if (precio <= p20) return 'muy-barato';
    if (precio <= p40) return 'barato';
    if (precio <= p60) return 'medio';
    if (precio <= p80) return 'caro';
    return 'muy-caro';
  }

  calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // **CONEXIÓN REAL A API DE GASOLINERAS**
  async cargarGasolineras() {
    this.setInfo('⛽ Cargando gasolineras…');
    const listadoElement = document.getElementById('listado');
    if (listadoElement) {
      listadoElement.innerHTML = `<span class="loading"><span class="loading-spinner"></span> Cargando…</span>`;
    }

    if (!this.ubicacion) {
      this.setInfo('❌ Necesitas una ubicación para buscar gasolineras');
      return;
    }

    try {
      // **USAR CACHE SI ES RECIENTE**
      const ahora = Date.now();
      if (this.cache.data && (ahora - this.cache.stamp) < this.cache.ttl) {
        console.log('Usando datos del cache');
        await this.procesar(this.cache.data);
        return;
      }

      // **LLAMADA REAL A LA API DEL MINISTERIO**
      const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
      const targetUrl = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
      
      console.log('Cargando datos reales de gasolineras...');
      
      const response = await Promise.race([
        fetch(proxyUrl + targetUrl),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout API')), 15000))
      ]);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Datos recibidos:', data);

      if (!data.ListaEESSPrecio || !Array.isArray(data.ListaEESSPrecio)) {
        throw new Error('Formato de datos inesperado');
      }

      // **GUARDAR EN CACHE**
      this.cache = {
        stamp: ahora,
        data: data,
        ttl: 5 * 60 * 1000 // 5 minutos
      };

      // **PROCESAR DATOS REALES**
      await this.procesar(data);

    } catch (error) {
      console.error('Error cargando gasolineras:', error);
      
      // **FALLBACK: Usar datos simulados si falla la API**
      console.log('Usando datos de fallback...');
      const fallbackData = {
        ListaEESSPrecio: [
          {
            'IDEESS': '1234',
            'Rótulo': 'REPSOL',
            'Dirección': 'CALLE FALSA 123',
            'Municipio': 'MADRID',
            'Provincia': 'MADRID',
            'Precio Gasoleo A': '1,499',
            'Precio Gasolina 95 E5': '1,599', 
            'Precio Gasolina 98 E5': '1,699',
            'Latitud': String(this.ubicacion.lat + 0.01).replace('.', ','),
            'Longitud (WGS84)': String(this.ubicacion.lng + 0.01).replace('.', ','),
            'Horario': '07:00-22:00',
            'Fecha': new Date().toISOString().split('T')[0].split('-').reverse().join('/')
          },
          {
            'IDEESS': '5678', 
            'Rótulo': 'GALP',
            'Dirección': 'AVENIDA GENERAL 45',
            'Municipio': 'GETAFE',
            'Provincia': 'MADRID',
            'Precio Gasoleo A': '1,449',
            'Precio Gasolina 95 E5': '1,549',
            'Precio Gasolina 98 E5': '1,649', 
            'Latitud': String(this.ubicacion.lat - 0.02).replace('.', ','),
            'Longitud (WGS84)': String(this.ubicacion.lng - 0.01).replace('.', ','),
            'Horario': '24H',
            'Fecha': new Date().toISOString().split('T')[0].split('-').reverse().join('/')
          },
          {
            'IDEESS': '9012',
            'Rótulo': 'BP',
            'Dirección': 'PLAZA MAYOR 2', 
            'Municipio': 'TORREJON DE ARDOZ',
            'Provincia': 'MADRID',
            'Precio Gasoleo A': '1,479',
            'Precio Gasolina 95 E5': '1,579',
            'Precio Gasolina 98 E5': '1,679',
            'Latitud': String(this.ubicacion.lat + 0.03).replace('.', ','),
            'Longitud (WGS84)': String(this.ubicacion.lng - 0.02).replace('.', ','),
            'Horario': '08:00-20:00', 
            'Fecha': new Date().toISOString().split('T')[0].split('-').reverse().join('/')
          }
        ]
      };
      
      await this.procesar(fallbackData);
      this.setInfo('⚠️ Usando datos de ejemplo (API no disponible)');
    }
  }

  async procesar(data) {
    if (!data || !data.ListaEESSPrecio) {
      this.setInfo('❌ No se encontraron datos de gasolineras');
      return;
    }

    const ahora = new Date();
    const updGlobal = this.formateaFecha(ahora);
    
    // **INYECTAR FECHA GLOBAL EN FOOTER**
    const stampFooter = document.getElementById('actualizacionStamp');
    if (stampFooter) stampFooter.textContent = "Actualizado: " + updGlobal;

    // **FILTRAR Y PROCESAR ESTACIONES**
    let estaciones = data.ListaEESSPrecio
      .map(item => {
        // Coordenadas (formato español con comas)
        const lat = parseFloat(item['Latitud']?.replace(',', '.'));
        const lng = parseFloat(item['Longitud (WGS84)']?.replace(',', '.'));
        
        if (isNaN(lat) || isNaN(lng)) return null;

        // Calcular distancia
        const distancia = this.calcularDistancia(
          this.ubicacion.lat, this.ubicacion.lng, lat, lng
        );

        if (distancia > this.radio) return null; // Fuera del radio

        // Precios (formato español con comas) 
        const precioActual = parseFloat(item[this.combustible]?.replace(',', '.'));
        if (isNaN(precioActual)) return null; // Sin precio para el combustible seleccionado

        return {
          id: item['IDEESS'],
          nombre: item['Rótulo'] || 'Sin nombre',
          direccion: `${item['Dirección'] || ''}, ${item['Municipio'] || ''} (${item['Provincia'] || ''})`,
          lat: lat,
          lng: lng,
          distancia: distancia,
          horario: item['Horario'] || '--',
          fecha_actualizacion: item['Fecha'] ? new Date(item['Fecha'].split('/').reverse().join('-')) : ahora,
          precios: {
            'Precio Gasoleo A': parseFloat(item['Precio Gasoleo A']?.replace(',', '.')) || null,
            'Precio Gasolina 95 E5': parseFloat(item['Precio Gasolina 95 E5']?.replace(',', '.')) || null,
            'Precio Gasolina 98 E5': parseFloat(item['Precio Gasolina 98 E5']?.replace(',', '.')) || null
          },
          precioActual: precioActual
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => a.precioActual - b.precioActual); // Ordenar por precio

    if (estaciones.length === 0) {
      this.setInfo('❌ No se encontraron gasolineras cerca con el combustible seleccionado');
      document.getElementById('listado').innerHTML = '<div class="loading">No hay gasolineras cerca</div>';
      return;
    }

    console.log(`Encontradas ${estaciones.length} estaciones`);

    // **OBTENER PRECIOS PARA CLASIFICACIÓN**
    const preciosActuales = estaciones.map(e => e.precioActual);

    // **LIMPIAR MARCADORES ANTERIORES**
    this.marcadores.forEach(m => this.mapa.removeLayer(m));
    this.marcadores = [];

    // **MOSTRAR LISTADO CON COLORES**
    const listadoElement = document.getElementById('listado');
    if (listadoElement) {
      listadoElement.innerHTML = estaciones.map(est => {
        const abierto = this.estaAbierta(est.horario, ahora);
        const es24h = (est.horario || "").toUpperCase().includes("24");
        const colorHorario = es24h ? "horario-abierto" : abierto ? "horario-abierto" : "horario-cerrado";
        const textoHorario = est.horario || "--";
        const fechaEst = this.formateaFecha(est.fecha_actualizacion);
        const precioTexto = est.precioActual.toFixed(3) + " €/L";
        
        // **CLASIFICAR PRECIO Y APLICAR COLOR A LA TARJETA**
        const clasificacion = this.clasificarPrecio(est.precioActual, preciosActuales);

        return `
          <div class="gasolinera-card ${clasificacion}" data-id="${est.id}">
            <div class="gasolinera-header">
              <span class="gasolinera-nombre">${est.nombre}</span>
              <span class="gasolinera-distancia">${est.distancia.toFixed(1)} km</span>
            </div>
            <div class="gasolinera-info">
              <span>${est.direccion}</span><br>
              <span class="horario-apertura ${colorHorario}">Horario: ${textoHorario}</span><br>
              <span style="color:#64748b;font-size:0.95em;">Datos: ${fechaEst}</span>
            </div>
            <div class="gasolinera-acciones">
              <span class="precio-badge ${clasificacion}">${precioTexto}</span>
              <button class="ruta-btn" onclick="window.open('https://maps.google.com/maps?daddr=${est.lat},${est.lng}','_blank')">Ruta</button>
            </div>
          </div>
        `;
      }).join(""); 

      // **AÑADIR EVENTO CLICK A LAS TARJETAS**
      listadoElement.querySelectorAll('.gasolinera-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          const estacion = estaciones.find(e => e.id === id);
          if (estacion) {
            this.mapa.setView([estacion.lat, estacion.lng], 18);
            // Highlight tarjeta
            listadoElement.querySelectorAll('.gasolinera-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
          }
        });
      });
    }

    // **AGREGAR MARCADORES COLOREADOS AL MAPA**
    estaciones.forEach(est => {
      const clasificacion = this.clasificarPrecio(est.precioActual, preciosActuales);
      const precioTexto = est.precioActual.toFixed(3);
      
      const markerHtml = `
        <div class="marker-container ${clasificacion}">
          <div class="marker-brand">${est.nombre.split(' ')[0]}</div>
          <div class="marker-price">${precioTexto}€</div>
        </div>
      `;
      
      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'mapa-marker',
        iconSize: [80, 40],
        iconAnchor: [40, 40]
      });
      
      const marker = L.marker([est.lat, est.lng], { icon: customIcon })
        .addTo(this.mapa)
        .bindPopup(`
          <strong>${est.nombre}</strong><br>
          ${est.direccion}<br>
          <strong>${precioTexto}€/L</strong><br>
          <small>${est.horario}</small>
        `);
      
      this.marcadores.push(marker);
    });

    this.setInfo(`⛽ ${estaciones.length} gasolineras encontradas`);
  }
}

window.onload = () => { new GasolinerasApp(); };
