# Monitor de Sismos Chile

Aplicación web (Express + Leaflet) que muestra sismicidad reciente en Chile y un
prototipo de "monitor en vivo" inspirado en los mapas de sacudidas en tiempo
real de Japón (como [eqdata.sakura.ne.jp](https://eqdata.sakura.ne.jp/kyoshin/org/2sec_multi.html)).

## Funcionalidades

- **Catálogo de eventos recientes**: scrapea el catálogo público del Centro
  Sismológico Nacional (CSN, Universidad de Chile) y los muestra en un mapa
  interactivo con popups, tarjetas y animación de ondas al detectar un evento
  nuevo.
- **Monitor en vivo (prototipo)**: calcula cada 2 segundos la amplitud (RMS)
  del movimiento del suelo en 28 estaciones de la Red Sismológica Nacional
  (red `C1`, datos abiertos vía [EarthScope](https://www.earthscope.org/)/IRIS),
  desde Arica hasta la Antártica. Clasifica un nivel relativo de "sacudida"
  (0-4) comparado con el ruido habitual de cada estación, y reproduce el
  historial con una animación continua de ~2 segundos por cuadro, similar a
  la página japonesa de referencia.

> **Nota:** los datos del monitor en vivo llegan con un retraso de archivo de
> ~4 minutos (no es una alerta sismológica), y los niveles son relativos al
> ruido propio de cada estación, no una escala de intensidad calibrada. Es un
> prototipo para evaluar la idea, no una herramienta oficial.

## Cómo correrlo localmente

Requiere [Node.js](https://nodejs.org/) (LTS).

```bash
npm install
npm start
```

Luego abre [http://localhost:3000](http://localhost:3000).

## Verlo de forma Online

Actualmente, la página se encuentra activa y alojada en la siguiente dirección de Render:
[https://sismos-monitor-chile.onrender.com/](https://sismos-monitor-chile.onrender.com/)


## Estructura

- `server.js` — servidor Express: scraping del catálogo CSN (`/api/events`) y
  endpoint del monitor en vivo (`/api/live`).
- `liveSeismic.js` — obtiene datos de forma de onda (miniSEED) vía FDSN
  dataselect de EarthScope, calcula la amplitud RMS por ventanas de 2 segundos
  y mantiene un buffer reciente por estación.
- `public/` — frontend estático: mapa Leaflet, tarjetas de eventos/estaciones
  y la animación de reproducción en vivo (`app.js`).

## Fuentes de datos

- Catálogo de sismos: [Centro Sismológico Nacional (CSN)](https://www.sismologia.cl/)
- Formas de onda en tiempo casi real: red `C1` (Red Sismológica Nacional) vía
  [EarthScope FDSN web services](https://service.earthscope.org/)

## Despliegue

Esta app necesita un servidor Node/Express corriendo (hace scraping y polling
en segundo plano).