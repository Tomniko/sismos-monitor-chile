import express from "express";
import * as cheerio from "cheerio";
import { startLiveSeismicPolling, getLiveSnapshot, DATA_DELAY_MINUTES } from "./liveSeismic.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

function yyyyMmDd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");

  return { y, m, d, yyyymmdd: `${y}${m}${d}` };
}

function catalogUrl(date) {
  const { y, m, yyyymmdd } = yyyyMmDd(date);
  return `https://www.sismologia.cl/sismicidad/catalogo/${y}/${m}/${yyyymmdd}.html`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 sismos-monitor-chile/1.0",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al descargar ${url}`);
  }

  return await res.text();
}

function parseMagnitude(raw) {
  if (!raw) return null;
  const match = raw.replace(",", ".").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function parseDepth(raw) {
  if (!raw) return null;
  const match = raw.replace(",", ".").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function parseCatalogHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const events = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .map((_, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();

    /*
      En las páginas del CSN suele aparecer algo equivalente a:
      Fecha local / lugar | Fecha UTC | Latitud / Longitud | Profundidad | Magnitud

      El HTML puede cambiar, por eso hacemos una validación flexible.
    */
    if (cells.length < 5) return;

    const localAndPlace = cells[0];
    const utc = cells[1];
    const latLon = cells[2];
    const depth = cells[3];
    const mag = cells[4];

    const dateMatch = localAndPlace.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);
    const localTime = dateMatch ? dateMatch[0] : null;

    const place = localTime
      ? localAndPlace.replace(localTime, "").trim()
      : localAndPlace.trim();

    const nums = latLon.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 2) return;

    const latitude = Number(nums[0]);
    const longitude = Number(nums[1]);
    const magnitude = parseMagnitude(mag);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || magnitude == null) {
      return;
    }

    events.push({
      localTime,
      utcTime: utc,
      place,
      latitude,
      longitude,
      depthKm: parseDepth(depth),
      magnitude,
      magnitudeText: mag,
      sourceUrl
    });
  });

  return events;
}

async function getRecentEvents(daysBack = 2) {
  const all = [];
  const today = new Date();

  for (let i = 0; i < daysBack; i++) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - i);

    const url = catalogUrl(date);

    try {
      const html = await fetchText(url);
      const events = parseCatalogHtml(html, url);
      all.push(...events);
    } catch (err) {
      console.warn(err.message);
    }
  }

  return all
    .sort((a, b) => {
      const ta = Date.parse(a.utcTime || a.localTime || 0);
      const tb = Date.parse(b.utcTime || b.localTime || 0);
      return tb - ta;
    })
    .slice(0, 80);
}

app.get("/api/events", async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days || 2), 7);
    const events = await getRecentEvents(days);

    res.json({
      updatedAt: new Date().toISOString(),
      source: "Centro Sismológico Nacional, Universidad de Chile",
      count: events.length,
      events
    });
  } catch (err) {
    res.status(500).json({
      error: "No se pudieron obtener los sismos",
      detail: err.message
    });
  }
});

app.get("/api/live", (req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    source: "Red Sismológica Nacional (CSN, red C1) vía EarthScope/IRIS FDSN dataselect — prototipo, cobertura de Arica a Magallanes",
    windowSeconds: 2,
    delayMinutes: DATA_DELAY_MINUTES,
    stations: getLiveSnapshot()
  });
});

startLiveSeismicPolling();

app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});