import * as miniseed from "seisplotjs-miniseed";

// Subconjunto de la red C1 (Red Sismológica Nacional / CSN, Universidad de Chile),
// elegido para cubrir el país de norte a sur (Arica a Magallanes).
// Datos abiertos vía EarthScope (antes IRIS): https://www.fdsn.org/networks/detail/C1/
export const STATIONS = [
  { code: "AP01", name: "Chacalluta (Arica)", lat: -18.37084, lon: -70.34197 },
  { code: "AP02", name: "Surire", lat: -18.853959, lon: -69.143334 },
  { code: "AF01", name: "San Pedro de Atacama", lat: -22.95196, lon: -68.17876 },
  { code: "TA01", name: "Daracena (Tarapacá)", lat: -20.5656, lon: -70.1807 },
  { code: "AC01", name: "Pan de Azúcar", lat: -26.14788, lon: -70.59866 },
  { code: "AC06", name: "Copiapó", lat: -27.357117, lon: -70.354689 },
  { code: "AC04", name: "Llanos de Challe", lat: -28.204575, lon: -71.073928 },
  { code: "CO05", name: "La Serena", lat: -29.91864, lon: -71.23841 },
  { code: "CO02", name: "Combarbalá", lat: -31.2037, lon: -71.0003 },
  { code: "MT07", name: "Cerro El Roble", lat: -32.975956, lon: -71.015636 },
  { code: "VA06", name: "Catapilco", lat: -32.56117, lon: -71.29765 },
  { code: "MT02", name: "Curacaví", lat: -33.2591, lon: -71.1377 },
  { code: "MT09", name: "Talagante", lat: -33.77622, lon: -70.98867 },
  { code: "BO01", name: "Tunca", lat: -34.3917, lon: -71.0848 },
  { code: "BO03", name: "Pichilemu", lat: -34.49605, lon: -71.9612 },
  { code: "ML02", name: "Panimávida", lat: -35.7626, lon: -71.4181 },
  { code: "BI05", name: "Faro Punta Hualpén", lat: -36.74784, lon: -73.19051 },
  { code: "BI07", name: "Lebu", lat: -37.68037, lon: -73.64293 },
  { code: "LC02", name: "Puerto Saavedra", lat: -38.79189, lon: -73.39471 },
  { code: "LR03", name: "Panguipulli", lat: -39.632184, lon: -72.345701 },
  { code: "LR04", name: "Corral", lat: -39.88019, lon: -73.425822 },
  { code: "LL03", name: "Lodge Petrohué", lat: -41.1384, lon: -72.40336 },
  { code: "LL05", name: "Los Muermos", lat: -41.405341, lon: -73.47445 },
  { code: "AY05", name: "Puerto Aguirre", lat: -45.150958, lon: -73.511667 },
  { code: "AY04", name: "Chile Chico", lat: -46.582606, lon: -71.6909 },
  { code: "AY03", name: "Cochrane", lat: -47.253042, lon: -72.590769 },
  { code: "MG02", name: "Cerro Sombrero", lat: -52.7808, lon: -69.2242 },
  { code: "IN44", name: "Base Arturo Prat (Antártica)", lat: -62.478742, lon: -59.664009 }
];

const FETCH_CONCURRENCY = 6;

const NETWORK = "C1";
const CHANNEL = "BHZ";
const FDSN_DATASELECT = "https://service.earthscope.org/fdsnws/dataselect/1/query";

const WINDOW_SECONDS = 2; // igual cadencia que la página de referencia japonesa ("2sec")
const FETCH_DELAY_MINUTES = 4; // EarthScope publica datos del C1 con ~2 min de retraso; dejamos margen
const FETCH_WINDOW_MINUTES = 4;
const REFRESH_INTERVAL_MS = 30_000;
const MAX_POINTS_KEPT = 240; // ~8 minutos de historial a 2s por punto

export const DATA_DELAY_MINUTES = FETCH_DELAY_MINUTES;

const cache = new Map();

function isoNoMillis(date) {
  return date.toISOString().slice(0, 19);
}

async function fetchStationBuffer(stationCode) {
  const end = new Date(Date.now() - FETCH_DELAY_MINUTES * 60_000);
  const start = new Date(end.getTime() - FETCH_WINDOW_MINUTES * 60_000);

  const url = `${FDSN_DATASELECT}?net=${NETWORK}&sta=${stationCode}&loc=*&cha=${CHANNEL}&start=${isoNoMillis(start)}&end=${isoNoMillis(end)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "sismos-monitor-chile-prototype/1.0" }
  });

  if (res.status === 204) return null; // sin datos en la ventana solicitada
  if (!res.ok) throw new Error(`HTTP ${res.status} al consultar ${stationCode}`);

  const arrayBuffer = await res.arrayBuffer();
  const records = miniseed.parseDataRecords(arrayBuffer);
  if (!records.length) return null;

  const segments = miniseed.merge(records);
  if (!segments.length) return null;

  // Tomamos el segmento continuo más largo disponible.
  segments.sort((a, b) => b.numPoints() - a.numPoints());
  return segments[0];
}

function computeIntensitySeries(segment) {
  const samples = segment.y();
  const sampleRate = segment.sampleRate();
  const startMillis = segment.start().toDate().getTime();
  const samplesPerWindow = Math.max(1, Math.round(sampleRate * WINDOW_SECONDS));

  const series = [];

  for (let i = 0; i + samplesPerWindow <= samples.length; i += samplesPerWindow) {
    let sum = 0;
    for (let j = i; j < i + samplesPerWindow; j++) sum += samples[j];
    const mean = sum / samplesPerWindow;

    let sqSum = 0;
    for (let j = i; j < i + samplesPerWindow; j++) {
      const d = samples[j] - mean;
      sqSum += d * d;
    }
    const rms = Math.sqrt(sqSum / samplesPerWindow);
    const tMillis = startMillis + (i / sampleRate) * 1000;

    series.push({ t: new Date(tMillis).toISOString(), rms });
  }

  return series;
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

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function refreshStation(station) {
  try {
    const segment = await fetchStationBuffer(station.code);
    if (!segment) return;

    const freshSeries = computeIntensitySeries(segment);
    if (!freshSeries.length) return;

    const existing = cache.get(station.code);
    const previousSeries = existing?.series ?? [];

    const lastKnownT = previousSeries.length ? previousSeries[previousSeries.length - 1].t : null;
    const appended = lastKnownT
      ? freshSeries.filter((p) => p.t > lastKnownT)
      : freshSeries;

    const merged = [...previousSeries, ...appended].slice(-MAX_POINTS_KEPT);
    const baseline = median(merged.map((p) => p.rms)) ?? merged[merged.length - 1].rms;

    cache.set(station.code, {
      station,
      series: merged,
      baseline,
      updatedAt: new Date().toISOString(),
      error: null
    });
  } catch (err) {
    const existing = cache.get(station.code);
    cache.set(station.code, {
      ...(existing ?? { station, series: [], baseline: null }),
      station,
      updatedAt: new Date().toISOString(),
      error: err.message
    });
  }
}

async function mapWithConcurrency(items, limit, fn) {
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function refreshAll() {
  await mapWithConcurrency(STATIONS, FETCH_CONCURRENCY, refreshStation);
}

let started = false;

export function startLiveSeismicPolling() {
  if (started) return;
  started = true;

  refreshAll();
  setInterval(refreshAll, REFRESH_INTERVAL_MS);
}

export function getLiveSnapshot() {
  return STATIONS.map((station) => {
    const entry = cache.get(station.code);

    if (!entry || !entry.series.length) {
      return {
        ...station,
        status: entry?.error ? "error" : "loading",
        error: entry?.error ?? null,
        updatedAt: entry?.updatedAt ?? null,
        series: [],
        baseline: null,
        current: null,
        level: 0
      };
    }

    const current = entry.series[entry.series.length - 1];

    return {
      ...station,
      status: "ok",
      error: entry.error,
      updatedAt: entry.updatedAt,
      series: entry.series,
      baseline: entry.baseline,
      current,
      level: classifyLevel(current.rms, entry.baseline)
    };
  });
}
