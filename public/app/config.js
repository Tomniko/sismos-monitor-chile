// ── Configuración compartida del Monitor Sísmico ──────────────────────────
// Paleta, escala de profundidad (convención sismológica), macrozonas,
// estaciones C1 y definiciones de mapas base.

window.SISMO_CONFIG = (() => {
  // Escala de profundidad — convención sismológica: superficial cálido → profundo frío
  const DEPTH_SCALE = [
    { max: 40,       color: "#f4574d", label: "< 40 km",      name: "Muy superficial" },
    { max: 70,       color: "#f9842e", label: "40–70 km",     name: "Superficial" },
    { max: 150,      color: "#eec33c", label: "70–150 km",    name: "Intermedio" },
    { max: 300,      color: "#46c277", label: "150–300 km",   name: "Intermedio profundo" },
    { max: Infinity, color: "#4f8df7", label: "> 300 km",     name: "Profundo" }
  ];

  function depthColor(depthKm) {
    if (!Number.isFinite(depthKm)) return "#8a93a6";
    for (const bin of DEPTH_SCALE) if (depthKm < bin.max) return bin.color;
    return DEPTH_SCALE[DEPTH_SCALE.length - 1].color;
  }

  // Macrozonas de Chile (rangos de latitud aproximados)
  const ZONES = [
    { id: "norte-grande", name: "Norte Grande", short: "N. Grande", latMax: -17.4, latMin: -26.0 },
    { id: "norte-chico",  name: "Norte Chico",  short: "N. Chico",  latMax: -26.0, latMin: -32.0 },
    { id: "centro",       name: "Zona Central", short: "Centro",    latMax: -32.0, latMin: -38.0 },
    { id: "sur",          name: "Zona Sur",     short: "Sur",       latMax: -38.0, latMin: -43.5 },
    { id: "austral",      name: "Zona Austral", short: "Austral",   latMax: -43.5, latMin: -56.5 }
  ];

  // Subconjunto de la red C1 (Red Sismológica Nacional / CSN), norte → sur
  const STATIONS = [
    { code: "AP01", name: "Chacalluta (Arica)", lat: -18.37084, lon: -70.34197 },
    { code: "AP02", name: "Surire", lat: -18.853959, lon: -69.143334 },
    { code: "TA01", name: "Daracena (Tarapacá)", lat: -20.5656, lon: -70.1807 },
    { code: "AF01", name: "San Pedro de Atacama", lat: -22.95196, lon: -68.17876 },
    { code: "AC01", name: "Pan de Azúcar", lat: -26.14788, lon: -70.59866 },
    { code: "AC06", name: "Copiapó", lat: -27.357117, lon: -70.354689 },
    { code: "AC04", name: "Llanos de Challe", lat: -28.204575, lon: -71.073928 },
    { code: "CO05", name: "La Serena", lat: -29.91864, lon: -71.23841 },
    { code: "CO02", name: "Combarbalá", lat: -31.2037, lon: -71.0003 },
    { code: "VA06", name: "Catapilco", lat: -32.56117, lon: -71.29765 },
    { code: "MT07", name: "Cerro El Roble", lat: -32.975956, lon: -71.015636 },
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
    { code: "MG02", name: "Cerro Sombrero", lat: -52.7808, lon: -69.2242 }
  ];

  // Mapas base (capa base + capa opcional de etiquetas encima)
  const BASEMAPS = {
    oscuro: {
      label: "Oscuro",
      base: {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        options: { maxZoom: 12, subdomains: "abcd", attribution: "&copy; OpenStreetMap &copy; CARTO" }
      },
      labels: null
    },
    relieve: {
      label: "Relieve",
      base: {
        url: "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}",
        options: { maxZoom: 12, attribution: "Esri, USGS" }
      },
      labels: {
        url: "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        options: { maxZoom: 12, subdomains: "abcd", attribution: "&copy; CARTO", opacity: 0.9 }
      }
    },
    satelite: {
      label: "Satélite",
      base: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        options: { maxZoom: 12, attribution: "Esri, Maxar, Earthstar Geographics" }
      },
      labels: {
        url: "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        options: { maxZoom: 12, subdomains: "abcd", attribution: "&copy; CARTO", opacity: 0.85 }
      }
    }
  };

  // Niveles del monitor en vivo (relativos al ruido de cada estación)
  const LEVEL_COLORS = ["#3d4759", "#46c277", "#eec33c", "#f9842e", "#f4574d"];
  const LEVEL_LABELS = ["en reposo", "leve", "moderado", "fuerte", "muy fuerte"];

  function classifyLevel(rms, baseline) {
    if (!Number.isFinite(baseline) || baseline <= 0) return 0;
    const ratio = rms / baseline;
    if (ratio < 1.5) return 0;
    if (ratio < 3) return 1;
    if (ratio < 6) return 2;
    if (ratio < 12) return 3;
    return 4;
  }

  function magRadius(mag) {
    return Math.max(4, 2 + mag * mag * 0.55);
  }

  const CHILE_BOUNDS = [[-56.6, -78.5], [-17.2, -65.0]];
  const CHILE_VIEW = { center: [-33.0, -71.5], zoom: 5 };

  return {
    DEPTH_SCALE, depthColor, ZONES, STATIONS, BASEMAPS,
    LEVEL_COLORS, LEVEL_LABELS, classifyLevel, magRadius,
    CHILE_BOUNDS, CHILE_VIEW,
    LAT_TOP: -17.4, LAT_BOTTOM: -56.5
  };
})();
