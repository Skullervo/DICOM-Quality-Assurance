// ─────────────────────────────────────────────
// DeviceDetails v6 — SVG trend charts + profiles
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

  const stationname = document.getElementById('device-name').innerText;

  // ── SVG Chart engine ──────────────────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VISIBLE_STUDIES = 5;
  const H = 150;
  const PAD_TOP = 12;
  const PAD_BOT = 18;
  const CHART_H = H - PAD_TOP - PAD_BOT;

  function norm2y(n) {
    return PAD_TOP + (1 - n) * CHART_H;
  }

  function buildChart(cfg) {
    const container = document.getElementById(cfg.scrollId);
    if (!container) return;
    container.innerHTML = '';

    const n = cfg.data.length;
    if (n === 0) return;

    const PAD_X = 12;  // small padding at edges
    const visibleW = container.clientWidth || VISIBLE_STUDIES * 90;
    // When n <= VISIBLE_STUDIES: fit all points in container (no scroll)
    // When n > VISIBLE_STUDIES: SVG wider than container (scroll to see more)
    const colW = visibleW / Math.min(n, VISIBLE_STUDIES);
    const svgW = n > VISIBLE_STUDIES
      ? PAD_X * 2 + (n - 1) * colW
      : visibleW;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', svgW);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + H);
    svg.style.minWidth = svgW + 'px';

    function x(i) {
      if (n === 1) return svgW / 2;
      return PAD_X + (i / (n - 1)) * (svgW - PAD_X * 2);
    }

    // Defs (gradient)
    const defs = document.createElementNS(SVG_NS, 'defs');
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    const gid = 'grad_' + cfg.scrollId;
    grad.setAttribute('id', gid);
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    const s1 = document.createElementNS(SVG_NS, 'stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', cfg.gradColor);
    s1.setAttribute('stop-opacity', '0.18');
    const s2 = document.createElementNS(SVG_NS, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', cfg.gradColor);
    s2.setAttribute('stop-opacity', '0');
    grad.appendChild(s1); grad.appendChild(s2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Horizontal grid lines
    [0.25, 0.5, 0.75].forEach(function (f) {
      const line = document.createElementNS(SVG_NS, 'line');
      const yy = norm2y(f);
      line.setAttribute('x1', 0); line.setAttribute('x2', svgW);
      line.setAttribute('y1', yy); line.setAttribute('y2', yy);
      line.setAttribute('stroke', '#1e3048'); line.setAttribute('stroke-width', '0.5');
      svg.appendChild(line);
    });

    // Vertical separators (midpoints between data points)
    for (var i = 1; i < n; i++) {
      const vl = document.createElementNS(SVG_NS, 'line');
      const xx = (x(i - 1) + x(i)) / 2;
      vl.setAttribute('x1', xx); vl.setAttribute('x2', xx);
      vl.setAttribute('y1', PAD_TOP); vl.setAttribute('y2', H - PAD_BOT);
      vl.setAttribute('stroke', '#1e3048'); vl.setAttribute('stroke-width', '0.5');
      svg.appendChild(vl);
    }

    // Zero line
    if (cfg.zeroLine) {
      const zl = document.createElementNS(SVG_NS, 'line');
      const yy = norm2y(0.5);
      zl.setAttribute('x1', 0); zl.setAttribute('x2', svgW);
      zl.setAttribute('y1', yy); zl.setAttribute('y2', yy);
      zl.setAttribute('stroke', '#2a3a50'); zl.setAttribute('stroke-width', '1.5');
      svg.appendChild(zl);
    }

    // Limit lines
    cfg.limits.forEach(function (lim) {
      const ll = document.createElementNS(SVG_NS, 'line');
      const yy = norm2y(lim.y);
      ll.setAttribute('x1', 0); ll.setAttribute('x2', svgW);
      ll.setAttribute('y1', yy); ll.setAttribute('y2', yy);
      ll.setAttribute('stroke', lim.color);
      ll.setAttribute('stroke-width', '1.2');
      ll.setAttribute('stroke-dasharray', '6,4');
      svg.appendChild(ll);
    });

    // Area fill
    const pts = cfg.data.map(function (v, i) { return x(i) + ',' + norm2y(v); }).join(' ');
    const firstX = x(0), lastX = x(n - 1);
    const botY = H - PAD_BOT;
    const area = document.createElementNS(SVG_NS, 'polygon');
    area.setAttribute('points',
      pts + ' ' + lastX + ',' + botY + ' ' + firstX + ',' + botY
    );
    area.setAttribute('fill', 'url(#' + gid + ')');
    svg.appendChild(area);

    // Line
    const polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', pts);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', cfg.lineColor);
    polyline.setAttribute('stroke-width', '2.5');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('stroke-linecap', 'round');
    svg.appendChild(polyline);

    // Points
    cfg.data.forEach(function (v, i) {
      const isBad = cfg.badThreshold !== null && v <= cfg.badThreshold;
      const isLast = i === n - 1;
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', x(i));
      c.setAttribute('cy', norm2y(v));
      c.setAttribute('r', isLast ? '5' : '3.5');
      c.setAttribute('fill', isBad ? '#fb7185' : cfg.lineColor);
      if (isLast) {
        c.setAttribute('stroke', '#080c10');
        c.setAttribute('stroke-width', '2');
      }
      // Click handler for point selection
      if (cfg.instances && cfg.instances[i]) {
        c.style.cursor = 'pointer';
        c.addEventListener('click', function () {
          updateTableByInstance(cfg.instances[i]);
        });
      }
      svg.appendChild(c);
    });

    // Date labels
    cfg.dates.forEach(function (d, i) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', x(i));
      t.setAttribute('y', H - 2);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#64748b');
      t.setAttribute('font-size', '7');
      t.setAttribute('font-family', 'monospace');
      t.textContent = d;
      svg.appendChild(t);
    });

    container.appendChild(svg);

    // Scroll to end (latest data)
    container.scrollLeft = container.scrollWidth;
  }


  // ── Chart configurations (populated from API) ──
  var CHARTS = [];

  function initCharts() {
    CHARTS.forEach(buildChart);
  }

  window.addEventListener('resize', function () {
    CHARTS.forEach(function (cfg) {
      var c = document.getElementById(cfg.scrollId);
      if (c) c.innerHTML = '';
    });
    initCharts();
  });


  // ── Normalise raw values to 0..1 range ──
  function normalise(val, min, max) {
    return (val - min) / (max - min);
  }

  function formatDate(raw) {
    // raw = '20210211' → '11.02'
    if (!raw || raw.length < 8) return raw || '';
    return raw.slice(6, 8) + '.' + raw.slice(4, 6);
  }


  // ── Badge helpers ──
  function setBadge(el, cls, text) {
    if (!el) return;
    el.className = 'badge ' + cls;
    el.textContent = text;
  }

  function classifySDeph(v) {
    if (v === null || v === undefined) return { cls: '', text: '' };
    if (v < 4.0) return { cls: 'ok', text: 'OK' };
    if (v < 5.0) return { cls: 'warn', text: (window.T&&window.T.check||'Tarkista') };
    return { cls: 'bad', text: (window.T&&window.T.limitExceeded||'Raja ylitetty') };
  }

  function classifyUCov(v) {
    if (v === null || v === undefined) return { cls: '', text: '' };
    if (v < 4.0) return { cls: 'ok', text: 'OK' };
    if (v < 5.0) return { cls: 'warn', text: (window.T&&window.T.check||'Tarkista') };
    return { cls: 'bad', text: (window.T&&window.T.limitExceeded||'Raja ylitetty') };
  }

  function classifyUSkew(v) {
    if (v === null || v === undefined) return { cls: '', text: '' };
    if (Math.abs(v) < 1.0) return { cls: 'ok', text: 'OK' };
    return { cls: 'bad', text: (window.T&&window.T.limitExceeded||'Raja ylitetty') };
  }


  // ── Update chips ──
  function updateChips(sDepth, uCov, uSkew) {
    // Also report to AI chat panel
    reportMetricsToChat(sDepth, uCov, uSkew);

    var el;
    // s_depth
    var sClass = classifySDeph(sDepth);
    el = document.getElementById('chip-s-depth');
    if (el && sDepth != null) {
      el.className = 'chip-val ' + sClass.cls;
      el.innerHTML = Number(sDepth).toFixed(2) + ' <span style="font-size:11px;font-weight:400">mm</span>';
    }
    var sRatio = sDepth != null ? Math.min(sDepth / 4.0, 1) : 0;
    var sFill = document.getElementById('chip-s-depth-fill');
    if (sFill) { sFill.style.width = (sRatio * 100) + '%'; sFill.style.background = 'var(--' + (sClass.cls || 'ok') + ')'; }
    var sSub = document.getElementById('chip-s-depth-sub');
    if (sSub && sDepth != null) sSub.textContent = sClass.cls === 'ok' ? (window.T&&window.T.stable||'→ Vakaa · raja') + ' 4.0 mm' : (window.T&&window.T.limitOf||'↑ Raja') + ' ' + Number(sDepth).toFixed(2) + ' / 4.0 mm';

    // u_cov
    var cClass = classifyUCov(uCov);
    el = document.getElementById('chip-u-cov');
    if (el && uCov != null) {
      el.className = 'chip-val ' + cClass.cls;
      el.innerHTML = Number(uCov).toFixed(2) + ' <span style="font-size:11px;font-weight:400">%</span>';
    }
    var cRatio = uCov != null ? Math.min(uCov / 5.0, 1) : 0;
    var cFill = document.getElementById('chip-u-cov-fill');
    if (cFill) { cFill.style.width = (cRatio * 100) + '%'; cFill.style.background = 'var(--' + (cClass.cls || 'ok') + ')'; }
    var cSub = document.getElementById('chip-u-cov-sub');
    if (cSub && uCov != null) cSub.textContent = cClass.cls === 'ok' ? (window.T&&window.T.stable||'→ Vakaa · raja') + ' 5.0 %' : (window.T&&window.T.limitOf||'↑ Raja') + ' ' + Number(uCov).toFixed(2) + ' / 5.0 %';

    // u_skew
    var kClass = classifyUSkew(uSkew);
    el = document.getElementById('chip-u-skew');
    if (el && uSkew != null) {
      el.className = 'chip-val ' + kClass.cls;
      el.textContent = Number(uSkew).toFixed(2);
    }
    var kRatio = uSkew != null ? Math.min(Math.abs(uSkew) / 2.0, 1) : 0;
    var kFill = document.getElementById('chip-u-skew-fill');
    if (kFill) { kFill.style.width = (kRatio * 100) + '%'; kFill.style.background = 'var(--' + (kClass.cls || 'ok') + ')'; }
    var kSub = document.getElementById('chip-u-skew-sub');
    if (kSub && uSkew != null) kSub.textContent = kClass.cls === 'ok' ? (window.T&&window.T.stable||'→ Vakaa · raja') + ' ±1.0' : (window.T&&window.T.limitExceededFull||'↓ Raja ylitetty · raja') + ' ±1.0';
  }


  // ── Update header badges ──
  function updateHeaderBadges(sDepth, uCov, uSkew) {
    var s = classifySDeph(sDepth);
    var c = classifyUCov(uCov);
    var k = classifyUSkew(uSkew);

    setBadge(document.getElementById('badge-s-depth'), s.cls, (window.T&&window.T.sdepth||'Herkkyys (s_depth)') + ' ' + (s.text || ''));
    setBadge(document.getElementById('badge-u-cov'), c.cls, (window.T&&window.T.ucov||'Tasaisuus (U_cov)') + ' ' + (c.text || ''));
    setBadge(document.getElementById('badge-u-skew'), k.cls, (window.T&&window.T.uskew||'Epäsymmetria (U_skew)') + ' ' + (k.text || ''));

    // Per-chart badges
    if (sDepth != null) {
      setBadge(document.getElementById('badge-chart-s-depth'), s.cls, s.text);
      var v1 = document.getElementById('val-s-depth');
      if (v1) v1.textContent = (window.T&&window.T.latest||'viim.') + ' ' + Number(sDepth).toFixed(2) + ' mm';
    }
    if (uCov != null) {
      setBadge(document.getElementById('badge-chart-u-cov'), c.cls, c.text);
      var v2 = document.getElementById('val-u-cov');
      if (v2) v2.textContent = (window.T&&window.T.latest||'viim.') + ' ' + Number(uCov).toFixed(2) + ' %';
    }
    if (uSkew != null) {
      setBadge(document.getElementById('badge-chart-u-skew'), k.cls, k.text);
      var v3 = document.getElementById('val-u-skew');
      if (v3) v3.textContent = (window.T&&window.T.latest||'viim.') + ' ' + Number(uSkew).toFixed(2);
    }
  }


  // ── Update profiles (SVG-based) ──
  // viewBox matches actual px size → no distortion on text/circles
  function updateProfileSVG(vertProfile, sDepthPx) {
    var container = document.getElementById('profile-svg-container');
    if (!container || !vertProfile || vertProfile.length === 0) return;

    var maxVal = Math.max.apply(null, vertProfile);
    if (maxVal === 0) return;

    // Match actual rendered size of container
    var W = container.clientWidth || 56;
    var H = container.clientHeight || 350;
    var PAD = 4;
    var CX = W / 2;
    var AMP = (W / 2) - PAD - 2;

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    // No preserveAspectRatio="none" needed — viewBox matches container

    // Center line
    var cl = document.createElementNS(SVG_NS, 'line');
    cl.setAttribute('x1', CX); cl.setAttribute('y1', 0);
    cl.setAttribute('x2', CX); cl.setAttribute('y2', H);
    cl.setAttribute('stroke', '#1e3048'); cl.setAttribute('stroke-width', '1');
    svg.appendChild(cl);

    // Profile polyline
    var points = vertProfile.map(function (val, i) {
      var yPos = (i / (vertProfile.length - 1)) * (H - 2 * PAD) + PAD;
      var amplitude = (val / maxVal) * AMP;
      var xPos = CX + amplitude;
      return xPos.toFixed(1) + ',' + yPos.toFixed(1);
    }).join(' ');

    var polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#00b4d8');
    polyline.setAttribute('stroke-width', '1.5');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('stroke-linecap', 'round');
    svg.appendChild(polyline);


    container.innerHTML = '';
    container.appendChild(svg);
  }

  // Horizontal waveform — viewBox matches rendered px
  function updateWaveformSVG(horizProfile) {
    var container = document.getElementById('waveform-container');
    if (!container || !horizProfile || horizProfile.length === 0) return;

    var maxVal = Math.max.apply(null, horizProfile);
    if (maxVal === 0) return;

    // Measure actual container width; fallback 180
    var W = container.clientWidth || 180;
    var H = 48;            // extra height for percentage labels
    var CY = 26;           // center of waveform area
    var AMP = CY - 4;     // max amplitude = 22

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    // Profile polyline
    var N = horizProfile.length;
    var PAD_H = 6;  // horizontal padding so edge circles aren't clipped
    var dataW = W - PAD_H * 2;
    var points = horizProfile.map(function (val, i) {
      var xPos = PAD_H + (i / (N - 1)) * dataW;
      var amplitude = (val / maxVal) * AMP;
      var yPos = CY - amplitude;
      return xPos.toFixed(1) + ',' + yPos.toFixed(1);
    }).join(' ');

    var polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', points);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#00b4d8');
    polyline.setAttribute('stroke-width', '1.5');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);

    // Segment borders (10% | 20% | 40% | 20% | 10%) and min points
    var seg1 = Math.round(N * 0.1);
    var seg2 = seg1 + Math.round(N * 0.2);
    var seg3 = seg2 + Math.round(N * 0.4);
    var seg4 = seg3 + Math.round(N * 0.2);
    var segBorders = [0, seg1, seg2, seg3, seg4, N];

    // Segment border lines
    for (var b = 1; b < segBorders.length - 1; b++) {
      var bx = PAD_H + (segBorders[b] / (N - 1)) * dataW;
      var bl = document.createElementNS(SVG_NS, 'line');
      bl.setAttribute('x1', bx.toFixed(1)); bl.setAttribute('x2', bx.toFixed(1));
      bl.setAttribute('y1', 4); bl.setAttribute('y2', CY + 6);
      bl.setAttribute('stroke', 'rgba(150,150,150,0.5)');
      bl.setAttribute('stroke-width', '1');
      bl.setAttribute('stroke-dasharray', '3,3');
      svg.appendChild(bl);
    }

    // Min points per segment (u_low markers) + update u_low chips
    var segMinValues = [];
    for (var s = 0; s < 5; s++) {
      var start = segBorders[s];
      var end = segBorders[s + 1];
      var minVal = Infinity, minIdx = -1;
      for (var j = start; j < end; j++) {
        if (horizProfile[j] < minVal) {
          minVal = horizProfile[j];
          minIdx = j;
        }
      }
      segMinValues.push(minVal === Infinity ? 0 : minVal);
      if (minIdx >= 0) {
        var cx = PAD_H + (minIdx / (N - 1)) * dataW;
        var cy = CY - (minVal / maxVal) * AMP;
        var circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', cx.toFixed(1));
        circle.setAttribute('cy', cy.toFixed(1));
        circle.setAttribute('r', '3');
        circle.setAttribute('fill', 'rgba(255,60,60,0.7)');
        circle.setAttribute('stroke', '#fb7185');
        circle.setAttribute('stroke-width', '1');
        svg.appendChild(circle);
      }
    }

    // Update u_low chip values (normalized as % of max intensity)
    updateUlowChips(segMinValues, maxVal);

    // Percentage labels below waveform (10% | 20% | 40% | 20% | 10%)
    var segLabels = ['10%', '20%', '40%', '20%', '10%'];
    for (var p = 0; p < 5; p++) {
      var lx1 = PAD_H + (segBorders[p] / (N - 1)) * dataW;
      var lx2 = PAD_H + (segBorders[p + 1] / (N - 1)) * dataW;
      var midX = (lx1 + lx2) / 2;
      var txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', midX.toFixed(1));
      txt.setAttribute('y', (H - 4).toFixed(1));
      txt.setAttribute('fill', '#64748b');
      txt.setAttribute('font-size', '9');
      txt.setAttribute('font-family', "'JetBrains Mono', monospace");
      txt.setAttribute('text-anchor', 'middle');
      txt.textContent = segLabels[p];
      svg.appendChild(txt);
    }

    container.innerHTML = '';
    container.appendChild(svg);
  }


  // ── Update u_low chips (5 segments) ──
  function updateUlowChips(segMinValues, maxVal) {
    if (!segMinValues || segMinValues.length < 5 || maxVal === 0) return;

    for (var i = 0; i < 5; i++) {
      var el = document.getElementById('chip-ulow-val-' + i);
      if (!el) continue;

      var pct = (segMinValues[i] / maxVal) * 100;
      el.textContent = pct.toFixed(1) + ' %';

      // Classify: >60% ok, >40% warn, <=40% bad
      el.className = 'chip-ulow-val';
      if (pct > 60) {
        el.classList.add('ok');
      } else if (pct > 40) {
        el.classList.add('warn');
      } else {
        el.classList.add('bad');
      }
    }
  }


  // ── Data loading ──
  var data1, data2, data3;
  var loadedCount = 0;

  function tryBuildCharts() {
    loadedCount++;
    if (loadedCount < 3) return;

    // All data loaded — build SVG charts
    buildChartsFromData();
  }

  function buildChartsFromData() {
    CHARTS = [];

    // s_depth chart
    if (data1 && data1.length > 0) {
      var yMin1 = 0, yMax1 = 4;
      CHARTS.push({
        scrollId: 'scroll-herkkyys',
        data: data1.map(function (d) { return normalise(d.s_depth, yMin1, yMax1); }),
        dates: data1.map(function (d) { return formatDate(d.seriesdate); }),
        instances: data1.map(function (d) { return d.instance; }),
        lineColor: '#52e3a0',
        gradColor: '#52e3a0',
        limits: [{ y: 1.0, color: '#fbbf24' }],
        badThreshold: null,
        zeroLine: false,
      });
    }

    // u_cov chart
    if (data2 && data2.length > 0) {
      var yMin2 = 0, yMax2 = 5;
      CHARTS.push({
        scrollId: 'scroll-tasaisuus',
        data: data2.map(function (d) { return normalise(d.u_cov, yMin2, yMax2); }),
        dates: data2.map(function (d) { return formatDate(d.seriesdate); }),
        instances: data2.map(function (d) { return d.instance; }),
        lineColor: '#fbbf24',
        gradColor: '#fbbf24',
        limits: [{ y: 1.0, color: '#fbbf24' }],
        badThreshold: null,
        zeroLine: false,
      });
    }

    // u_skew chart
    if (data3 && data3.length > 0) {
      var yMin3 = -2, yMax3 = 2;
      CHARTS.push({
        scrollId: 'scroll-epa',
        data: data3.map(function (d) { return normalise(d.u_skew, yMin3, yMax3); }),
        dates: data3.map(function (d) { return formatDate(d.seriesdate); }),
        instances: data3.map(function (d) { return d.instance; }),
        lineColor: '#00b4d8',
        gradColor: '#fb7185',
        limits: [
          { y: 0.75, color: '#fb7185' },
          { y: 0.25, color: '#fb7185' },
        ],
        zeroLine: true,
        badThreshold: 0.25,
      });
    }

    initCharts();

    // Update UI with latest values
    if (data1 && data1.length > 0) {
      var latest = data1[0];
      var latestUCov = data2 && data2.length > 0 ? data2[0].u_cov : null;
      var latestUSkew = data3 && data3.length > 0 ? data3[0].u_skew : null;
      updateChips(latest.s_depth, latestUCov, latestUSkew);
      updateHeaderBadges(latest.s_depth, latestUCov, latestUSkew);
      updateTableByInstance(latest.instance);
    }
  }


  // ── API fetches ──
  fetch('/qa/api/s_depth/' + stationname + '/')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      data1 = data;
      tryBuildCharts();
    })
    .catch(function (e) { console.error('s_depth fetch error:', e); loadedCount++; });

  fetch('/qa/api/u_cov/' + stationname + '/')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      data2 = data;
      tryBuildCharts();
    })
    .catch(function (e) { console.error('u_cov fetch error:', e); loadedCount++; });

  fetch('/qa/api/u_skew/' + stationname + '/')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      data3 = data;
      tryBuildCharts();
    })
    .catch(function (e) { console.error('u_skew fetch error:', e); loadedCount++; });


  // ── Update metadata table by instance ──
  function updateTableByInstance(instanceValue) {
    fetch('/qa/api/ultrasound/' + instanceValue + '/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var el;
        el = document.getElementById('u-low-value');
        if (el) el.innerText = data.u_low != null ? Number(data.u_low).toFixed(2) : '-';
        el = document.getElementById('instance-value');
        if (el) el.innerText = data.instance || 'unknown';

        // Update chips with selected values
        updateChips(data.s_depth, data.u_cov, data.u_skew);

        loadOrthancImage(instanceValue);
      });
  }


  // ── Load image from Orthanc ──
  function loadOrthancImage(instanceValue) {
    fetch('/qa/get_orthanc_image/instance/' + instanceValue + '/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.image) {
          document.getElementById('orthanc-image').src = 'data:image/jpeg;base64,' + data.image;
          if (data.vert_prof) updateProfileSVG(data.vert_prof, data.s_depth);
          if (data.horiz_prof) updateWaveformSVG(data.horiz_prof);
        } else {
          console.error('Error loading image:', data.error);
        }
      })
      .catch(function (e) { console.error('Orthanc image fetch error:', e); });
  }


  // ── Metrics summary in AI chat ──
  function reportMetricsToChat(sDepth, uCov, uSkew) {
    var answerBox = document.getElementById('answer-box');
    if (!answerBox) return;

    // Remove any existing metrics message
    var existing = answerBox.querySelector('.ai-msg.metrics');
    if (existing) existing.remove();

    // Remove any existing alert message
    var existingAlert = answerBox.querySelector('.ai-msg.alert');
    if (existingAlert) existingAlert.remove();

    var sClass = classifySDeph(sDepth);
    var cClass = classifyUCov(uCov);
    var kClass = classifyUSkew(uSkew);

    // Build metrics card
    var msg = document.createElement('div');
    msg.className = 'ai-msg metrics';
    msg.innerHTML =
      '<div class="ai-msg-label">' + (window.T&&window.T.metrics||'Mittaustulokset') + '</div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.sdepth||'Herkkyys (s_depth)') + '</span><span class="metric-value ' + sClass.cls + '">' + (sDepth != null ? Number(sDepth).toFixed(2) + ' mm' : '–') + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.ucov||'Tasaisuus (U_cov)') + '</span><span class="metric-value ' + cClass.cls + '">' + (uCov != null ? Number(uCov).toFixed(2) + ' %' : '–') + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.uskew||'Epäsymmetria (U_skew)') + '</span><span class="metric-value ' + kClass.cls + '">' + (uSkew != null ? Number(uSkew).toFixed(2) : '–') + '</span></div>';

    // Insert at the beginning of the answer box
    answerBox.insertBefore(msg, answerBox.firstChild);

    // Add alert if any metric exceeds limits
    var exceedsW  = window.T&&window.T.exceeds          || 'ylittää';
    var checkLimW = window.T&&window.T.checkLimit       || 'tarkistusrajan';
    var accLimW   = window.T&&window.T.acceptanceLimit  || 'hyväksyntärajan';
    var actionW   = window.T&&window.T.actionRecommended|| 'Toimenpide suositellaan.';
    var alerts = [];
    if (sClass.cls === 'warn' || sClass.cls === 'bad') {
      alerts.push('⚠ ' + (window.T&&window.T.sdepth||'Herkkyys (s_depth)') + ' (= ' + Number(sDepth).toFixed(2) + ' mm) ' + exceedsW + ' ' + (sClass.cls === 'warn' ? checkLimW : accLimW) + ' 4.0 mm.');
    }
    if (cClass.cls === 'warn' || cClass.cls === 'bad') {
      alerts.push('⚠ ' + (window.T&&window.T.ucov||'Tasaisuus (U_cov)') + ' (= ' + Number(uCov).toFixed(2) + ' %) ' + exceedsW + ' ' + (cClass.cls === 'warn' ? checkLimW : accLimW) + ' 5.0 %.');
    }
    if (kClass.cls === 'bad') {
      alerts.push('⚠ ' + (window.T&&window.T.uskew||'Epäsymmetria (U_skew)') + ' (= ' + Number(uSkew).toFixed(2) + ') ' + exceedsW + ' ' + accLimW + ' ±1.0. ' + actionW);
    }

    if (alerts.length > 0) {
      var alertMsg = document.createElement('div');
      alertMsg.className = 'ai-msg alert';
      alertMsg.innerHTML = alerts.join('<br>');
      // Insert after metrics card
      msg.insertAdjacentElement('afterend', alertMsg);
    }
  }


  // ── AI chat ──
  var chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var question = document.getElementById('question').value.trim();
      var answerBox = document.getElementById('answer-box');

      if (!question) return;

      // Add user message
      var userMsg = document.createElement('div');
      userMsg.className = 'ai-msg user';
      userMsg.textContent = question;
      answerBox.appendChild(userMsg);
      document.getElementById('question').value = '';
      answerBox.scrollTop = answerBox.scrollHeight;

      // Loading indicator
      var loadingMsg = document.createElement('div');
      loadingMsg.className = 'ai-msg assistant';
      loadingMsg.innerHTML = '<div class="ai-msg-label">' + (window.T&&window.T.aiLabel||'Tekoäly') + '</div>' + (window.T&&window.T.fetching||'Haetaan vastausta...');
      answerBox.appendChild(loadingMsg);
      answerBox.scrollTop = answerBox.scrollHeight;

      try {
        var response = await fetch("/qa/ask-ai/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCSRFToken()
          },
          body: JSON.stringify({ question: question, lang: window.LANG || 'fi' })
        });

        var data = await response.json();
        loadingMsg.innerHTML = '<div class="ai-msg-label">' + (window.T&&window.T.aiLabel||'Tekoäly') + '</div>' + (data.answer || (window.T&&window.T.noAnswer||'Ei saatu vastausta.'));
        answerBox.scrollTop = answerBox.scrollHeight;
      } catch (err) {
        loadingMsg.innerHTML = '<div class="ai-msg-label">' + (window.T&&window.T.aiLabel||'Tekoäly') + '</div>' + (window.T&&window.T.imageError||'Virhe') + ': ' + err.message;
      }
    });
  }


  // ── CSRF token ──
  function getCSRFToken() {
    var name = 'csrftoken';
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith(name + '=')) {
        return decodeURIComponent(cookie.substring(name.length + 1));
      }
    }
    return '';
  }


  // ── Report form (Slack) ──
  var miniChatForm = document.getElementById('mini-chat-form');
  if (miniChatForm) {
    miniChatForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var message = document.getElementById('mini-chat-input').value.trim();
      if (!message) return;

      try {
        var res = await fetch("/qa/api/report-issue/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCSRFToken()
          },
          body: JSON.stringify({ text: message })
        });
        var data = await res.json();

        if (data.status === "ok") {
          alert(window.T&&window.T.messageSent||'Viesti lähetetty Slackiin!');
          document.getElementById('mini-chat-input').value = '';
        } else {
          throw new Error(data.detail || "Tuntematon virhe");
        }
      } catch (err) {
        console.error("Lähetysvirhe:", err);
        alert(window.T&&window.T.sendError||'Virhe lähetyksessä.');
      }
    });
  }


  // ── DICOM modal ──
  var isDicomOpen = false;

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.shiftKey && e.code === 'KeyI') {
      var t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;

      e.preventDefault();
      var inst = document.getElementById('instance-value');
      if (inst) {
        openDicomModal(inst.textContent.trim());
      }
    }
    if (e.key === 'Escape' && isDicomOpen) {
      e.preventDefault();
      closeDicomModal();
    }
  });

  window.openDicomModal = function (instanceId) {
    fetch('/qa/api/dicom_info/' + instanceId + '/')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.status === 'success') {
          var colLeft = document.getElementById('dicom-col-left');
          var colRight = document.getElementById('dicom-col-right');
          colLeft.innerHTML = '';
          colRight.innerHTML = '';
          var keys = Object.keys(data.data);
          var half = Math.ceil(keys.length / 2);
          keys.forEach(function (key, i) {
            var row = document.createElement('div');
            row.className = 'dicom-row';
            row.innerHTML = '<span class="dicom-key">' + key + '</span><span class="dicom-val">' + data.data[key] + '</span>';
            if (i < half) colLeft.appendChild(row);
            else colRight.appendChild(row);
          });
          document.getElementById('dicom-modal').style.display = 'block';
          isDicomOpen = true;
        } else {
          alert("Virhe DICOM-tietojen haussa: " + data.message);
        }
      })
      .catch(function (err) {
        alert("Verkkovirhe: " + err);
      });
  };

  window.closeDicomModal = function () {
    document.getElementById('dicom-modal').style.display = 'none';
    isDicomOpen = false;
  };

});
