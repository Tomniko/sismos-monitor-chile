// ── Composición principal ──────────────────────────────────────────────────
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const AC = window.SISMO_CONFIG;
const AD = window.SISMO_DATA;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "flotante",
  "density": "cómoda",
  "basemap": "relieve",
  "anim": 100
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [events, setEvents] = useState([]);
  const [source, setSource] = useState("usgs");
  const [stations, setStations] = useState([]);
  const [minMag, setMinMag] = useState(2.5);
  const [depthId, setDepthId] = useState("todas");
  const [selectedId, setSelectedId] = useState(null);
  const [replayTime, setReplayTime] = useState(null); // null = en vivo
  const [playing, setPlaying] = useState(false);
  const [latRange, setLatRange] = useState(null);
  const [pulseQueue, setPulseQueue] = useState([]);
  const [mobileTab, setMobileTab] = useState("eventos");
  const [, forceTick] = useState(0); // re-render p/ contador "hace X"

  const mapApiRef = useRef(null);
  const simRef = useRef(null);
  const lastNewestRef = useRef(null);
  const prevReplayRef = useRef(null);

  // ── carga de eventos (CSN, con respaldo USGS y demo) ──
  useEffect(() => {
    let alive = true;

    async function load() {
      const { events: evs, source: src } = await AD.fetchEvents();
      if (!alive) return;
      setEvents(evs);
      setSource(src);
      if (lastNewestRef.current && evs[0] && evs[0].id !== lastNewestRef.current) {
        setPulseQueue((q) => [...q, { ...evs[0], key: evs[0].id }]);
      }
      if (evs[0]) lastNewestRef.current = evs[0].id;
    }

    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  // ── monitor en vivo: cliente de /api/live (red C1 vía EarthScope) ──
  useEffect(() => {
    const client = new AD.LiveClient();
    simRef.current = client;
    client.start();
    setStations(client.snapshot());
    const timer = setInterval(() => {
      client.tick();
      setStations(client.snapshot());
    }, AD.TICK_MS);
    return () => { clearInterval(timer); client.stop(); };
  }, []);

  // contador "hace X" cada segundo
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── filtros ──
  const depthFilter = window.DEPTH_FILTERS.find((f) => f.id === depthId) ?? window.DEPTH_FILTERS[0];

  const filtered = useMemo(
    () => events.filter((e) => e.mag >= minMag && depthFilter.test(e.depth)),
    [events, minMag, depthId]
  );

  // en replay: solo eventos dentro de la ventana y antes del cursor
  const visible = useMemo(() => {
    if (replayTime === null) return filtered;
    const t0 = Date.now() - window.REPLAY_HOURS * 3600 * 1000;
    return filtered.filter((e) => e.time >= t0 && e.time <= replayTime);
  }, [filtered, replayTime]);

  // pulsos al cruzar eventos durante el replay
  useEffect(() => {
    const prev = prevReplayRef.current;
    prevReplayRef.current = replayTime;
    if (replayTime === null || prev === null || replayTime <= prev) return;
    const crossed = filtered.filter((e) => e.time > prev && e.time <= replayTime);
    if (crossed.length) {
      setPulseQueue((q) => [...q, ...crossed.map((e) => ({ ...e, key: e.id + replayTime }))]);
    }
  }, [replayTime]);

  // ── acciones ──
  const selectEvent = useCallback((ev) => {
    setSelectedId(ev.id);
    mapApiRef.current && mapApiRef.current.flyToEvent(ev);
  }, []);

  const handleZone = useCallback((zone) => {
    mapApiRef.current && mapApiRef.current.fitZone(zone);
  }, []);

  const handleLat = useCallback((lat) => {
    mapApiRef.current && mapApiRef.current.panToLat(lat);
  }, []);

  const handleStation = useCallback((st) => {
    mapApiRef.current && mapApiRef.current.flyToEvent({ lat: st.lat, lon: st.lon }, 8);
  }, []);

  const newest = events[0] ?? null;
  const animIntensity = (t.anim ?? 100) / 100;
  const isReplay = replayTime !== null;

  return (
    <div className={`app layout-${t.layout}${t.density === "compacta" ? " density-compacta" : ""}`}>
      <MapView
        events={visible}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        basemap={t.basemap}
        stations={stations}
        animIntensity={animIntensity}
        pulseQueue={pulseQueue}
        onPulsesConsumed={() => setPulseQueue([])}
        mapApiRef={mapApiRef}
        onLatRange={setLatRange}
      />

      {/* columna izquierda */}
      <div className="left-col">
        <div className="panel brand">
          <h1>
            Sismos Chile
            <span className="sub">
              {source === "csn"
                ? "Catálogo CSN · últimos 7 días"
                : source === "usgs"
                  ? "Catálogo USGS (respaldo) · últimos 7 días"
                  : "Datos de demostración (sin conexión)"}
            </span>
          </h1>
          <span className="live-badge"><span className="dot"></span>{isReplay ? "REPLAY" : "EN VIVO"}</span>
        </div>

        <HeroCard event={newest} onClick={selectEvent} />
        <StatsRow events={events} />
        <FiltersCard minMag={minMag} setMinMag={setMinMag} depthId={depthId} setDepthId={setDepthId} />

        <div className="panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="section-title">
            <span>{isReplay ? "Hasta el cursor del replay" : "Eventos recientes"}</span>
            <span className="count">{visible.length}</span>
          </div>
          <div className="list-body">
            <ChileRail events={visible} latRange={latRange} onZone={handleZone} onLat={handleLat} />
            <EventList events={visible} selectedId={selectedId} onSelect={selectEvent} />
          </div>
        </div>
      </div>

      {/* columna derecha: muro de estaciones */}
      <div className={"right-col" + (mobileTab === "estaciones" ? " mobile-visible" : "")}>
        <StationWall stations={stations} onStation={handleStation} />
      </div>

      <BasemapSwitch value={t.basemap} onChange={(v) => setTweak("basemap", v)} />
      <DepthLegend />

      <Timeline
        events={filtered}
        replayTime={replayTime}
        setReplayTime={setReplayTime}
        playing={playing}
        setPlaying={setPlaying}
      />

      {/* tabs móviles */}
      <div className="panel mobile-tabs">
        <button className={mobileTab === "eventos" ? "on" : ""} onClick={() => setMobileTab("eventos")}>Eventos</button>
        <button className={mobileTab === "estaciones" ? "on" : ""} onClick={() => setMobileTab("estaciones")}>Estaciones</button>
      </div>

      <TweaksPanel>
        <TweakSection label="Distribución" />
        <TweakRadio label="Paneles" value={t.layout} options={["flotante", "lateral"]}
                    onChange={(v) => setTweak("layout", v)} />
        <TweakRadio label="Densidad" value={t.density} options={["cómoda", "compacta"]}
                    onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Mapa" />
        <TweakRadio label="Estilo base" value={t.basemap} options={["oscuro", "relieve", "satelite"]}
                    onChange={(v) => setTweak("basemap", v)} />
        <TweakSection label="Animación" />
        <TweakSlider label="Intensidad de pulsos" value={t.anim} min={0} max={150} step={10} unit="%"
                     onChange={(v) => setTweak("anim", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
