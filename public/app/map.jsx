// ── MapView: mapa Leaflet controlado desde React ──────────────────────────
const { useEffect, useRef } = React;
const MC = window.SISMO_CONFIG;

function timeAgoShort(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h ${m % 60} min`;
  return `hace ${Math.floor(h / 24)} días`;
}

function MapView({
  events,
  selectedId,
  onSelect,
  basemap,
  stations,
  animIntensity,
  pulseQueue,        // [{lat, lon, mag, depth, key}] — eventos a pulsar
  onPulsesConsumed,
  mapApiRef,
  onLatRange
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const markersRef = useRef(new Map());
  const stationMarkersRef = useRef(new Map());
  const animRef = useRef(1);

  animRef.current = animIntensity;

  // init
  useEffect(() => {
    const map = L.map(hostRef.current, {
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: false,
      maxBounds: [[-66, -110], [-5, -40]],
      minZoom: 4
    }).setView(MC.CHILE_VIEW.center, MC.CHILE_VIEW.zoom);

    L.control.zoom({ position: "topright" }).addTo(map);

    mapRef.current = map;
    layersRef.current = {
      base: null,
      labels: null,
      rings: L.layerGroup().addTo(map),
      stations: L.layerGroup().addTo(map),
      events: L.layerGroup().addTo(map)
    };

    if (mapApiRef) {
      mapApiRef.current = {
        flyToEvent: (ev, zoom = 7) => map.flyTo([ev.lat, ev.lon], zoom, { duration: 0.9 }),
        fitZone: (zone) =>
          map.flyToBounds([[zone.latMin, -76.5], [zone.latMax, -66.5]], { duration: 0.9 }),
        panToLat: (lat) => map.panTo([lat, map.getCenter().lng], { animate: false }),
        fitChile: () => map.flyToBounds(MC.CHILE_BOUNDS, { duration: 0.9 })
      };
    }

    const reportRange = () => {
      const b = map.getBounds();
      onLatRange && onLatRange([b.getNorth(), b.getSouth()]);
    };
    map.on("moveend zoomend", reportRange);
    reportRange();

    setTimeout(() => map.invalidateSize(), 60);

    return () => map.remove();
  }, []);

  // mapa base
  useEffect(() => {
    const map = mapRef.current;
    const Ls = layersRef.current;
    if (!map) return;

    const def = MC.BASEMAPS[basemap] ?? MC.BASEMAPS.oscuro;

    if (Ls.base) map.removeLayer(Ls.base);
    if (Ls.labels) { map.removeLayer(Ls.labels); Ls.labels = null; }

    Ls.base = L.tileLayer(def.base.url, def.base.options).addTo(map);
    Ls.base.bringToBack();

    if (def.labels) {
      Ls.labels = L.tileLayer(def.labels.url, { ...def.labels.options, pane: "overlayPane" }).addTo(map);
    }
  }, [basemap]);

  // estaciones (capa sutil, siempre presente)
  useEffect(() => {
    const Ls = layersRef.current;
    if (!Ls.stations) return;

    for (const st of stations) {
      let mk = stationMarkersRef.current.get(st.code);
      const color = MC.LEVEL_COLORS[st.level];
      const active = st.level > 0;

      if (!mk) {
        mk = L.circleMarker([st.lat, st.lon], {
          radius: 3.5,
          color: "rgba(238,242,249,0.55)",
          weight: 1,
          fillColor: color,
          fillOpacity: 0.9,
          interactive: true
        }).addTo(Ls.stations);
        mk.bindTooltip("", { direction: "right", offset: [8, 0], opacity: 0.95 });
        stationMarkersRef.current.set(st.code, mk);
      }

      mk.setStyle({
        radius: active ? 4.5 + st.level * 2 : 3.5,
        fillColor: color,
        fillOpacity: active ? 0.95 : 0.55,
        color: active ? "#fff" : "rgba(238,242,249,0.4)"
      });
      mk.setTooltipContent(
        `<b>${st.name}</b> (${st.code})<br/>` +
        `Nivel: ${MC.LEVEL_LABELS[st.level]} · RMS ${st.current ? st.current.rms.toFixed(0) : "?"}`
      );

      // pulso al subir de nivel
      if (st.level >= 2 && mk.__prevLevel !== st.level && animRef.current > 0.05) {
        spawnRing(st.lat, st.lon, MC.LEVEL_COLORS[st.level], 0.5 + st.level * 0.18);
      }
      mk.__prevLevel = st.level;
    }
  }, [stations]);

  // eventos
  useEffect(() => {
    const Ls = layersRef.current;
    if (!Ls.events) return;

    const seen = new Set();

    for (const ev of events) {
      seen.add(ev.id);
      let mk = markersRef.current.get(ev.id);
      const color = MC.depthColor(ev.depth);
      const isSel = ev.id === selectedId;

      if (!mk) {
        mk = L.circleMarker([ev.lat, ev.lon], {
          radius: MC.magRadius(ev.mag),
          color: "rgba(10,14,22,0.85)",
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.78
        }).addTo(Ls.events);

        mk.bindPopup(popupHtml(ev), { closeButton: false });
        mk.on("click", () => onSelect && onSelect(ev.id));
        markersRef.current.set(ev.id, mk);
      }

      mk.setStyle({
        fillColor: color,
        radius: MC.magRadius(ev.mag) * (isSel ? 1.25 : 1),
        color: isSel ? "#fff" : "rgba(10,14,22,0.85)",
        weight: isSel ? 2 : 1.5,
        fillOpacity: isSel ? 0.95 : 0.78
      });
      if (isSel) mk.bringToFront();
    }

    for (const [id, mk] of markersRef.current) {
      if (!seen.has(id)) {
        Ls.events.removeLayer(mk);
        markersRef.current.delete(id);
      }
    }
  }, [events, selectedId]);

  // abrir popup del seleccionado
  useEffect(() => {
    if (!selectedId) return;
    const mk = markersRef.current.get(selectedId);
    const ev = events.find((e) => e.id === selectedId);
    if (mk && ev) {
      mk.setPopupContent(popupHtml(ev));
      mk.openPopup();
    }
  }, [selectedId]);

  // pulsos pendientes (replay / evento nuevo)
  useEffect(() => {
    if (!pulseQueue.length) return;
    if (animRef.current > 0.05) {
      for (const p of pulseQueue) {
        spawnRing(p.lat, p.lon, MC.depthColor(p.depth), Math.max(0.5, p.mag / 6));
      }
    }
    onPulsesConsumed && onPulsesConsumed();
  }, [pulseQueue]);

  function spawnRing(lat, lon, color, scale) {
    const Ls = layersRef.current;
    if (!Ls.rings) return;
    const intensity = animRef.current;

    const ring = L.circle([lat, lon], {
      radius: 9000,
      color,
      fillColor: color,
      fillOpacity: 0.12 * intensity,
      weight: 2
    }).addTo(Ls.rings);

    let radius = 9000;
    let opacity = 0.4 * intensity;
    const grow = 8500 * scale * (0.6 + intensity * 0.6);

    const timer = setInterval(() => {
      radius += grow;
      opacity -= 0.022;
      ring.setRadius(radius);
      ring.setStyle({ opacity: Math.max(opacity, 0), fillOpacity: Math.max(opacity / 3.4, 0) });
      if (opacity <= 0) {
        clearInterval(timer);
        Ls.rings.removeLayer(ring);
      }
    }, 110);
  }

  function popupHtml(ev) {
    const color = MC.depthColor(ev.depth);
    const local = new Date(ev.time).toLocaleString("es-CL", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });
    return (
      `<span class="popup-mag" style="color:${color}">M ${ev.mag.toFixed(1)}</span><br/>` +
      `<b>${ev.place}</b><br/>` +
      `Profundidad: ${Math.round(ev.depth)} km · ${local}<br/>` +
      `<span style="color:var(--ink-3)">${timeAgoShort(ev.time)}</span>`
    );
  }

  return <div className="map-host" ref={hostRef}></div>;
}

window.MapView = MapView;
window.timeAgoShort = timeAgoShort;
