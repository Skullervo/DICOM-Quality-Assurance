// ─────────────────────────────────────────────
// XrayDeviceDetails v6 — SVG trend charts
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

  // ── SVG Chart engine (adapted from US v6) ──────────
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
    return raw.slice(6, 8) + '.' + raw.slice(4, 6);
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
    // Row 1: Uniformity
    el = document.getElementById('chip-uniformity');
    if (el && metrics.uniformity != null) {
      el.className = 'chip-val ok';
      el.innerHTML = Number(metrics.uniformity).toFixed(1) + ' <span style="font-size:11px;font-weight:400">%</span>';
    }

    // Row 1: MTF 50%
    el = document.getElementById('chip-mtf');
    if (el && metrics.mtf50 != null) {
      el.className = 'chip-val ok';
      el.innerHTML = Number(metrics.mtf50).toFixed(2) + ' <span style="font-size:11px;font-weight:400">lp/mm</span>';
    }

    // Row 1: Median Contrast
    el = document.getElementById('chip-contrast');
    if (el && metrics.medianContrast != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.medianContrast).toFixed(2);
    }

    // Row 2: Cu 1.0mm
    el = document.getElementById('chip-copper');
    if (el && metrics.copper != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.copper).toFixed(2);
    }

    // Row 2: Low Contrast
    el = document.getElementById('chip-low-contrast');
    if (el && metrics.lowContrast != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.lowContrast).toFixed(4);
    }

    // Row 2: CNR
    el = document.getElementById('chip-cnr');
    if (el && metrics.cnr != null) {
      el.className = 'chip-val ok';
      el.textContent = Number(metrics.cnr).toFixed(2);
    }
  }


  // ── Data loading ──
  var dataArrays = {};
  var loadedCount = 0;
  var totalCharts = 17;
  var selectedInstance = null;

  var CHART_CONFIGS = [
    // Row 1: Summary metrics
    { key: 'uniformity',  url: '/qa/api/xray/uniformity/',  field: 'uniformity_center', scrollId: 'scroll-uniformity',   yaxisId: 'yaxis-uniformity',   valId: 'val-uniformity',   badgeId: 'badge-uniformity',   color: '#00b4d8' },
    { key: 'mtf',         url: '/qa/api/xray/mtf/',         field: 'mtf_50_percent',    scrollId: 'scroll-mtf',           yaxisId: 'yaxis-mtf',           valId: 'val-mtf',           badgeId: 'badge-mtf',           color: '#38bdf8' },
    { key: 'cnr',         url: '/qa/api/xray/cnr/',         field: 'median_cnr',        scrollId: 'scroll-cnr',           yaxisId: 'yaxis-cnr',           valId: 'val-cnr',           badgeId: 'badge-cnr',           color: '#fbbf24' },
    // Row 2: Key contrast + copper metrics
    { key: 'contrast',    url: '/qa/api/xray/contrast/',    field: 'median_contrast',   scrollId: 'scroll-contrast',      yaxisId: 'yaxis-contrast',      valId: 'val-contrast',      badgeId: 'badge-contrast',      color: '#52e3a0' },
    { key: 'copper',      url: '/qa/api/xray/copper/',      field: 'cu_100_mean',       scrollId: 'scroll-copper',        yaxisId: 'yaxis-copper',        valId: 'val-copper',        badgeId: 'badge-copper',        color: '#fb7185' },
    { key: 'low_contrast',url: '/qa/api/xray/low_contrast/',field: 'lc_20_contrast',    scrollId: 'scroll-low-contrast',  yaxisId: 'yaxis-low-contrast',  valId: 'val-low-contrast',  badgeId: 'badge-low-contrast',  color: '#c084fc' },
    // Row 3: Cu 0.0–0.65mm
    { key: 'cu_000', url: '/qa/api/xray/metric/cu_000_mean/', field: 'cu_000_mean', scrollId: 'scroll-cu-000', yaxisId: 'yaxis-cu-000', valId: 'val-cu-000', badgeId: 'badge-cu-000', color: '#ff9f43' },
    { key: 'cu_030', url: '/qa/api/xray/metric/cu_030_mean/', field: 'cu_030_mean', scrollId: 'scroll-cu-030', yaxisId: 'yaxis-cu-030', valId: 'val-cu-030', badgeId: 'badge-cu-030', color: '#fdcb6e' },
    { key: 'cu_065', url: '/qa/api/xray/metric/cu_065_mean/', field: 'cu_065_mean', scrollId: 'scroll-cu-065', yaxisId: 'yaxis-cu-065', valId: 'val-cu-065', badgeId: 'badge-cu-065', color: '#84cc16' },
    // Row 4: Cu 1.4–2.3mm
    { key: 'cu_140', url: '/qa/api/xray/metric/cu_140_mean/', field: 'cu_140_mean', scrollId: 'scroll-cu-140', yaxisId: 'yaxis-cu-140', valId: 'val-cu-140', badgeId: 'badge-cu-140', color: '#22d3ee' },
    { key: 'cu_185', url: '/qa/api/xray/metric/cu_185_mean/', field: 'cu_185_mean', scrollId: 'scroll-cu-185', yaxisId: 'yaxis-cu-185', valId: 'val-cu-185', badgeId: 'badge-cu-185', color: '#818cf8' },
    { key: 'cu_230', url: '/qa/api/xray/metric/cu_230_mean/', field: 'cu_230_mean', scrollId: 'scroll-cu-230', yaxisId: 'yaxis-cu-230', valId: 'val-cu-230', badgeId: 'badge-cu-230', color: '#e879f9' },
    // Row 5: LC 0.8–2.8%
    { key: 'lc_08', url: '/qa/api/xray/metric/lc_08_contrast/', field: 'lc_08_contrast', scrollId: 'scroll-lc-08', yaxisId: 'yaxis-lc-08', valId: 'val-lc-08', badgeId: 'badge-lc-08', color: '#34d399' },
    { key: 'lc_12', url: '/qa/api/xray/metric/lc_12_contrast/', field: 'lc_12_contrast', scrollId: 'scroll-lc-12', yaxisId: 'yaxis-lc-12', valId: 'val-lc-12', badgeId: 'badge-lc-12', color: '#2dd4bf' },
    { key: 'lc_28', url: '/qa/api/xray/metric/lc_28_contrast/', field: 'lc_28_contrast', scrollId: 'scroll-lc-28', yaxisId: 'yaxis-lc-28', valId: 'val-lc-28', badgeId: 'badge-lc-28', color: '#fb923c' },
    // Row 6: LC 4.0–5.6%
    { key: 'lc_40', url: '/qa/api/xray/metric/lc_40_contrast/', field: 'lc_40_contrast', scrollId: 'scroll-lc-40', yaxisId: 'yaxis-lc-40', valId: 'val-lc-40', badgeId: 'badge-lc-40', color: '#60a5fa' },
    { key: 'lc_56', url: '/qa/api/xray/metric/lc_56_contrast/', field: 'lc_56_contrast', scrollId: 'scroll-lc-56', yaxisId: 'yaxis-lc-56', valId: 'val-lc-56', badgeId: 'badge-lc-56', color: '#f472b6' },
  ];


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

    // Load first point's metadata
    var firstData = dataArrays['uniformity'];
    if (firstData && firstData.length > 0) {
      var latest = firstData[firstData.length - 1];
      updateTableByInstance(latest.instance);
    }
  }


  // ── Fetch all 17 data series ──
  CHART_CONFIGS.forEach(function (cfg) {
    fetch(cfg.url + firstDeviceName + '/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        dataArrays[cfg.key] = data;
        tryBuildCharts();
      })
      .catch(function (e) {
        console.error('Virhe: ' + cfg.key + ' data:', e);
        tryBuildCharts();
      });
  });


  // ── Update metadata table by instance ──
  function updateTableByInstance(instanceValue) {
    selectedInstance = instanceValue;

    fetch('/qa/api/xray/instance/' + instanceValue + '/')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // Päivämäärä muotoon PP.KK.VVVV
        var dateStr = data.content_date;
        var formattedDate = dateStr;
        if (dateStr && dateStr.length === 8) {
          formattedDate = dateStr.slice(6, 8) + '.' + dateStr.slice(4, 6) + '.' + dateStr.slice(0, 4);
        }

        // Valotusaika ms → s
        var expTimeSec = null;
        if (data.exposure_time != null && data.exposure_time !== '') {
          expTimeSec = (Number(data.exposure_time) / 1000).toFixed(3);
        }

        // mAs = exposure_time(ms) * tube_current(mA) / 1000
        var mAs = null;
        if (data.exposure_time != null && data.tube_current != null &&
            data.exposure_time !== '' && data.tube_current !== '') {
          mAs = (Number(data.exposure_time) * Number(data.tube_current) / 1000).toFixed(1);
        }

        setTextContent('modality', data.modality);
        setTextContent('content-date', formattedDate);
        setTextContent('device-name', data.station_name);
        setTextContent('manufacturer', data.manufacturer);
        setTextContent('manufacturer-model', data.manufacturer_model_name);
        setTextContent('device-serial', data.device_serial_number);
        setTextContent('kvp', data.kvp);
        setTextContent('tube-current', data.tube_current);
        setTextContent('exposure-time', expTimeSec);
        setTextContent('exposure-mas', mAs);

        // Update topbar date
        setTextContent('topbar-date', formattedDate);

        // Update chips
        updateChips({
          uniformity: data.uniformity_center,
          mtf50: data.mtf_50_percent,
          medianContrast: data.median_contrast,
          copper: data.cu_100_mean,
          lowContrast: data.lc_20_contrast,
          cnr: data.median_cnr
        });

        // Load image
        loadXrayImage(instanceValue);
      })
      .catch(function (e) {
        console.error('Virhe päivitettäessä taulukkoa:', e);
      });
  }


  // ── Image loading with tabs ──
  var activeTab = 'dicom';

  function loadXrayImage(instanceValue) {
    activeTab = 'dicom';
    updateTabButtons();
    showImageForTab(instanceValue);
  }

  function showImageForTab(instanceValue) {
    if (!instanceValue) return;
    var imageElement = document.getElementById('orthanc-image');
    var imageUrl;

    if (activeTab === 'dicom') {
      imageUrl = '/qa/get_xray_image/' + instanceValue + '/';
    } else if (activeTab === 'contrast_rois') {
      imageUrl = '/qa/api/xray/analysis_image/' + instanceValue + '/contrast_rois/';
    } else if (activeTab === 'mtf_lp') {
      imageUrl = '/qa/api/xray/analysis_image/' + instanceValue + '/mtf_lp/';
    } else if (activeTab === 'mtf_curve') {
      imageUrl = '/qa/api/xray/analysis_image/' + instanceValue + '/mtf_curve/';
    }

    // MTF-käyrä on leveämpi (ei neliö)
    imageElement.style.aspectRatio = (activeTab === 'mtf_curve') ? 'auto' : '1';

    imageElement.style.display = 'none';
    var loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.textContent = window.T&&window.T.loading||'Ladataan kuvaa...';
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
        if (activeTab === 'dicom') {
          imageElement.src = '/static/images/XRAY.png';
          imageElement.style.display = 'block';
          if (loadingIndicator) loadingIndicator.style.display = 'none';
        } else {
          imageElement.style.display = 'none';
          if (loadingIndicator) {
            loadingIndicator.textContent = window.T&&window.T.noImage||'Analyysikuvaa ei saatavilla';
            loadingIndicator.style.display = 'block';
          }
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


  // ── Metrics summary in AI chat ──
  function reportMetricsToChat(m) {
    var answerBox = document.getElementById('answer-box');
    if (!answerBox) return;

    var existing = answerBox.querySelector('.ai-msg.metrics');
    if (existing) existing.remove();

    function fmt(v, dec) { return v != null ? Number(v).toFixed(dec) : '–'; }

    var msg = document.createElement('div');
    msg.className = 'ai-msg metrics';
    msg.innerHTML =
      '<div class="ai-msg-label">' + (window.T&&window.T.metrics||'Mittaustulokset') + '</div>' +
      '<div class="metric-line"><span class="metric-label">Uniformity</span><span class="metric-value ok">' + fmt(m.uniformity, 1) + ' %</span></div>' +
      '<div class="metric-line"><span class="metric-label">MTF 50%</span><span class="metric-value ok">' + fmt(m.mtf50, 2) + ' lp/mm</span></div>' +
      '<div class="metric-line"><span class="metric-label">Median Contrast</span><span class="metric-value ok">' + fmt(m.medianContrast, 2) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">Cu 1.0mm</span><span class="metric-value ok">' + fmt(m.copper, 2) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">Low Contrast 2.0%</span><span class="metric-value ok">' + fmt(m.lowContrast, 4) + '</span></div>' +
      '<div class="metric-line"><span class="metric-label">CNR</span><span class="metric-value ok">' + fmt(m.cnr, 2) + '</span></div>';

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
    fetch('/qa/api/xray/instance/' + instanceId + '/')
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
