// ── Paneles: hero, stats, filtros, lista, rail de Chile, muro de estaciones ─
const { useState: pUseState, useEffect: pUseEffect, useRef: pUseRef, useMemo: pUseMemo } = React;
const PC = window.SISMO_CONFIG;

// ── Hero del último evento ──
function HeroCard({ event, now, onClick }) {
  if (!event) {
    return (
      <div className="panel hero">
        <div className="label"><span>Último evento</span></div>
        <div className="meta"><div className="place" style={{ color: "var(--ink-3)" }}>Cargando catálogo…</div></div>
      </div>
    );
  }

  const color = PC.depthColor(event.depth);
  const local = new Date(event.time).toLocaleString("es-CL", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });

  return (
    <div className="panel hero" onClick={() => onClick(event)} title="Ver en el mapa">
      <div className="label">
        <span>Último evento</span>
        <span className="ago">{window.timeAgoShort(event.time)}</span>
      </div>
      <div className="mag" style={{ color }}><small>M</small> {event.mag.toFixed(1)}</div>
      <div className="meta">
        <div className="place">{event.place}</div>
        <div className="detail">
          <span className="depth-chip"><i style={{ background: color }}></i>{Math.round(event.depth)} km</span>
          <span>{local}</span>
        </div>
      </div>
    </div>
  );
}

// ── Estadísticas del día ──
function StatsRow({ events }) {
  const now = Date.now();
  const day = events.filter((e) => now - e.time < 24 * 3600 * 1000);
  const maxMag = events.length ? Math.max(...events.map((e) => e.mag)) : null;
  const m4 = day.filter((e) => e.mag >= 4).length;

  return (
    <div className="panel stats">
      <div className="stat"><b>{day.length}</b><span>Sismos · 24 h</span></div>
      <div className="stat"><b>{m4}</b><span>M ≥ 4 · 24 h</span></div>
      <div className="stat"><b>{maxMag ? maxMag.toFixed(1) : "–"}</b><span>M máx · 7 d</span></div>
    </div>
  );
}

// ── Filtros ──
const DEPTH_FILTERS = [
  { id: "todas", label: "Todas", test: () => true, color: null },
  { id: "sup", label: "< 70 km", test: (d) => d < 70, color: "#f4574d" },
  { id: "int", label: "70–300", test: (d) => d >= 70 && d < 300, color: "#eec33c" },
  { id: "prof", label: "> 300", test: (d) => d >= 300, color: "#4f8df7" }
];

function FiltersCard({ minMag, setMinMag, depthId, setDepthId }) {
  return (
    <div className="panel filters">
      <div className="row">
        <label>Magnitud</label>
        <input
          type="range" min="2.5" max="6" step="0.1" value={minMag}
          onChange={(e) => setMinMag(parseFloat(e.target.value))}
        />
        <span className="val">≥ {minMag.toFixed(1)}</span>
      </div>
      <div className="row">
        <label>Profund.</label>
        <div className="chip-row">
          {DEPTH_FILTERS.map((f) => (
            <button
              key={f.id}
              className={"chip" + (depthId === f.id ? " on" : "")}
              onClick={() => setDepthId(f.id)}
            >
              {f.color ? <i style={{ background: f.color }}></i> : null}{f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Rail de Chile (navegador lateral por latitud) ──
function ChileRail({ events, latRange, onZone, onLat }) {
  const hostRef = pUseRef(null);
  const [size, setSize] = pUseState({ w: 64, h: 400 });
  const [hoverZone, setHoverZone] = pUseState(null);

  pUseEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dragging = pUseRef(false);
  const { w, h } = size;

  // Oculto (display:none en móvil) o aún sin medir: no dibujar nada,
  // las dimensiones derivadas saldrían negativas.
  if (w < 20 || h < 40) {
    return <div className="chile-rail" ref={hostRef} />;
  }

  const padT = 8, padB = 8;
  const latToY = (lat) => padT + ((PC.LAT_TOP - lat) / (PC.LAT_TOP - PC.LAT_BOTTOM)) * (h - padT - padB);
  const yToLat = (y) => PC.LAT_TOP - ((y - padT) / (h - padT - padB)) * (PC.LAT_TOP - PC.LAT_BOTTOM);
  const lonToX = (lon) => 14 + ((lon + 77) / 11) * (w - 26);

  function handlePointer(e) {
    const rect = hostRef.current.getBoundingClientRect();
    const lat = yToLat(e.clientY - rect.top);
    onLat(Math.max(PC.LAT_BOTTOM, Math.min(PC.LAT_TOP, lat)));
  }

  const vpTop = latRange ? latToY(Math.min(PC.LAT_TOP, latRange[0])) : null;
  const vpBot = latRange ? latToY(Math.max(PC.LAT_BOTTOM, latRange[1])) : null;

  return (
    <div className="chile-rail" ref={hostRef}>
      <svg
        width={w} height={h}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e); }}
        onPointerMove={(e) => dragging.current && handlePointer(e)}
        onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
      >
        {/* bandas de macrozonas */}
        {PC.ZONES.map((z, i) => {
          const y1 = latToY(z.latMax), y2 = latToY(z.latMin);
          return (
            <g key={z.id}
               onMouseEnter={() => setHoverZone(z.id)}
               onMouseLeave={() => setHoverZone(null)}
               onClick={(e) => { e.stopPropagation(); onZone(z); }}>
              <rect
                className="zone-band"
                x="3" y={y1} width={w - 6} height={y2 - y1}
                rx="6"
                fill={hoverZone === z.id ? "rgba(110,168,255,0.13)" : i % 2 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.055)"}
              />
              <text className="zone-label" x={w / 2} y={(y1 + y2) / 2}
                    textAnchor="middle" transform={`rotate(-90 ${w / 2} ${(y1 + y2) / 2})`}>
                {z.short}
              </text>
            </g>
          );
        })}

        {/* eventos por latitud */}
        {events.map((ev) => (
          <circle
            key={ev.id}
            cx={lonToX(ev.lon)} cy={latToY(ev.lat)}
            r={Math.max(1.4, ev.mag - 1.8)}
            fill={PC.depthColor(ev.depth)}
            opacity="0.85"
            pointerEvents="none"
          />
        ))}

        {/* indicador del viewport del mapa */}
        {vpTop !== null && vpBot > vpTop ? (
          <g pointerEvents="none">
            <rect x="1" y={vpTop} width={w - 2} height={Math.max(8, vpBot - vpTop)} rx="5"
                  fill="none" stroke="rgba(110,168,255,0.85)" strokeWidth="1.5" />
            <rect x="1" y={vpTop} width={w - 2} height={Math.max(8, vpBot - vpTop)} rx="5"
                  fill="rgba(110,168,255,0.07)" />
          </g>
        ) : null}
      </svg>
    </div>
  );
}

// ── Lista de eventos ──
function EventList({ events, selectedId, onSelect }) {
  return (
    <div className="event-list">
      {events.length === 0 ? (
        <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-small)", padding: "8px 4px" }}>
          Sin eventos con estos filtros.
        </p>
      ) : events.map((ev) => {
        const color = PC.depthColor(ev.depth);
        return (
          <div
            key={ev.id}
            className={"event-card" + (ev.id === selectedId ? " selected" : "")}
            onClick={() => onSelect(ev)}
          >
            <div className="em" style={{ color }}>{ev.mag.toFixed(1)}</div>
            <div className="ep">{ev.place}</div>
            <div className="ed">
              <span><i style={{ background: color }}></i>{Math.round(ev.depth)} km</span>
              <span>{window.timeAgoShort(ev.time)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Muro de estaciones estilo Kyoshin ──
const SPARK_W = 120, SPARK_H = 18, SPARK_POINTS = 46;

function sparkPath(series) {
  const slice = series.slice(-SPARK_POINTS);
  if (slice.length < 2) return null;
  const values = slice.map((p) => p.rms);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const stepX = SPARK_W / (slice.length - 1);
  return slice
    .map((p, i) => {
      const x = (i * stepX).toFixed(1);
      const y = (SPARK_H - 2 - ((p.rms - min) / range) * (SPARK_H - 4)).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function StationWall({ stations, onStation }) {
  const sorted = pUseMemo(
    () => [...stations].sort((a, b) => b.lat - a.lat),
    [stations]
  );

  return (
    <div className="panel station-wall">
      <div className="section-title">
        <span>Monitor en vivo · N → S</span>
        <span className="count" style={{ color: "var(--live)" }}>red C1 · ~4 min</span>
      </div>
      <div className="station-list">
        {sorted.map((st) => {
          const color = PC.LEVEL_COLORS[st.level];
          const path = sparkPath(st.series);
          return (
            <div key={st.code} className="station-row" onClick={() => onStation(st)}
                 title={`${st.name} — nivel ${PC.LEVEL_LABELS[st.level]}`}>
              <div className="lv" style={{
                background: color,
                boxShadow: st.level >= 2 ? `0 0 8px ${color}` : "none"
              }}></div>
              <div className="sc">{st.code}</div>
              <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
                {path ? (
                  <path d={path} fill="none"
                        stroke={st.level > 0 ? color : "rgba(170,180,200,0.5)"}
                        strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
                ) : null}
              </svg>
            </div>
          );
        })}
      </div>
      <div className="wall-note">
        Amplitud del suelo cada 2 s, red C1 (CSN) vía EarthScope/IRIS, con ~4 min de
        retraso de archivo. Niveles relativos al ruido de cada estación — no es una
        escala de intensidad calibrada ni una alerta oficial.
      </div>
    </div>
  );
}

// ── Selector de mapa base + leyenda ──
function BasemapSwitch({ value, onChange }) {
  return (
    <div className="panel basemap-switch">
      {Object.entries(PC.BASEMAPS).map(([id, def]) => (
        <button key={id} className={value === id ? "on" : ""} onClick={() => onChange(id)}>
          {def.label}
        </button>
      ))}
    </div>
  );
}

function DepthLegend() {
  return (
    <div className="panel legend">
      <div className="lt">Profundidad</div>
      {PC.DEPTH_SCALE.map((bin) => (
        <div className="li" key={bin.label}><i style={{ background: bin.color }}></i>{bin.label}</div>
      ))}
    </div>
  );
}

Object.assign(window, {
  HeroCard, StatsRow, FiltersCard, ChileRail, EventList, StationWall,
  BasemapSwitch, DepthLegend, DEPTH_FILTERS
});
