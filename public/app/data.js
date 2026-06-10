// ── Capa de datos ──────────────────────────────────────────────────────────
// 1) Eventos reales: /api/events (catálogo CSN vía nuestro backend), con
//    respaldo USGS (CORS abierto) si el backend no responde, y datos demo
//    como último recurso.
// 2) Monitor en vivo: LiveClient consulta /api/live (red C1 vía EarthScope)
//    y reproduce el historial con un cursor por marca de tiempo, igual que
//    la implementación original (el buffer del backend es deslizante, así
//    que un índice fijo quedaría apuntando a otra muestra).

window.SISMO_DATA = (() => {
  const C = window.SISMO_CONFIG;

  // ── Eventos: CSN (backend propio) con respaldo USGS ─────────────────────
  const FETCH_DAYS = 7;

  async function fetchEventsCSN() {
    const res = await fetch(`/api/events?days=${FETCH_DAYS}`);
    if (!res.ok) throw new Error(`CSN HTTP ${res.status}`);
    const data = await res.json();

    return (data.events ?? [])
      .map((e) => {
        // utcTime viene como "YYYY-MM-DD HH:MM:SS" (UTC)
        const iso = e.utcTime ? e.utcTime.replace(" ", "T") + "Z" : null;
        const time = iso ? Date.parse(iso) : Date.parse(e.localTime ?? "");
        return {
          id: `${e.utcTime}-${e.latitude}-${e.longitude}-${e.magnitude}`,
          time,
          mag: e.magnitude,
          depth: e.depthKm,
          lat: e.latitude,
          lon: e.longitude,
          place: e.place || "Sin referencia"
        };
      })
      .filter((e) => Number.isFinite(e.time) && Number.isFinite(e.mag) && Number.isFinite(e.lat))
      .sort((a, b) => b.time - a.time);
  }

  async function fetchEventsUSGS() {
    const end = new Date();
    const start = new Date(end.getTime() - FETCH_DAYS * 24 * 3600 * 1000);
    const url =
      "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson" +
      `&starttime=${start.toISOString()}&endtime=${end.toISOString()}` +
      "&minlatitude=-57&maxlatitude=-17&minlongitude=-77.5&maxlongitude=-65.5" +
      "&minmagnitude=2.5&orderby=time";

    const res = await fetch(url);
    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
    const geo = await res.json();

    return geo.features
      .map((f) => ({
        id: f.id,
        time: f.properties.time,
        mag: f.properties.mag,
        depth: f.geometry.coordinates[2],
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        place: cleanPlace(f.properties.place)
      }))
      .filter((e) => Number.isFinite(e.mag) && Number.isFinite(e.lat))
      .sort((a, b) => b.time - a.time);
  }

  // Devuelve { events, source } intentando CSN → USGS → demo.
  async function fetchEvents() {
    try {
      return { events: await fetchEventsCSN(), source: "csn" };
    } catch (err) {
      console.warn("CSN no disponible, intentando USGS:", err.message);
    }
    try {
      return { events: await fetchEventsUSGS(), source: "usgs" };
    } catch (err) {
      console.warn("USGS no disponible, usando datos demo:", err.message);
    }
    return { events: mockEvents(), source: "demo" };
  }

  function cleanPlace(place) {
    if (!place) return "Sin referencia";
    return place
      .replace(/^\d+\s*km\s+([NSEW]{1,3})\s+of\s+/i, (m, dir) => {
        const km = m.match(/^\d+/)[0];
        const dirs = { N: "N", S: "S", E: "E", W: "O", NE: "NE", NW: "NO", SE: "SE", SW: "SO", NNE: "NNE", NNW: "NNO", ENE: "ENE", ESE: "ESE", SSE: "SSE", SSW: "SSO", WNW: "ONO", WSW: "OSO" };
        return `${km} km ${dirs[dir.toUpperCase()] ?? dir} de `;
      })
      .replace(/,\s*Chile$/i, "")
      .replace(/\s+region$/i, "");
  }

  // Respaldo final: eventos sintéticos plausibles
  function mockEvents() {
    const now = Date.now();
    const spots = [
      { lat: -20.2, lon: -70.4, place: "Costa de Tarapacá", d: 38 },
      { lat: -23.5, lon: -68.5, place: "62 km E de San Pedro de Atacama", d: 188 },
      { lat: -27.1, lon: -70.9, place: "41 km NO de Copiapó", d: 52 },
      { lat: -30.2, lon: -71.6, place: "Costa de Coquimbo", d: 31 },
      { lat: -33.6, lon: -72.1, place: "78 km SO de Valparaíso", d: 22 },
      { lat: -34.9, lon: -71.2, place: "18 km E de Curicó", d: 95 },
      { lat: -36.9, lon: -73.6, place: "Costa del Biobío", d: 26 },
      { lat: -38.4, lon: -73.9, place: "Costa de La Araucanía", d: 19 },
      { lat: -21.8, lon: -68.2, place: "115 km NE de Calama", d: 122 },
      { lat: -45.6, lon: -73.2, place: "44 km O de Puerto Aysén", d: 12 }
    ];
    const out = [];
    let t = now - 14 * 60 * 1000;
    for (let i = 0; i < 42; i++) {
      const s = spots[i % spots.length];
      const mag = +(2.6 + Math.random() * (i % 9 === 0 ? 3.4 : 1.9)).toFixed(1);
      out.push({
        id: `mock-${i}`,
        time: t,
        mag,
        depth: Math.max(8, Math.round(s.d * (0.7 + Math.random() * 0.6))),
        lat: s.lat + (Math.random() - 0.5) * 1.2,
        lon: s.lon + (Math.random() - 0.5) * 0.8,
        place: s.place
      });
      t -= (1 + Math.random() * 6) * 3600 * 1000;
    }
    return out;
  }

  // ── Cliente del monitor en vivo (/api/live) ──────────────────────────────
  const TICK_MS = 2000; // cadencia de reproducción (1 punto = ventana de 2 s)
  const POLL_MS = 25000; // el backend refresca su buffer cada ~30 s
  const PLAYBACK_LAG_POINTS = 4; // colchón (~8 s) para no alcanzar el borde del buffer

  // El cursor se guarda como marca de tiempo (string ISO, comparable
  // lexicográficamente) y se resuelve a índice en cada cuadro.
  function indexForPlayTime(series, playTime) {
    if (!series.length) return -1;
    if (!playTime) return series.length - 1;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].t <= playTime) return i;
    }
    return 0;
  }

  function initialPlayTime(series) {
    const idx = Math.max(0, series.length - 1 - PLAYBACK_LAG_POINTS);
    return series[idx]?.t ?? null;
  }

  class LiveClient {
    constructor() {
      this.stations = new Map(); // code → { ...estación, series, baseline, playTime }
      this.delayMinutes = null;
      this._timer = null;
    }

    start() {
      this._poll();
      this._timer = setInterval(() => this._poll(), POLL_MS);
    }

    stop() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    }

    async _poll() {
      try {
        const res = await fetch("/api/live");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.delayMinutes != null) this.delayMinutes = data.delayMinutes;
        this._ingest(data.stations ?? []);
      } catch (err) {
        console.warn("No se pudo actualizar /api/live:", err.message);
      }
    }

    _ingest(stations) {
      for (const st of stations) {
        const series = st.series ?? [];
        let entry = this.stations.get(st.code);

        if (!entry) {
          entry = {
            code: st.code,
            name: st.name,
            lat: st.lat,
            lon: st.lon,
            status: st.status,
            error: st.error,
            series,
            baseline: st.baseline,
            playTime: initialPlayTime(series)
          };
          this.stations.set(st.code, entry);
        } else {
          entry.status = st.status;
          entry.error = st.error;
          entry.series = series;
          entry.baseline = st.baseline;

          // Si la muestra reproducida ya salió del buffer (estación caída,
          // salto grande, etc.), reubicamos el cursor.
          if (series.length && (!entry.playTime || entry.playTime < series[0].t)) {
            entry.playTime = initialPlayTime(series);
          }
        }
      }
    }

    tick() {
      for (const entry of this.stations.values()) {
        const series = entry.series;
        if (!series.length) continue;
        const idx = indexForPlayTime(series, entry.playTime);
        const playableMaxIndex = series.length - 1 - PLAYBACK_LAG_POINTS;
        if (idx < playableMaxIndex && idx + 1 < series.length) {
          entry.playTime = series[idx + 1].t;
        }
      }
    }

    snapshot() {
      const out = [];
      for (const entry of this.stations.values()) {
        const playIndex = indexForPlayTime(entry.series, entry.playTime);
        const visible = playIndex >= 0 ? entry.series.slice(0, playIndex + 1) : [];
        const current = visible.length ? visible[visible.length - 1] : null;
        out.push({
          code: entry.code,
          name: entry.name,
          lat: entry.lat,
          lon: entry.lon,
          status: entry.status,
          baseline: entry.baseline,
          series: visible,
          current,
          level: current ? C.classifyLevel(current.rms, entry.baseline) : 0
        });
      }
      return out;
    }
  }

  return { fetchEvents, mockEvents, LiveClient, TICK_MS, FETCH_DAYS };
})();
