// ── Timeline: replay de las últimas 48 h ──────────────────────────────────
const { useState: tUseState, useEffect: tUseEffect, useRef: tUseRef, useMemo: tUseMemo } = React;
const TC = window.SISMO_CONFIG;

const REPLAY_HOURS = 48;
const SPEEDS = [1, 2, 4]; // horas de datos por segundo real

function Timeline({ events, replayTime, setReplayTime, playing, setPlaying }) {
  const trackRef = tUseRef(null);
  const [trackW, setTrackW] = tUseState(400);
  const [speedIdx, setSpeedIdx] = tUseState(1);

  const now = Date.now();
  const t0 = now - REPLAY_HOURS * 3600 * 1000;
  const isLive = replayTime === null;
  const cursorT = isLive ? now : replayTime;

  tUseEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // avance del replay
  tUseEffect(() => {
    if (!playing || isLive) return;
    const stepMs = 100;
    const timer = setInterval(() => {
      setReplayTime((t) => {
        const next = t + SPEEDS[speedIdx] * 3600 * 1000 * (stepMs / 1000);
        if (next >= Date.now()) { setPlaying(false); return null; } // llegó al presente → en vivo
        return next;
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [playing, isLive, speedIdx]);

  // histograma de eventos por hora
  const bars = tUseMemo(() => {
    const bins = new Array(REPLAY_HOURS).fill(null).map(() => ({ n: 0, maxMag: 0, depth: null }));
    for (const ev of events) {
      if (ev.time < t0) continue;
      const i = Math.min(REPLAY_HOURS - 1, Math.floor((ev.time - t0) / 3600 / 1000));
      bins[i].n += 1;
      if (ev.mag > bins[i].maxMag) { bins[i].maxMag = ev.mag; bins[i].depth = ev.depth; }
    }
    return bins;
  }, [events, Math.floor(now / 600000)]);

  const tToX = (t) => ((t - t0) / (now - t0)) * trackW;

  function scrub(e) {
    const rect = trackRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = t0 + frac * (now - t0);
    setReplayTime(t >= now - 30000 ? null : t);
  }

  const draggingRef = tUseRef(false);
  const barW = trackW / REPLAY_HOURS;
  const cursorLabel = isLive
    ? "ahora"
    : new Date(cursorT).toLocaleString("es-CL", { weekday: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="panel timeline-bar">
      <button
        className="tl-btn"
        title={playing ? "Pausar" : "Reproducir últimas 48 h"}
        onClick={() => {
          if (playing) { setPlaying(false); return; }
          if (isLive) setReplayTime(t0);
          setPlaying(true);
        }}
      >
        {playing ? (
          <svg width="13" height="13" viewBox="0 0 13 13"><rect x="1.5" y="1" width="3.4" height="11" rx="1.2" fill="currentColor"></rect><rect x="8" y="1" width="3.4" height="11" rx="1.2" fill="currentColor"></rect></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13"><path d="M2.5 1.2 L11.5 6.5 L2.5 11.8 Z" fill="currentColor"></path></svg>
        )}
      </button>

      <button className="tl-speed" title="Velocidad de reproducción"
              onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}>
        {SPEEDS[speedIdx]}h/s
      </button>

      <div
        className="tl-track" ref={trackRef}
        onPointerDown={(e) => { draggingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); setPlaying(false); scrub(e); }}
        onPointerMove={(e) => draggingRef.current && scrub(e)}
        onPointerUp={(e) => { draggingRef.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
      >
        <svg width={trackW} height="46">
          <line x1="0" y1="40" x2={trackW} y2="40" stroke="rgba(148,163,190,0.25)" strokeWidth="1"></line>
          {bars.map((b, i) =>
            b.n > 0 ? (
              <rect
                key={i}
                x={i * barW + 1}
                y={40 - Math.min(34, 4 + b.maxMag * b.maxMag * 0.85)}
                width={Math.max(2, barW - 2)}
                height={Math.min(34, 4 + b.maxMag * b.maxMag * 0.85)}
                rx="1.5"
                fill={TC.depthColor(b.depth)}
                opacity={t0 + i * 3600000 <= cursorT ? 0.9 : 0.28}
              ></rect>
            ) : null
          )}
          {/* marcas de día */}
          {[0, 24, 48].map((h) => (
            <text key={h} x={Math.min(trackW - 22, Math.max(2, (h / REPLAY_HOURS) * trackW))} y="12"
                  fontSize="8.5" fill="var(--ink-3)" fontFamily="var(--font-data)">
              {h === 48 ? "ahora" : `-${REPLAY_HOURS - h}h`}
            </text>
          ))}
        </svg>
        <div className="tl-cursor" style={{ left: tToX(cursorT) - 1 }}></div>
      </div>

      <div className="tl-times">
        <span className="t-cur">{cursorLabel}</span>
        <span className="t-lbl">{isLive ? "tiempo real" : "replay"}</span>
      </div>

      <button
        className={"tl-live-btn" + (isLive ? " live" : "")}
        onClick={() => { setPlaying(false); setReplayTime(null); }}
        title="Volver al presente"
      >
        ● EN VIVO
      </button>
    </div>
  );
}

window.Timeline = Timeline;
window.REPLAY_HOURS = REPLAY_HOURS;
