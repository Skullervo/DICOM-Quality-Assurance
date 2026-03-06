# UI-parannukset: Ultraääni-laitenäkymä (v6)
# Referenssitiedosto: `autoqad_us_v6.html` — lue se ensin kokonaan ennen toteutusta

---

## TÄRKEÄÄ ENNEN ALOITUSTA

Lue `autoqad_us_v6.html` kokonaan ennen kuin kirjoitat riviäkään koodia.
Tavoitteena on identtinen visuaalinen lopputulos Django-templatessa.
Toteuta osio kerrallaan, odota hyväksyntä.

---

## CSS-MUUTTUJAT — käytä näitä tarkalleen

```css
:root {
  --bg:      #080c10;
  --surface: #0f1520;
  --surface2:#162030;
  --border:  #1e3048;
  --accent:  #00b4d8;
  --accent2: #0077b6;
  --ok:      #52e3a0;
  --warn:    #fbbf24;
  --bad:     #fb7185;
  --neutral: #e2e8f0;
  --muted:   #64748b;
}
```

## FONTIT

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
```

- Kaikki UI-teksti: `font-family: 'DM Sans', sans-serif`
- Kaikki numeeriset arvot, koodit, badget, y/x-akselitickejä: `font-family: 'JetBrains Mono', monospace`

---

## OSIO 1 — Sivun layout: ei ulkoista scrollausta

```css
body {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.main {
  display: grid;
  grid-template-columns: 270px 1fr 300px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

Kaikki kolme saraketta: `overflow: hidden`, `min-height: 0`, `display: flex`, `flex-direction: column`.

---

## OSIO 2 — Vasen sarake

### Rakenne ylhäältä alas:
```
.left
  .panel-label          "LAITE" + modality badge
  .us-image-wrap
    .us-image-row        ← flex-rivi
      .us-main           ← aspect-ratio 4/3, flex:1
        .us-scan         ← simuloitu US-kuva
        .us-depth-bar    ← width: 30px, syvyysasteikko
      .us-profile        ← width: 42px, vertikaalinen profiilikäyrä
    .us-waveform         ← height: 46px, M-mode aaltomuoto
  .left-scroll           ← flex:1, overflow-y:auto, min-height:0
    .meta-section-title
    .meta-row × N        ← laitetiedot (EI herkkyys/tasaisuus/epäsymmetria)
    .report-section      ← raportoi ongelmasta TÄSSÄ
```

### Profiilikäyrä (`.us-profile`):
```css
.us-profile {
  width: 42px;
  background: #020608;
  border-left: 1px solid #111;
  flex-shrink: 0;
}
```

SVG viewBox `"0 0 42 120"`, `preserveAspectRatio="none"`:
- Keskiviiva x=21
- Vaakaviivat y=30,60,90 katkoviivalla
- Profiilikäyrä `stroke="#00b4d8"` — amplitudi vaihtelee syvyyden mukaan
- Anomalia-pisteet `stroke="#fb7185"` ympyröinä (fill:none)

### Metataulukosta poistetaan:
- Herkkyys, Tasaisuus, Epäsymmetria (nämä näkyvät chippeissä)

### Meta-rivin tyyli:
```css
.meta-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 14px;
  border-bottom: 1px solid rgba(30,48,72,.5);
  transition: background .1s;
}
.meta-row:hover { background: var(--surface2); }
.meta-key { color: var(--muted); font-size: 11px; }
.meta-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; }
.meta-val.tag { background: rgba(0,180,216,.12); color: var(--accent); padding: 1px 7px; border-radius: 4px; }
.meta-val.na  { color: var(--border); }
.meta-val.warn{ color: var(--warn); }
```

---

## OSIO 3 — Keskisarake

### Rakenne:
```
.center  (flex column, padding:12px, gap:10px, overflow:hidden, min-height:0)
  .chips           ← grid 3 saraketta, flex-shrink:0
  .chart-panel     ← flex:1, min-height:0
```

### Chip-tyyli:
```css
.chip { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.chip-val { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 600; }
.chip-bar { height: 3px; background: var(--border); border-radius: 2px; margin-top: 4px; overflow: hidden; }
```

### Kaaviopaneeli:
```css
.chart-panel {
  flex: 1; min-height: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden;
}
.charts-stack {
  flex: 1; min-height: 0;
  overflow-y: auto;
  display: flex; flex-direction: column;
}
```

---

## OSIO 4 — Kaavioiden rakenne (KRIITTINEN)

### Per kaavio HTML-rakenne:
```html
<div class="chart-block">
  <div class="chart-block-head"> otsikko | arvo | badge </div>
  <div class="chart-wrap">                    ← height: 100px, display:flex, overflow:hidden
    <div class="chart-yaxis">                 ← width:38px, EI scrollaa
      <span class="yax">5.0</span>
      ...
    </div>
    <div class="chart-scroll">               ← flex:1, overflow-x:auto, overflow-y:hidden
      <!-- SVG lisätään JavaScriptillä -->
    </div>
  </div>
</div>
```

```css
.chart-wrap {
  display: flex;
  height: 100px;
  overflow: hidden;
  position: relative;
}
.chart-yaxis {
  width: 38px; flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  justify-content: space-between;
  padding: 6px 5px 4px;
  z-index: 3;
}
.yax { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: var(--muted); text-align: right; }
.chart-scroll {
  flex: 1; overflow-x: auto; overflow-y: hidden; min-width: 0;
}
.chart-scroll svg { display: block; height: 100%; }
```

### JavaScript SVG-renderöinti:

Anna jokaiselle chart-scroll-diville `id` (esim. `scroll-herkkyys`, `scroll-tasaisuus`, `scroll-epa`).

```javascript
const VISIBLE_STUDIES = 5;   // näytetään 5 tutkimusta kerralla
const H = 90;                // SVG-korkeus px
const PAD_TOP = 10;          // marginaali ylhäällä
const PAD_BOT = 16;          // tila päivämäärälabeleille
const CHART_H = H - PAD_TOP - PAD_BOT;

function norm2y(n) {
  // n: 0.0 (alin arvo) → 1.0 (ylin arvo)
  // palauttaa SVG y-koordinaatin
  return PAD_TOP + (1 - n) * CHART_H;
}

function buildChart(cfg) {
  const container = document.getElementById(cfg.scrollId);
  const visibleW = container.clientWidth || VISIBLE_STUDIES * 90;
  const colW = visibleW / VISIBLE_STUDIES;  // ← tämä skaalaa automaattisesti
  const n = cfg.data.length;
  const svgW = Math.max(n * colW, visibleW);

  // Luo SVG, aseta width=svgW height=H viewBox="0 0 svgW H"
  // svg.style.minWidth = svgW + 'px'

  // x-koordinaatti pisteelle i:
  // x(i) = colW * i + colW / 2

  // Elementit järjestyksessä:
  // 1. defs > linearGradient (id uniikki per kaavio)
  // 2. Vaakaviivat y=norm2y(0.25), norm2y(0.5), norm2y(0.75)  stroke="#1e3048"
  // 3. Pystyviivat per tutkimus  stroke="#1e3048"
  // 4. Zero-viiva jos cfg.zeroLine  stroke="#2a3a50" stroke-width=1.5
  // 5. Rajaviivat cfg.limits[]  stroke=lim.color, stroke-dasharray="6,4"
  // 6. Area fill polygon  fill="url(#gradId)"
  // 7. Polyline datapisteiden välillä
  // 8. Circles per datapiste
  //    - r=3.5 normaalisti, r=5 viimeiselle
  //    - fill=cfg.lineColor, tai "#fb7185" jos arvo rajan ulkopuolella
  //    - viimeinen: stroke="#080c10" stroke-width=2
  // 9. Text-elementit päivämäärille  y=H-2, font-size=7, fill="#64748b"
}
```

### Kaavioiden data-rakenne:

```javascript
{
  scrollId: 'scroll-herkkyys',
  data: [0.34, 0.27, 0.42, 0.58, 0.52, 0.40, 0.46, 0.54, 0.48, 0.40],
  // data-arvot normalisoituna 0..1 suhteessa y-akseliin
  // 0 = alin y-akselin arvo, 1 = ylin
  dates: ['11.02','18.02','25.02','04.03','11.03','18.03','25.03','01.04','08.04','15.04'],
  lineColor: '#52e3a0',
  gradColor: '#52e3a0',
  limits: [{ y: 1.0, color: '#fbbf24' }],   // keltainen = hyväksyntäraja
  badThreshold: null,   // null = ei punaisia pisteitä
  zeroLine: false,
}
// Epäsymmetria:
{
  scrollId: 'scroll-epa',
  data: [0.68, 0.35, 0.45, 0.47, 0.35, 0.20, 0.28, 0.20, 0.16, 0.12],
  lineColor: '#00b4d8',
  gradColor: '#fb7185',
  limits: [
    { y: 0.75, color: '#fb7185' },  // +1.0 raja — punainen
    { y: 0.25, color: '#fb7185' },  // −1.0 raja — punainen
  ],
  badThreshold: 0.25,   // pisteet joiden arvo <= 0.25 värjätään punaisiksi
  zeroLine: true,       // nolla-akseli y=0.5
}
```

### Resize-käsittelijä:
```javascript
window.addEventListener('resize', () => {
  CHARTS.forEach(cfg => {
    const c = document.getElementById(cfg.scrollId);
    if (c) c.innerHTML = '';
  });
  initCharts();
});
```

Rakenna kaaviot `DOMContentLoaded`-tapahtumassa tai `requestAnimationFrame`-callbackissä.

**Django-huomio:** Jos data tulee backendistä, renderöi se `{{ chart_data|safe }}` -muodossa JSON-objektina ja lue JavaScriptissä.

---

## OSIO 5 — Badge-tyylit

```css
.badge { font-size: 9px; font-family: 'JetBrains Mono', monospace; padding: 2px 7px; border-radius: 4px; font-weight: 600; }
.badge.ok   { background: rgba(82,227,160,.1);  color: #52e3a0; }
.badge.warn { background: rgba(251,191,36,.1);  color: #fbbf24; }
.badge.bad  { background: rgba(251,113,133,.1); color: #fb7185; }
```

---

## OSIO 6 — Kaaviopaneelin legenda

```html
<div class="chart-panel-legend">
  <div class="legend-item">
    <div style="width:18px; height:0; border-top: 2px dashed #fbbf24;"></div>
    <span>Hyväksyntäraja (keltainen)</span>
  </div>
  <div class="legend-item">
    <div style="width:18px; height:0; border-top: 2px dashed #fb7185;"></div>
    <span>Yläraja (punainen)</span>
  </div>
</div>
```

```css
.chart-panel-legend { display:flex; gap:16px; padding:7px 14px; border-top:1px solid var(--border); flex-shrink:0; }
.legend-item { display:flex; align-items:center; gap:6px; font-size:9px; color:var(--muted); }
```

---

## OSIO 7 — Oikea sarake: tekoäly

```
.right
  .panel-label          "KYSY TEKOÄLYLTÄ", flex-shrink:0
  .ai-messages          flex:1, overflow-y:auto, min-height:0
  .ai-footer            flex-shrink:0
    .ai-input-row       textarea + lähetä-nappi
```

Viestibubblet:
```css
.ai-msg.alert     { border-left: 2px solid var(--bad);    color: var(--bad);    background: rgba(251,113,133,.06); }
.ai-msg.assistant { border-left: 2px solid var(--accent); background: var(--surface2); align-self: flex-start; }
.ai-msg.user      { background: rgba(0,180,216,.08); border: 1px solid rgba(0,180,216,.2); align-self: flex-end; }
```

Kaikki: `padding: 9px 12px`, `border-radius: 8px`, `font-size: 12px`, `line-height: 1.6`, `max-width: 96%`.

---

## SCROLLBAR

```css
::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
```

---

## REFERENSSITIEDOSTO

`autoqad_us_v6.html` — lue tämä kokonaan ensin.
Sovella projektin Django-template-rakenteeseen.
ÄLÄ kopioi suoraan — mukauta template-syntaksiin ja Djangon data-rakenteeseen.
