class GasolinerasApp {
  constructor() {
    this.mapa = null;
    this.marcadores = [];
    this.cache = { stamp: 0, data: null, ttl: 5 * 60 * 1000 };
    this.ubicacion = null;
    this.combustible = "Precio Gasoleo A";
    this.radio = 5;
    this.direccionActual = "";
    this.colores = {
      "muy-barato": "#059669",
      barato: "#84cc16",
      medio: "#eab308",
      caro: "#f97316",
      "muy-caro": "#dc2626",
    };
    this.keys = {
      fuel: "fuel_pref",
      radio: "radio_pref",
      loc: "loc_prev",
    };

    this.idSeleccionado = null; // Para filtrar marcadores seleccionados

    // Timeout para evitar bloqueos de inicialización
    this.inicializacionTimeout = null;

    this.init();
  }

  init() {
    try {
      this.iniciarMapa();
      this.cargarPreferencias();
      this.vincularEventos();

      // Timeout para avisar si tarda mucho en iniciar
      this.inicializacionTimeout = setTimeout(() => {
        const infoElem = document.getElementById("mapaInfo");
        if (infoElem && infoElem.textContent.includes("Iniciando")) {
          this.setInfo(
            "⚠️ Tarda más de lo normal. Prueba a buscar una ciudad manualmente."
          );
        }
      }, 10000);

      this.arranqueAutomatico();
    } catch (error) {
      console.error("Error en inicialización:", error);
      this.setInfo("❌ Error al iniciar. Prueba a recargar la página.");
    }
  }

  iniciarMapa() {
    this.mapa = L.map("mapa").setView([40.4168, -3.7038], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(this.mapa);
    this.mapa.zoomControl.setPosition("bottomleft");

    // Listener para filtrar marcadores según zoom
    this.mapa.on("zoomend", () => this.filtrarMarcadoresPorZoom());
  }

  cargarPreferencias() {
    try {
      const fuel = localStorage.getItem(this.keys.fuel);
      if (fuel) this.combustible = fuel;

      const radio = localStorage.getItem(this.keys.radio);
      if (radio) {
        this.radio = parseInt(radio);
        const slider = document.getElementById("radioSlider");
        const valorSpan = document.getElementById("radioValue");
        if (slider) slider.value = this.radio;
        if (valorSpan) valorSpan.textContent = `${this.radio} km`;
      }

      document.querySelectorAll(".fuel-chip").forEach((c) =>
        c.classList.toggle("active", c.dataset.fuel === this.combustible)
      );
    } catch (error) {
      console.error("Error cargando preferencias:", error);
    }
  }

  guardarPreferencias() {
    try {
      localStorage.setItem(this.keys.fuel, this.combustible);
      localStorage.setItem(this.keys.radio, this.radio);
      if (this.ubicacion)
        localStorage.setItem(this.keys.loc, JSON.stringify(this.ubicacion));
    } catch (error) {
      console.error("Error guardando preferencias:", error);
    }
  }

  vincularEventos() {
    try {
      // Chips de combustible
      document.querySelectorAll(".fuel-chip").forEach((chip) =>
        chip.addEventListener("click", (e) => {
          document
            .querySelectorAll(".fuel-chip")
            .forEach((c) => c.classList.remove("active"));
          e.currentTarget.classList.add("active");
          this.combustible = e.currentTarget.dataset.fuel;
          this.guardarPreferencias();
          if (this.cache.data) this.procesar(this.cache.data);
        })
      );

      // Slider radio
      const slider = document.getElementById("radioSlider");
      if (slider) {
        slider.addEventListener("input", (e) => {
          this.radio = parseInt(e.target.value);
          const valorSpan = document.getElementById("radioValue");
          if (valorSpan) valorSpan.textContent = `${this.radio} km`;
          this.guardarPreferencias();
          if (this.cache.data && this.ubicacion) this.procesar(this.cache.data);
        });
      }

      // Implementar clicks en texto "Radio" para disminuir radio
      const radioLabel = document.getElementById("radioLabel");
      if (radioLabel) {
        radioLabel.addEventListener("click", () => {
          if (this.radio > 1) {
            this.radio -= 1;
            if (slider) slider.value = this.radio;
            const valorSpan = document.getElementById("radioValue");
            if (valorSpan) valorSpan.textContent = `${this.radio} km`;
            this.guardarPreferencias();
            if (this.cache.data && this.ubicacion) this.procesar(this.cache.data);
          }
        });
        // También accesible con teclado
        radioLabel.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            radioLabel.click();
          }
        });
      }

      // Click en texto número de km para aumentar radio
      const radioValue = document.getElementById("radioValue");
      if (radioValue) {
        radioValue.addEventListener("click", () => {
          if (this.radio < 100) {
            this.radio += 1;
            if (slider) slider.value = this.radio;
            radioValue.textContent = `${this.radio} km`;
            this.guardarPreferencias();
            if (this.cache.data && this.ubicacion) this.procesar(this.cache.data);
          }
        });
        // Accesible con teclado
        radioValue.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            radioValue.click();
          }
        });
      }

      // Campo de búsqueda y botón limpiar
      const inputDireccion = document.getElementById("direccionInput");
      const clearBtn = document.getElementById("clearBtn");
      if (inputDireccion) {
        inputDireccion.addEventListener("input", () => {
          if (clearBtn) clearBtn.classList.toggle("show", inputDireccion.value.length > 0);
        });
      }
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          if (inputDireccion) {
            inputDireccion.value = "";
            clearBtn.classList.remove("show");
            inputDireccion.focus();
          }
        });
      }

      // Botón lupa búsqueda
      const searchBtn = document.getElementById("searchIconBtn");
      if (searchBtn) {
        searchBtn.addEventListener("click", () => this.buscarDireccion());
      }

      // Enter en input búsqueda
      if (inputDireccion) {
        inputDireccion.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.buscarDireccion();
          }
        });
      }

      // Botón GPS flotante
      const ubicacionBtn = document.getElementById("ubicacionBtn");
      if (ubicacionBtn) {
        ubicacionBtn.addEventListener("click", () => this.obtenerGPS());
      }

      // Botón centrar mapa
      const centrarBtn = document.getElementById("centrarBtn");
      if (centrarBtn) {
        centrarBtn.addEventListener("click", () => this.centrarEnUbicacion());
      }
    } catch (error) {
      console.error("Error vinculando eventos:", error);
    }
  }

  centrarEnUbicacion() {
    if (this.ubicacion) {
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
      this.setInfo("📍 Centrado en tu ubicación");
    } else {
      this.obtenerGPS();
    }
  }

  async arranqueAutomatico() {
    this.setInfo("🔍 Iniciando…");
    if (navigator.geolocation) {
      try {
        this.setInfo("📍 Obteniendo ubicación GPS...");
        const pos = await Promise.race([
          new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err, { enableHighAccuracy: true, timeout: 5000 })),
          new Promise((_, reject) => setTimeout(() => reject(new Error("GPS timeout")), 6000)),
        ]);
        this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);

        if (this.inicializacionTimeout) clearTimeout(this.inicializacionTimeout);

        await this.reverseGeocode();
        await this.cargarGasolineras();
        return;
      } catch (error) {
        console.log("GPS no disponible o timeout:", error.message);
        this.setInfo("📍 GPS no disponible, probando última ubicación...");
      }
    }

    try {
      const last = localStorage.getItem(this.keys.loc);
      if (last) {
        this.ubicacion = JSON.parse(last);
        this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
        if (this.inicializacionTimeout) clearTimeout(this.inicializacionTimeout);
        await this.cargarGasolineras();
        return;
      }
    } catch (error) {
      console.log("Error al cargar última ubicación:", error);
    }

    // Fallback: Madrid por defecto
    try {
      this.ubicacion = { lat: 40.4168, lng: -3.7038 }; // Madrid
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 12);
      if (this.inicializacionTimeout) clearTimeout(this.inicializacionTimeout);

      this.setInfo("📍 Mostrando Madrid. Busca tu ciudad o usa el GPS");
      const inputDir = document.getElementById("direccionInput");
      if (inputDir) inputDir.placeholder = "Busca tu ciudad aquí...";
      await this.cargarGasolineras();
    } catch (error) {
      console.error("Error en fallback:", error);
      this.setInfo("❌ Error de conexión. Verifica tu internet y recarga la página.");
    }
  }

  async obtenerGPS() {
    const fab = document.getElementById("ubicacionBtn");
    if (!fab) return;
    const originalText = fab.textContent;
    fab.textContent = "⏳";
    this.setInfo("🔍 Obteniendo GPS…");
    try {
      const pos = await Promise.race([
        new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err, { enableHighAccuracy: true, timeout: 8000 })),
        new Promise((_, reject) => setTimeout(() => reject(new Error("GPS timeout")), 10000)),
      ]);
      this.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
      this.guardarPreferencias();

      await this.reverseGeocode();
      await this.cargarGasolineras();
    } catch (error) {
      console.error("Error GPS:", error);
      this.setInfo("❌ GPS no disponible. Busca tu ciudad manualmente.");
    } finally {
      fab.textContent = originalText;
    }
  }

  async buscarDireccion() {
    const inputElement = document.getElementById("direccionInput");
    if (!inputElement) return;
    const q = inputElement.value.trim();
    if (!q) {
      alert("Introduce una dirección");
      return;
    }
    this.setInfo("🔍 Buscando…");
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&limit=1&countrycodes=es`;
      const r = await Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Búsqueda timeout")), 10000)),
      ]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const js = await r.json();
      if (!js.length) {
        throw new Error("No se encontró la dirección");
      }
      this.ubicacion = { lat: parseFloat(js[0].lat), lng: parseFloat(js[0].lon) };
      this.direccionActual = js[0].display_name;
      this.mapa.setView([this.ubicacion.lat, this.ubicacion.lng], 16);
      this.guardarPreferencias();
      await this.cargarGasolineras();
    } catch (error) {
      console.error("Error búsqueda:", error);
      this.setInfo("❌ No se encontró la dirección. Prueba con otra ciudad.");
    }
  }

  async reverseGeocode() {
    if (!this.ubicacion) return;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${this.ubicacion.lat}&lon=${this.ubicacion.lng}`;
      const r = await Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Geocoding timeout")), 8000)),
      ]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const js = await r.json();
      if (js.display_name) {
        this.direccionActual = js.display_name;
        const inputElement = document.getElementById("direccionInput");
        const clearBtn = document.getElementById("clearBtn");
        if (inputElement) inputElement.value = js.display_name;
        if (clearBtn) clearBtn.classList.add("show");
        this.setInfo(`📍 ${js.display_name}`);
      }
    } catch (error) {
      console.error("Error geocodificación inversa:", error);
      // No es crítico, continuar sin mostrar error al usuario
    }
  }

  setInfo(texto) {
    const infoElem = document.getElementById("mapaInfo");
    if (infoElem) {
      infoElem.textContent = texto;
    }
  }

  async cargarGasolineras() {
    this.setInfo("⛽ Cargando gasolineras…");
    const listadoElement = document.getElementById("listado");
    if (listadoElement) {
      listadoElement.innerHTML = `
        <div class="loading"><span class="loading-spinner"></span>Cargando...</div>
      `;
    }

    try {
      // Aquí deberías hacer la llamada real a tu API o fuente de datos con la ubicación y combustible
      // Simulación:
      const datos = await this.simularCargaDatos();

      this.cache.data = datos;
      this.cache.stamp = Date.now();

      if (listadoElement) listadoElement.innerHTML = "";

      this.procesar(datos);
    } catch (error) {
      console.error("Error cargando gasolineras:", error);
      this.setInfo("❌ Error cargando gasolineras. Intenta recargar la página.");
    }
  }

  // Simulador de datos para pruebas
  async simularCargaDatos() {
    // Cada gasolinera tendrá id, nombre, lat, lng, combustible y precio
    // Y categoría de precio: muy-barato, barato, medio, caro, muy-caro
    const estaciones = [];
    const baseLat = this.ubicacion ? this.ubicacion.lat : 40.4168;
    const baseLng = this.ubicacion ? this.ubicacion.lng : -3.7038;

    for (let i = 0; i < 30; i++) {
      const precio = (Math.random() * 0.5 + 1.2).toFixed(3); // 1.2 - 1.7
      let clase;
      const pnum = parseFloat(precio);
      if (pnum < 1.3) clase = "muy-barato";
      else if (pnum < 1.4) clase = "barato";
      else if (pnum < 1.5) clase = "medio";
      else if (pnum < 1.6) clase = "caro";
      else clase = "muy-caro";

      estaciones.push({
        id: `g${i}`,
        nombre: `Gasolinera ${i + 1}`,
        lat: baseLat + (Math.random() - 0.5) * 0.1,
        lng: baseLng + (Math.random() - 0.5) * 0.1,
        precio: precio,
        clase: clase,
      });
    }

    return estaciones;
  }

  procesar(data) {
    // Primero limpiamos marcadores anteriores
    this.marcadores.forEach((m) => {
      if (this.mapa.hasLayer(m.marker)) this.mapa.removeLayer(m.marker);
    });
    this.marcadores = [];

    const listadoElement = document.getElementById("listado");
    if (listadoElement) listadoElement.innerHTML = "";

    // Filtrar según el radio
    const radioM = this.radio * 1000; // metros

    data.forEach((gasolinera) => {
      try {
        // Calcular distancia a ubicación actual
        const dist = this.calcularDistancia(
          this.ubicacion.lat,
          this.ubicacion.lng,
          gasolinera.lat,
          gasolinera.lng
        );

        if (dist > radioM) {
          // No mostrar fuera del radio
          return;
        }

        // Crear marcador
        const markerHtml = this.crearHtmlMarcador(gasolinera);

        const nuevoMarker = L.marker([gasolinera.lat, gasolinera.lng], {
          icon: L.divIcon({
            className: "mapa-marker",
            html: markerHtml,
            iconSize: [60, 30],
            iconAnchor: [30, 15],
          }),
          alt: `Gasolinera ${gasolinera.nombre}, precio ${gasolinera.precio} euros`,
          title: `Gasolinera ${gasolinera.nombre}`,
        });

        nuevoMarker.on("click", () => this.seleccionarGasolinera(gasolinera.id));

        nuevoMarker.addTo(this.mapa);

        this.marcadores.push({
          marker: nuevoMarker,
          gasolineraClass: gasolinera.clase,
          id: gasolinera.id,
        });

        // Añadir a listado
        if (listadoElement) {
          listadoElement.appendChild(this.crearTarjetaGasolinera(gasolinera, dist));
        }
      } catch (error) {
        console.warn("Error procesando gasolinera", gasolinera, error);
      }
    });

    this.filtrarMarcadoresPorZoom();

    this.setInfo(
      `Mostradas ${this.marcadores.length} gasolineras dentro de ${this.radio} km.`
    );
  }

  calcularDistancia(lat1, lon1, lat2, lon2) {
    // Haversine
    const R = 6371e3; // metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  crearHtmlMarcador(gasolinera) {
    return `
      <div class="marker-container ${gasolinera.clase}">
        <div class="marker-brand">${gasolinera.nombre}</div>
        <div class="marker-price">${gasolinera.precio}€</div>
      </div>
    `;
  }

  crearTarjetaGasolinera(gasolinera, distanciaM) {
    const div = document.createElement("div");
    div.className = `gasolinera-card ${gasolinera.clase}`;
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", `${gasolinera.nombre}, precio ${gasolinera.precio} euros, distancia ${Math.round(distanciaM)} metros`);

    div.innerHTML = `
      <div class="gasolinera-header">
        <div class="gasolinera-nombre">${gasolinera.nombre}</div>
        <div class="precio-badge ${gasolinera.clase}">${gasolinera.precio}€</div>
      </div>
      <div class="gasolinera-info">
        Distancia: ${(distanciaM / 1000).toFixed(2)} km
      </div>
      <div class="gasolinera-acciones">
        <div class="gasolinera-distancia">${Math.round(distanciaM)} m</div>
        <button class="ruta-btn" aria-label="Obtener ruta a ${gasolinera.nombre}">Ruta</button>
      </div>
    `;

    div.querySelector(".ruta-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.verRuta(gasolinera);
    });

    div.addEventListener("click", () => {
      this.seleccionarGasolinera(gasolinera.id);
      this.mapa.setView([gasolinera.lat, gasolinera.lng], 17);
    });

    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        div.click();
      }
    });

    return div;
  }

  seleccionarGasolinera(id) {
    this.idSeleccionado = id;

    // Resaltar tarjeta seleccionada
    const tarjetas = document.querySelectorAll(".gasolinera-card");
    tarjetas.forEach((tarjeta) => {
      const contains = tarjeta.innerHTML.includes(id);
      if (contains) {
        tarjeta.classList.add("selected");
        tarjeta.focus();
      } else {
        tarjeta.classList.remove("selected");
      }
    });

    this.filtrarMarcadoresPorZoom();
  }

  verRuta(gasolinera) {
    if (!this.ubicacion) {
      alert("Primero debes indicar tu ubicación.");
      return;
    }

    const urlMap =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${this.ubicacion.lat},${this.ubicacion.lng}` +
      `&destination=${gasolinera.lat},${gasolinera.lng}` +
      `&travelmode=driving`;

    window.open(urlMap, "_blank");
  }

  filtrarMarcadoresPorZoom() {
    if (!this.mapa) return;

    const zoom = this.mapa.getZoom();

    // Ajusta este umbral según convenga, 12 es un ejemplo
    const maxZoomParaFiltrar = 12;
    const esZoomLejano = zoom < maxZoomParaFiltrar;

    this.marcadores.forEach((markerObj) => {
      const clase = markerObj.gasolineraClass;
      let mostrar = true;

      if (esZoomLejano) {
        if (["caro", "muy-caro"].includes(clase)) {
          mostrar = false;
        }
        if (clase === "medio") {
          // Mostrar solo la mitad aleatoriamente para simplificar
          mostrar = Math.random() < 0.5;
        }
        // Si es la estación seleccionada, siempre mostrar
        if (markerObj.id === this.idSeleccionado) {
          mostrar = true;
        }
      }

      if (mostrar) {
        if (!this.mapa.hasLayer(markerObj.marker)) markerObj.marker.addTo(this.mapa);
      } else {
        if (this.mapa.hasLayer(markerObj.marker)) this.mapa.removeLayer(markerObj.marker);
      }
    });
  }
}

window.onload = () => {
  new GasolinerasApp();
};
