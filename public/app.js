const map = L.map("map", {
  zoomControl: true
}).setView([-30.5, -71.0], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 12,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
const ringsLayer = L.layerGroup().addTo(map);
const liveLayer = L.layerGroup().addTo(map);

const statusEl = document.getElementById("status");
const eventsEl = document.getElementById("events");
const liveStatusEl = document.getElementById("live-status");
const liveStationsEl = document.getElementById("live-stations");
const liveDelayEl = document.getElementById("live-delay");

const liveMarkers = new Map();

let lastEventKey = null;

function colorForMagnitude(mag) {
  if (mag >= 7) return "#dc2626";
  if (mag >= 6) return "#f97316";
  if (mag >= 5) return "#facc15";
  if (mag >= 4) return "#84cc16";
  return "#22c55e";
}

function radiusForMagnitude(mag) {
  return Math.max(5, mag * mag * 1.2);
}

function eventKey(ev) {
  return `${ev.utcTime}-${ev.latitude}-${ev.longitude}-${ev.magnitude}`;
}

function drawPulse(ev) {
  const color = colorForMagnitude(ev.magnitude);

  const ring = L.circle([ev.latitude, ev.longitude], {
    radius: 10000,
    color,
    fillColor: color,
    fillOpacity: 0.12,
    weight: 2
  }).addTo(ringsLayer);

  let radius = 10000;
  let opacity = 0.35;

  const timer = setInterval(() => {
    radius += 9000;
    opacity -= 0.025;

    ring.setRadius(radius);
    ring.setStyle({
      opacity: Math.max(opacity, 0),
      fillOpacity: Math.max(opacity / 3, 0)
    });

    if (opacity <= 0) {
      clearInterval(timer);
      ringsLayer.removeLayer(ring);
    }
  }, 120);
}

function renderEvents(events) {
  markersLayer.clearLayers();
  eventsEl.innerHTML = "";

  if (!events.length) {
    eventsEl.innerHTML = `<p class="muted">No hay eventos disponibles.</p>`;
    return;
  }

  const newestKey = eventKey(events[0]);

  if (lastEventKey && newestKey !== lastEventKey) {
    drawPulse(events[0]);
  }

  lastEventKey = newestKey;

  for (const ev of events) {
    const color = colorForMagnitude(ev.magnitude);

    const marker = L.circleMarker([ev.latitude, ev.longitude], {
      radius: radiusForMagnitude(ev.magnitude),
      color,
      fillColor: color,
      fillOpacity: 0.75,
      weight: 1
    }).addTo(markersLayer);

    marker.bindPopup(`
      <strong>M ${ev.magnitude}</strong><br />
      ${ev.place || "Sin referencia"}<br />
      Profundidad: ${ev.depthKm ?? "?"} km<br />
      UTC: ${ev.utcTime || "?"}<br />
      Local: ${ev.localTime || "?"}
    `);

    const card = document.createElement("div");
    card.className = "event-card";
    card.style.borderLeftColor = color;

    card.innerHTML = `
      <strong>
        <span class="mag">M ${ev.magnitude}</span>
        ${ev.place || "Sin referencia"}
      </strong>
      <small>Profundidad: ${ev.depthKm ?? "?"} km</small>
      <small>UTC: ${ev.utcTime || "?"}</small>
      <small>Local: ${ev.localTime || "?"}</small>
    `;

    card.addEventListener("click", () => {
      map.setView([ev.latitude, ev.longitude], 7);
      marker.openPopup();
    });

    eventsEl.appendChild(card);
  }
}

async function loadEvents() {
  try {
    statusEl.textContent = "Actualizando datos...";

    const res = await fetch("/api/events?days=2");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || data.error || "Error desconocido");
    }

    renderEvents(data.events);

    const updated = new Date(data.updatedAt).toLocaleString("es-CL");
    statusEl.textContent = `Última actualización: ${updated}. Eventos: ${data.count}`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
  }
}

const LEVEL_COLORS = ["#4ade80", "#a3e635", "#facc15", "#f97316", "#dc2626"];
const LEVEL_LABELS = ["normal", "leve", "moderado", "fuerte", "muy fuerte"];

function colorForLevel(level) {
  return LEVEL_COLORS[level] ?? LEVEL_COLORS[0];
}

function radiusForLevel(level) {
  return 6 + level * 4;
}

function classifyLevel(rms, baseline) {
  if (!Number.isFinite(baseline) || baseline <= 0) return 0;
  const ratio = rms / baseline;

  if (ratio < 1.5) return 0;
  if (ratio < 3) return 1;
  if (ratio < 6) return 2;
  if (ratio < 12) return 3;
  return 4;
}

// Reproducción "en vivo" con buffer: el backend solo refresca cada ~30s, pero
// guardamos su historial de 2s y avanzamos un cursor cada 2s, igual que la
// página japonesa de referencia, para que la animación se sienta continua en
// vez de saltar de golpe cada vez que llegan datos nuevos.
const PLAYBACK_TICK_MS = 2_000;
const PLAYBACK_LAG_POINTS = 4; // colchón (~8s) para no alcanzar el borde del buffer

const SPARKLINE_POINTS = 40;
const SPARKLINE_WIDTH = 84;
const SPARKLINE_HEIGHT = 22;

const liveStations = new Map();

// El backend mantiene un buffer deslizante (los puntos más viejos se
// descartan al llegar nuevos), así que el índice absoluto de una muestra
// cambia con el tiempo. Por eso el cursor de reproducción se guarda como
// una marca de tiempo (playTime) y se busca su posición en cada cuadro,
// en vez de guardar un índice fijo que quedaría apuntando a otra muestra.
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

function ingestLiveSnapshot(stations) {
  for (const st of stations) {
    const series = st.series ?? [];
    let entry = liveStations.get(st.code);

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
      liveStations.set(st.code, entry);
    } else {
      entry.status = st.status;
      entry.error = st.error;
      entry.series = series;
      entry.baseline = st.baseline;

      // Si la muestra que estábamos reproduciendo ya salió del buffer
      // (estación que estuvo caída, salto grande, etc.), reubicamos el cursor.
      if (series.length && (!entry.playTime || entry.playTime < series[0].t)) {
        entry.playTime = initialPlayTime(series);
      }
    }
  }
}

function tickLivePlayback() {
  for (const entry of liveStations.values()) {
    const series = entry.series;
    if (!series.length) continue;

    const idx = indexForPlayTime(series, entry.playTime);
    const playableMaxIndex = series.length - 1 - PLAYBACK_LAG_POINTS;

    if (idx < playableMaxIndex && idx + 1 < series.length) {
      entry.playTime = series[idx + 1].t;
    }
  }

  renderLiveFrame();
}

function sparklinePath(series, playIndex) {
  const from = Math.max(0, playIndex - SPARKLINE_POINTS + 1);
  const slice = series.slice(from, playIndex + 1);
  if (slice.length < 2) return null;

  const values = slice.map((p) => p.rms);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = SPARKLINE_WIDTH / (slice.length - 1);

  return slice
    .map((p, i) => {
      const x = (i * stepX).toFixed(1);
      const y = (SPARKLINE_HEIGHT - ((p.rms - min) / range) * SPARKLINE_HEIGHT).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function renderLiveFrame() {
  liveStationsEl.innerHTML = "";

  let okCount = 0;
  let latestSampleMillis = null;

  for (const entry of liveStations.values()) {
    const playIndex = indexForPlayTime(entry.series, entry.playTime);
    const point = entry.series[playIndex] ?? null;
    const level = point ? classifyLevel(point.rms, entry.baseline) : 0;
    const color = colorForLevel(level);

    if (entry.status === "ok") okCount += 1;
    if (point) {
      const millis = Date.parse(point.t);
      if (Number.isFinite(millis) && (latestSampleMillis === null || millis > latestSampleMillis)) {
        latestSampleMillis = millis;
      }
    }

    let tracked = liveMarkers.get(entry.code);

    if (!tracked) {
      const marker = L.circleMarker([entry.lat, entry.lon], {
        radius: radiusForLevel(level),
        color: "#f5f7fb",
        weight: 1,
        fillColor: color,
        fillOpacity: 0.85,
        dashArray: "2 2"
      }).addTo(liveLayer);

      tracked = { marker, prevLevel: level };
      liveMarkers.set(entry.code, tracked);
    } else {
      tracked.marker.setStyle({ radius: radiusForLevel(level), fillColor: color });
    }

    const rmsText = point ? point.rms.toFixed(1) : "?";
    const sampleTime = point ? new Date(point.t).toLocaleTimeString("es-CL") : "?";

    tracked.marker.bindPopup(`
      <strong>${entry.name} (${entry.code})</strong><br />
      Nivel: ${LEVEL_LABELS[level] ?? "?"}<br />
      Amplitud (RMS, conteos): ${rmsText}<br />
      Línea base local: ${entry.baseline ? entry.baseline.toFixed(1) : "?"}<br />
      Muestra de: ${sampleTime} (hora local del dato, con retraso de archivo)
    `);

    if (tracked.prevLevel !== level && level >= 2) {
      drawPulse({ latitude: entry.lat, longitude: entry.lon, magnitude: 2 + level });
    }
    tracked.prevLevel = level;

    const card = document.createElement("div");
    card.className = "event-card";
    card.style.borderLeftColor = color;

    const statusNote =
      entry.status === "ok"
        ? `Nivel: <strong>${LEVEL_LABELS[level] ?? "?"}</strong> · RMS ${rmsText} (línea base ${entry.baseline ? entry.baseline.toFixed(0) : "?"})`
        : entry.status === "error"
          ? `Sin datos (${entry.error ?? "error desconocido"})`
          : "Cargando datos de la estación...";

    const path = sparklinePath(entry.series, playIndex);
    const sparkline = path
      ? `<svg class="sparkline" width="${SPARKLINE_WIDTH}" height="${SPARKLINE_HEIGHT}" viewBox="0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}">
           <path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
         </svg>`
      : "";

    card.innerHTML = `
      <strong>
        <span class="mag" style="color:${color}">●</span>
        ${entry.name} <small style="font-weight:400">(${entry.code})</small>
      </strong>
      <small>${statusNote}</small>
      <small>Muestra: ${sampleTime}</small>
      ${sparkline}
    `;

    card.addEventListener("click", () => {
      map.setView([entry.lat, entry.lon], 8);
      tracked.marker.openPopup();
    });

    liveStationsEl.appendChild(card);
  }

  const total = liveStations.size;
  const playingTime = latestSampleMillis ? new Date(latestSampleMillis).toLocaleTimeString("es-CL") : "?";
  liveStatusEl.textContent = `Estaciones con datos: ${okCount}/${total} · Reproduciendo muestra de las ${playingTime}`;
}

async function loadLiveStations() {
  try {
    const res = await fetch("/api/live");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || data.error || "Error desconocido");
    }

    if (data.delayMinutes != null) liveDelayEl.textContent = data.delayMinutes;

    ingestLiveSnapshot(data.stations);
  } catch (err) {
    console.error(err);
    liveStatusEl.textContent = `Error al cargar el monitor en vivo: ${err.message}`;
  }
}

loadEvents();
setInterval(loadEvents, 60_000);

loadLiveStations();
setInterval(loadLiveStations, 25_000);
setInterval(tickLivePlayback, PLAYBACK_TICK_MS);
