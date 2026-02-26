// ─────────────────────────────────────────────
// CTDeviceDetails v6 — SVG trend charts
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

  // ── Get first device name from devicesData ──
  var firstDeviceName = null;
  if (window.devicesData) {
    var deviceNames = Object.keys(window.devicesData);
    if (deviceNames.length > 0) {
      firstDeviceName = deviceNames[0];
    }
  }

  if (!firstDeviceName) {
    console.error('Ei laitteen nimeä saatavilla kaavioiden lataamiseen');
    return;
  }

  // ── SVG Chart engine (same as XR v6) ──────────
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VISIBLE_STUDIES = 5;
  var H = 120;
  var PAD_TOP = 10;
  var PAD_BOT = 16;
  var CHART_H = H - PAD_TOP - PAD_BOT;

  function norm2y(n) {
    return PAD_TOP + (1 - n) * CHART_H;
  }

  function buildChart(cfg) {
    var container = document.getElementById(cfg.scrollId);
    if (!container) return;
    container.innerHTML = '';

    var n = cfg.data.length;
    if (n === 0) return;

    var PAD_X = 10;
    var visibleW = container.clientWidth || VISIBLE_STUDIES * 70;
    var colW = visibleW / Math.min(n, VISIBLE_STUDIES);
    var svgW = n > VISIBLE_STUDIES
      ? PAD_X * 2 + (n - 1) * colW
      : visibleW;

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', svgW);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + H);
    svg.style.minWidth = svgW + 'px';

    function x(i) {
      if (n === 1) return svgW / 2;
      return PAD_X + (i / (n - 1)) * (svgW - PAD_X * 2);
    }

    // Defs (gradient)
    var defs = document.createElementNS(SVG_NS, 'defs');
    var grad = document.createElementNS(SVG_NS, 'linearGradient');
    var gid = 'grad_' + cfg.scrollId;
    grad.setAttribute('id', gid);
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    var s1 = document.createElementNS(SVG_NS, 'stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', cfg.gradColor);
    s1.setAttribute('stop-opacity', '0.18');
    var s2 = document.createElementNS(SVG_NS, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', cfg.gradColor);
    s2.setAttribute('stop-opacity', '0');
    grad.appendChild(s1); grad.appendChild(s2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Horizontal grid lines
    [0.25, 0.5, 0.75].forEach(function (f) {
      var line = document.createElementNS(SVG_NS, 'line');
      var yy = norm2y(f);
      line.setAttribute('x1', 0); line.setAttribute('x2', svgW);
      line.setAttribute('y1', yy); line.setAttribute('y2', yy);
      line.setAttribute('stroke', '#1e3048'); line.setAttribute('stroke-width', '0.5');
      svg.appendChild(line);
    });

    // Vertical separators
    for (var i = 1; i < n; i++) {
      var vl = document.createElementNS(SVG_NS, 'line');
      var xx = (x(i - 1) + x(i)) / 2;
      vl.setAttribute('x1', xx); vl.setAttribute('x2', xx);
      vl.setAttribute('y1', PAD_TOP); vl.setAttribute('y2', H - PAD_BOT);
      vl.setAttribute('stroke', '#1e3048'); vl.setAttribute('stroke-width', '0.5');
      svg.appendChild(vl);
    }

    // Limit lines
    if (cfg.limits) {
      cfg.limits.forEach(function (lim) {
        var ll = document.createElementNS(SVG_NS, 'line');
        var yy = norm2y(lim.y);
        ll.setAttribute('x1', 0); ll.setAttribute('x2', svgW);
        ll.setAttribute('y1', yy); ll.setAttribute('y2', yy);
        ll.setAttribute('stroke', lim.color);
        ll.setAttribute('stroke-width', '1.2');
        ll.setAttribute('stroke-dasharray', '6,4');
        svg.appendChild(ll);
      });
    }

    // Area fill
    var pts = cfg.data.map(function (v, i) { return x(i) + ',' + norm2y(v); }).join(' ');
    var firstX = x(0), lastX = x(n - 1);
    var botY = H - PAD_BOT;
    var area = document.createElementNS(SVG_NS, 'polygon');
    area.setAttribute('points', pts + ' ' + lastX + ',' + botY + ' ' + firstX + ',' + botY);
    area.setAttribute('fill', 'url(#' + gid + ')');
    svg.appendChild(area);

    // Line
    var polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', pts);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', cfg.lineColor);
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('stroke-linecap', 'round');
    svg.appendChild(polyline);

    // Points
    cfg.data.forEach(function (v, i) {
      var isLast = i === n - 1;
      var c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', x(i));
      c.setAttribute('cy', norm2y(v));
      c.setAttribute('r', isLast ? '4.5' : '3');
      c.setAttribute('fill', cfg.lineColor);
      if (isLast) {
        c.setAttribute('stroke', '#080c10');
        c.setAttribute('stroke-width', '2');
      }
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
      var t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', x(i));
      t.setAttribute('y', H - 2);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#64748b');
      t.setAttribute('font-size', '6');
      t.setAttribute('font-family', 'monospace');
      t.textContent = d;
      svg.appendChild(t);
    });

    container.appendChild(svg);
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
    if (max === min) return 0.5;
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
  }

  function formatDate(raw) {
    if (!raw || raw.length < 8) return raw || '';
    return raw.slice(6, 8) + '.' + raw.slice(4, 6) + '.' + raw.slice(0, 4);
  }

  function getRange(dataArr, field) {
    var vals = dataArr.map(function (d) { return d[field]; }).filter(function (v) { return v != null && !isNaN(v); });
    if (vals.length === 0) return { min: 0, max: 1 };
    var mn = Math.min.apply(null, vals);
    var mx = Math.max.apply(null, vals);
    var pad = (mx - mn) * 0.15 || 1;
    return { min: mn - pad, max: mx + pad };
  }


  // ── Badge helpers ──
  function setBadge(el, cls, text) {
    if (!el) return;
    el.className = 'badge ' + cls;
    el.textContent = text;
  }

  // ── Y-axis labels ──
  function setYAxis(elId, min, max) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    var steps = 5;
    for (var i = 0; i < steps; i++) {
      var val = max - (i / (steps - 1)) * (max - min);
      var span = document.createElement('span');
      span.className = 'yax';
      span.textContent = val.toFixed(1);
      el.appendChild(span);
    }
  }

  function setTextContent(id, value) {
    var el = document.getElementById(id);
    if (el) el.innerText = value != null ? value : '-';
  }


  // ── Chip update ──
  function updateChips(metrics) {
    reportMetricsToChat(metrics);

    var el;
    // Row 1: Uniformity Index
    el = document.getElementById('chip-uniformity');
    if (el && metrics.uniformity != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.uniformity).toFixed(2);
    }

    // Row 1: MTF 50%
    el = document.getElementById('chip-mtf');
    if (el && metrics.mtf50 != null) {
      el.className = 'chip-val ok';
      el.innerHTML = Number(metrics.mtf50).toFixed(2) + ' <span style="font-size:11px;font-weight:400">lp/cm</span>';
    }

    // Row 1: Noise
    el = document.getElementById('chip-noise');
    if (el && metrics.noise != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.noise).toFixed(2);
    }

    // Row 2: HU Acrylic (representative HU linearity chip)
    el = document.getElementById('chip-hu-acrylic');
    if (el && metrics.huAcrylic != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.huAcrylic).toFixed(1);
    }

    // Row 2: Low Contrast
    el = document.getElementById('chip-low-contrast');
    if (el && metrics.lowContrast != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.lowContrast).toFixed(0);
    }

    // Row 2: Slice Thickness
    el = document.getElementById('chip-slice-thickness');
    if (el && metrics.sliceThickness != null) {
      el.className = 'chip-val ok';
      el.innerHTML = Number(metrics.sliceThickness).toFixed(2) + ' <span style="font-size:11px;font-weight:400">mm</span>';
    }
  }


  // ── Data loading ──
  var dataArrays = {};
  var loadedCount = 0;
  var selectedInstance = null;

  var CHART_CONFIGS = [
    { key: 'uniformity', url: '/qa/api/ct/hu_uniformity/', field: 'uniformity_index', scrollId: 'scroll-uniformity', yaxisId: 'yaxis-uniformity', valId: 'val-uniformity', badgeId: 'badge-uniformity', title: 'Uniformiteetti', color: '#00b4d8' },
    { key: 'hu_air', url: '/qa/api/ct/hu_linearity/', field: 'hu_air', scrollId: 'scroll-hu-air', yaxisId: 'yaxis-hu-air', valId: 'val-hu-air', badgeId: 'badge-hu-air', title: 'HU Ilma', color: '#94a3b8' },
    { key: 'hu_pmp', url: '/qa/api/ct/hu_linearity/', field: 'hu_pmp', scrollId: 'scroll-hu-pmp', yaxisId: 'yaxis-hu-pmp', valId: 'val-hu-pmp', badgeId: 'badge-hu-pmp', title: 'HU PMP', color: '#a78bfa' },
    { key: 'hu_ldpe', url: '/qa/api/ct/hu_linearity/', field: 'hu_ldpe', scrollId: 'scroll-hu-ldpe', yaxisId: 'yaxis-hu-ldpe', valId: 'val-hu-ldpe', badgeId: 'badge-hu-ldpe', title: 'HU LDPE', color: '#34d399' },
    { key: 'hu_poly', url: '/qa/api/ct/hu_linearity/', field: 'hu_poly', scrollId: 'scroll-hu-poly', yaxisId: 'yaxis-hu-poly', valId: 'val-hu-poly', badgeId: 'badge-hu-poly', title: 'HU Polystyreeni', color: '#60a5fa' },
    { key: 'hu_acrylic', url: '/qa/api/ct/hu_linearity/', field: 'hu_acrylic', scrollId: 'scroll-hu-acrylic', yaxisId: 'yaxis-hu-acrylic', valId: 'val-hu-acrylic', badgeId: 'badge-hu-acrylic', title: 'HU Akryyli', color: '#fb7185' },
    { key: 'hu_delrin', url: '/qa/api/ct/hu_linearity/', field: 'hu_delrin', scrollId: 'scroll-hu-delrin', yaxisId: 'yaxis-hu-delrin', valId: 'val-hu-delrin', badgeId: 'badge-hu-delrin', title: 'HU Delrin', color: '#f97316' },
    { key: 'hu_teflon', url: '/qa/api/ct/hu_linearity/', field: 'hu_teflon', scrollId: 'scroll-hu-teflon', yaxisId: 'yaxis-hu-teflon', valId: 'val-hu-teflon', badgeId: 'badge-hu-teflon', title: 'HU Teflon', color: '#e879f9' },
    { key: 'mtf', url: '/qa/api/ct/mtf/', field: 'mtf_50_percent', scrollId: 'scroll-mtf', yaxisId: 'yaxis-mtf', valId: 'val-mtf', badgeId: 'badge-mtf', title: 'MTF 50%', color: '#38bdf8' },
    { key: 'low_contrast', url: '/qa/api/ct/low_contrast/', field: 'num_low_contrast_rois_seen', scrollId: 'scroll-low-contrast', yaxisId: 'yaxis-low-contrast', valId: 'val-low-contrast', badgeId: 'badge-low-contrast', title: 'Matala kontrasti', color: '#c084fc' },
    { key: 'noise', url: '/qa/api/ct/noise/', field: 'noise_hu_std', scrollId: 'scroll-noise', yaxisId: 'yaxis-noise', valId: 'val-noise', badgeId: 'badge-noise', title: 'Kohina', color: '#fbbf24' },
    { key: 'slice_thickness', url: '/qa/api/ct/slice_thickness/', field: 'slice_thickness_mm', scrollId: 'scroll-slice-thickness', yaxisId: 'yaxis-slice-thickness', valId: 'val-slice-thickness', badgeId: 'badge-slice-thickness', title: 'Leikepaksuus', color: '#52e3a0' }
  ];

  var totalCharts = CHART_CONFIGS.length;

  function tryBuildCharts() {
    loadedCount++;
    if (loadedCount < totalCharts) return;
    buildChartsFromData();
  }


  function buildChartsFromData() {
    CHARTS = [];

    CHART_CONFIGS.forEach(function (cfg) {
      var data = dataArrays[cfg.key];
      if (!data || data.length === 0) return;

      var range = getRange(data, cfg.field);
      setYAxis(cfg.yaxisId, range.min, range.max);

      // Update latest value display
      var latest = data[data.length - 1];
      var latestVal = latest[cfg.field];
      setTextContent(cfg.valId, latestVal != null ? Number(latestVal).toFixed(2) : '-');
      setBadge(document.getElementById(cfg.badgeId), 'ok', 'OK');

      CHARTS.push({
        scrollId: cfg.scrollId,
        data: data.map(function (d) { return normalise(d[cfg.field], range.min, range.max); }),
        dates: data.map(function (d) { return formatDate(d.content_date); }),
        instances: data.map(function (d) { return d.instance; }),
        lineColor: cfg.color,
        gradColor: cfg.color,
        limits: [],
        badThreshold: null,
        zeroLine: false
      });
    });

    initCharts();

    // Load latest point's metadata
    var firstData = dataArrays['uniformity'];
    if (firstData && firstData.length > 0) {
      var latest = firstData[firstData.length - 1];
      updateTableByInstance(latest.instance);
    }
  }


  // ── Fetch all data series (deduplicate shared URLs) ──
  var fetchPromises = {};
  CHART_CONFIGS.forEach(function (cfg) {
    var fullUrl = cfg.url + firstDeviceName + '/';
    if (!fetchPromises[fullUrl]) {
      fetchPromises[fullUrl] = fetch(fullUrl).then(function (r) { return r.json(); });
    }
    fetchPromises[fullUrl]
      .then(function (data) {
        dataArrays[cfg.key] = data;
        tryBuildCharts();
      })
      .catch(function (e) {
        console.error('Virhe: ' + cfg.key + ' data:', e);
        loadedCount++;
      });
  });


  // ── Update metadata table by instance ──
  function updateTableByInstance(instanceValue) {
    selectedInstance = instanceValue;

    fetch('/qa/api/ct/instance/' + instanceValue + '/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setTextContent('device-name', data.station_name);
        setTextContent('content-date', formatDate(data.content_date));
        setTextContent('phantom-model', data.phantom_model);
        setTextContent('kvp', data.kvp);
        setTextContent('tube-current', data.tube_current);
        setTextContent('slice-thickness', data.slice_thickness);
        setTextContent('reconstruction-kernel', data.reconstruction_kernel);
        setTextContent('ctdi-vol', data.ctdi_vol);
        setTextContent('uniformity-index', data.uniformity_index);
        setTextContent('mtf-50', data.mtf_50_percent);
        setTextContent('noise-hu-std', data.noise_hu_std);
        setTextContent('instance-value', data.instance);

        // Overall pass/fail
        var passEl = document.getElementById('overall-pass');
        if (passEl) {
          if (data.overall_pass === true) {
            passEl.innerText = 'PASS';
            passEl.className = 'meta-val ok';
          } else if (data.overall_pass === false) {
            passEl.innerText = 'FAIL';
            passEl.className = 'meta-val bad';
          } else {
            passEl.innerText = '-';
            passEl.className = 'meta-val';
          }
        }

        // Update topbar date
        setTextContent('topbar-date', formatDate(data.content_date));

        // Update chips
        updateChips({
          uniformity: data.uniformity_index,
          mtf50: data.mtf_50_percent,
          noise: data.noise_hu_std,
          huAir: data.hu_air,
          huPmp: data.hu_pmp,
          huLdpe: data.hu_ldpe,
          huPoly: data.hu_poly,
          huAcrylic: data.hu_acrylic,
          huDelrin: data.hu_delrin,
          huTeflon: data.hu_teflon,
          lowContrast: data.num_low_contrast_rois_seen,
          sliceThickness: data.slice_thickness_mm,
          overallPass: data.overall_pass
        });

        // Load image
        loadCTImage(instanceValue);
      })
      .catch(function (e) {
        console.error('Virhe päivitettäessä taulukkoa:', e);
      });
  }


  // ── Image loading with tabs (CT slices) ──
  var activeTab = 'hu_linearity';

  function loadCTImage(instanceValue) {
    activeTab = 'hu_linearity';
    updateTabButtons();
    showImageForTab(instanceValue);
    // Lataa myös oletuskuvaaja
    activeChartTab = 'hu_linearity_chart';
    updateChartTabButtons();
    showChartForTab(instanceValue);
  }

  function showImageForTab(instanceValue) {
    if (!instanceValue) return;
    var imageElement = document.getElementById('orthanc-image');
    var imageUrl = '/qa/api/ct/analysis_image/' + instanceValue + '/' + activeTab + '/';

    imageElement.style.display = 'none';
    var loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.textContent = window.T&&window.T.loading||'Ladataan leikekuvaa...';
      loadingIndicator.style.display = 'block';
    }

    fetch(imageUrl)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.blob();
      })
      .then(function (blob) {
        imageElement.src = URL.createObjectURL(blob);
        imageElement.style.display = 'block';
        if (loadingIndicator) loadingIndicator.style.display = 'none';
      })
      .catch(function () {
        imageElement.style.display = 'none';
        if (loadingIndicator) {
          loadingIndicator.textContent = window.T&&window.T.noImage||'Leikekuvaa ei saatavilla';
          loadingIndicator.style.display = 'block';
        }
      });
  }

  function updateTabButtons() {
    document.querySelectorAll('.image-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
  }

  document.querySelectorAll('.image-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeTab = btn.dataset.tab;
      updateTabButtons();
      if (selectedInstance) {
        showImageForTab(selectedInstance);
      }
    });
  });


  // ── Chart loading with tabs (analysis charts) ──
  var activeChartTab = 'hu_linearity_chart';

  function showChartForTab(instanceValue) {
    if (!instanceValue) return;
    var chartElement = document.getElementById('chart-image');
    var chartUrl = '/qa/api/ct/analysis_image/' + instanceValue + '/' + activeChartTab + '/';

    chartElement.style.display = 'none';
    var chartLoading = document.getElementById('chart-loading');
    if (chartLoading) {
      chartLoading.textContent = window.T&&window.T.loadingChart||'Ladataan kuvaajaa...';
      chartLoading.style.display = 'block';
    }

    fetch(chartUrl)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.blob();
      })
      .then(function (blob) {
        chartElement.src = URL.createObjectURL(blob);
        chartElement.style.display = 'block';
        if (chartLoading) chartLoading.style.display = 'none';
      })
      .catch(function () {
        chartElement.style.display = 'none';
        if (chartLoading) {
          chartLoading.textContent = window.T&&window.T.noImage||'Kuvaajaa ei saatavilla';
          chartLoading.style.display = 'block';
        }
      });
  }

  function updateChartTabButtons() {
    document.querySelectorAll('.chart-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.chart === activeChartTab);
    });
  }

  document.querySelectorAll('.chart-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeChartTab = btn.dataset.chart;
      updateChartTabButtons();
      if (selectedInstance) {
        showChartForTab(selectedInstance);
      }
    });
  });


  // ── Metrics summary in AI chat ──
  function reportMetricsToChat(m) {
    var answerBox = document.getElementById('answer-box');
    if (!answerBox) return;

    var existing = answerBox.querySelector('.ai-msg.metrics');
    if (existing) existing.remove();

    function fmt(v, dec) { return v != null ? Number(v).toFixed(dec) : '–'; }

    var passClass = 'ok';
    var passText = '–';
    if (m.overallPass === true) { passClass = 'ok'; passText = 'PASS'; }
    else if (m.overallPass === false) { passClass = 'bad'; passText = 'FAIL'; }

    var msg = document.createElement('div');
    msg.className = 'ai-msg metrics';
    msg.innerHTML =
      '<div class="ai-msg-label">' + (window.T&&window.T.metrics||'Mittaustulokset') + '</div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.uniformity||'Uniformiteetti') + '</span><span class="metric-value ok">' + fmt(m.uniformity, 2) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">MTF 50%</span><span class="metric-value ok">' + fmt(m.mtf50, 2) + ' lp/cm</span></div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.noise||'Kohina (HU SD)') + '</span><span class="metric-value ok">' + fmt(m.noise, 2) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">HU Ilma</span><span class="metric-value ok">' + fmt(m.huAir, 1) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">HU PMP</span><span class="metric-value ok">' + fmt(m.huPmp, 1) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">HU LDPE</span><span class="metric-value ok">' + fmt(m.huLdpe, 1) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">HU Polystyreeni</span><span class="metric-value ok">' + fmt(m.huPoly, 1) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">HU Akryyli</span><span class="metric-value ok">' + fmt(m.huAcrylic, 1) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">HU Delrin</span><span class="metric-value ok">' + fmt(m.huDelrin, 1) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">HU Teflon</span><span class="metric-value ok">' + fmt(m.huTeflon, 1) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.lowContrast||'Matala kontrasti') + '</span><span class="metric-value ok">' + fmt(m.lowContrast, 0) + ' ROI</span></div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.thickness||'Leikepaksuus') + '</span><span class="metric-value ok">' + fmt(m.sliceThickness, 2) + ' mm</span></div>' +
      '<div class="metric-line"><span class="metric-label">' + (window.T&&window.T.overall||'Kokonaistulos') + '</span><span class="metric-value ' + passClass + '">' + passText + '</span></div>';

    answerBox.insertBefore(msg, answerBox.firstChild);
  }


  // ── AI chat ──
  var chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      var question = document.getElementById('question').value.trim();
      var answerBox = document.getElementById('answer-box');

      if (!question) return;

      var userMsg = document.createElement('div');
      userMsg.className = 'ai-msg user';
      userMsg.textContent = question;
      answerBox.appendChild(userMsg);
      document.getElementById('question').value = '';
      answerBox.scrollTop = answerBox.scrollHeight;

      var loadingMsg = document.createElement('div');
      loadingMsg.className = 'ai-msg assistant';
      loadingMsg.innerHTML = '<div class="ai-msg-label">' + (window.T&&window.T.aiLabel||'Tekoäly') + '</div>' + (window.T&&window.T.fetching||'Haetaan vastausta...');
      answerBox.appendChild(loadingMsg);
      answerBox.scrollTop = answerBox.scrollHeight;

      try {
        var response = await fetch('/qa/ask-ai/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
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
    var cookies = document.cookie.split(';');
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i].trim();
      if (cookie.startsWith('csrftoken=')) {
        return decodeURIComponent(cookie.substring('csrftoken='.length));
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
        var res = await fetch('/qa/api/report-issue/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCSRFToken()
          },
          body: JSON.stringify({ message: message })
        });
        var data = await res.json();

        if (data.status === 'ok') {
          document.getElementById('mini-chat-input').value = '';
          document.getElementById('mini-chat-input').placeholder = window.T&&window.T.messageSent||'Viesti lähetetty!';
          setTimeout(function () {
            document.getElementById('mini-chat-input').placeholder = window.T&&window.T.reportHint||'Kuvaile havaittu ongelma…';
          }, 2000);
        }
      } catch (err) {
        console.error('Slack-ilmoitus epäonnistui:', err);
      }
    });
  }


  // ── DICOM modal (Ctrl+I) ──
  var isDicomOpen = false;

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.shiftKey && e.code === 'KeyI') {
      var t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;

      e.preventDefault();
      if (isDicomOpen) {
        closeDicomModal();
      } else {
        var inst = document.getElementById('instance-value');
        if (inst) openDicomModal(inst.textContent.trim());
      }
    }
    if (e.key === 'Escape' && isDicomOpen) {
      e.preventDefault();
      closeDicomModal();
    }
  });

  window.openDicomModal = function (instanceId) {
    fetch('/qa/api/ct/instance/' + instanceId + '/')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var colLeft = document.getElementById('dicom-col-left');
        var colRight = document.getElementById('dicom-col-right');
        colLeft.innerHTML = '';
        colRight.innerHTML = '';

        var keys = Object.keys(data);
        var half = Math.ceil(keys.length / 2);
        keys.forEach(function (key, i) {
          var row = document.createElement('div');
          row.className = 'dicom-row';
          row.innerHTML = '<span class="dicom-key">' + key + '</span><span class="dicom-val">' + (data[key] != null ? data[key] : '-') + '</span>';
          if (i < half) colLeft.appendChild(row);
          else colRight.appendChild(row);
        });

        document.getElementById('dicom-modal').style.display = 'block';
        isDicomOpen = true;
      })
      .catch(function (err) {
        console.error('DICOM-modaali virhe:', err);
      });
  };

  window.closeDicomModal = function () {
    document.getElementById('dicom-modal').style.display = 'none';
    isDicomOpen = false;
  };

});
