document.addEventListener('DOMContentLoaded', function() {
  // Muuttujat skrollaukseen
  let offsetSDepth = 0;
  let offsetUCov = 0;
  let offsetUSkew = 0;
  const limit = 10;
  let isDragging = false;
  let startX = 0;
  let scrollSpeed = 0.2;
  let chart1, chart2, chart3;
  let data1, data2, data3;
  let loadedCount = 0;
  let selectedInstance = null;


  // Kaaviot
  const ctx1 = document.getElementById('chart1').getContext('2d');
  const ctx2 = document.getElementById('chart2').getContext('2d');
  const ctx3 = document.getElementById('chart3').getContext('2d');

  const stationname = document.getElementById('device-name').innerText;

  function limitData(data, offset, limit) {
    return data.slice(offset, offset + limit);
  }

  // 📌 Rekisteröi plugin
  Chart.register(window['chartjs-plugin-annotation']);

  function buildBand(yMin, yMax, color, label) {
    return {
      type: 'box',
      yMin: yMin,
      yMax: yMax,
      backgroundColor: color,
      borderWidth: 0,
      label: {
        content: label,
        enabled: false
      }
    };
  }

  

  function tryUpdateScrollbarMax() {
    loadedCount++;
    if (loadedCount === 3) {
      updateScrollbarMax();
    }
  }

  function updateScrollbarMax() {
  if (data1 && data2 && data3) {
    const maxOffset = Math.min(data1.length, data2.length, data3.length) - limit;
    scrollbar.max = maxOffset >= 0 ? maxOffset : 0;
  }
}



function buildDashedLine(yValue, colorRGBA, label) {
  return {
    type: 'line',
    yMin: yValue,
    yMax: yValue,
    borderColor: colorRGBA,         // esim. 'rgba(0,255,0,0.3)'
    borderWidth: 0.5,                 // pienempi paksuus
    borderDash: [4, 4],             // katkoviiva
    label: {
      display: false,
      content: label,
      color: colorRGBA,
      backgroundColor: 'rgba(0,0,0,0.5)',
      position: 'end',
      font: {
        style: 'italic',
        size: 10
      }
    }
  };
}


  



  function updateTableByInstance(instanceValue) {
  fetch(`/first_app/api/ultrasound/${instanceValue}/`)
    .then(response => response.json())
    .then(data => {
      document.getElementById('s-depth-value').innerText = data.s_depth ?? 'unknown';
      document.getElementById('u-cov-value').innerText = data.u_cov ?? 'unknown';
      document.getElementById('u-skew-value').innerText = data.u_skew ?? 'unknown';
      document.getElementById('u-low-value').innerText = data.u_low ?? 'unknown';
      document.getElementById('instance-value').innerText = data.instance ?? 'unknown';
      loadOrthancImage(instanceValue);
    });
}

  // Funktio, joka rajoittaa datan haluttuun määrään
  function limitData(data, offset, limit) {
    return data.slice(offset, offset + limit);
  }

  // Funktio päivittää Chart.js -kuvaajan
  function updateChart(chart, data, offset, limit, fieldName) {
    chart.data.labels = limitData(data.map(item => item.seriesdate), offset, limit);
    chart.data.datasets[0].data = limitData(data.map(item => item[fieldName]), offset, limit);
    chart.update();
  }

  // Funktio käsittelee hiiren vedon kuvaajassa ja tekee liikkeestä dynaamisempaa
  function handleDrag(chart, data, offsetName, limit, fieldName) {
  chart.canvas.addEventListener('mousedown', function(evt) {
    isDragging = true;
    startX = evt.clientX;
    chart.canvas.style.cursor = 'grabbing';
  });

  chart.canvas.addEventListener('mousemove', function(evt) {
    if (isDragging) {
      const deltaX = evt.clientX - startX;
      startX = evt.clientX;
      const dataShift = Math.round(deltaX * scrollSpeed);

      // Käytä offsetName-muuttujaa globaalisti
      if (chart === chart1) {
        if (dataShift < 0) {
          offsetSDepth = Math.min(offsetSDepth + Math.abs(dataShift), data.length - limit);
        } else if (dataShift > 0) {
          offsetSDepth = Math.max(offsetSDepth - dataShift, 0);
        }
        updateChart(chart1, data1, offsetSDepth, limit, 's_depth');
        scrollbar.value = offsetSDepth;
      }
      // Lisää vastaavat chart2 ja chart3 myöhemmin
    }
  });

  chart.canvas.addEventListener('mouseup', function() {
    isDragging = false;
    chart.canvas.style.cursor = 'default';
  });

  chart.canvas.addEventListener('mouseleave', function() {
    isDragging = false;
    chart.canvas.style.cursor = 'default';
  });
}

  // Funktio käsittelee pisteen valinnan ja vaihtaa sen värin
  // function highlightSelectedPoint(chart, index) {
  //   const dataset = chart.data.datasets[0];
  //   const pointColors = dataset.pointBackgroundColor;
  //   if (!Array.isArray(pointColors)) {
  //     dataset.pointBackgroundColor = Array(dataset.data.length).fill('rgba(0, 0, 0, 0.1)');
  //   }

  //   // Nollataan kaikki värit
  //   dataset.pointBackgroundColor = dataset.pointBackgroundColor.map(() => 'rgba(0, 0, 0, 0.1)');

  //   // Vaihdetaan valitun pisteen väri
  //   dataset.pointBackgroundColor[index] = 'rgba(255, 0, 0, 1)'; // Punainen valitulle pisteelle
  //   chart.update();
  // }

  function highlightSelectedPoint(chart, index) {
  const dataset = chart.data.datasets[0];
  if (!Array.isArray(dataset.pointBackgroundColor)) {
    dataset.pointBackgroundColor = Array(dataset.data.length).fill('rgba(0, 0, 0, 0.1)');
  }
  // Nollaa kaikki värit
  dataset.pointBackgroundColor = dataset.pointBackgroundColor.map(() => 'rgba(0, 0, 0, 0.1)');
  // Jos index on kelvollinen, korosta se
  if (index >= 0 && index < dataset.pointBackgroundColor.length) {
    dataset.pointBackgroundColor[index] = 'rgba(255, 0, 0, 1)';
  }
  chart.update();
}


  const GOOD_MIN = buildDashedLine(2, 'rgba(0,255,0,0.9)');
  const GOOD_MAX = buildDashedLine(3, 'rgba(0,255,0,0.9)');
  const WARN_1   = buildDashedLine(1, 'rgba(255,255,0,0.9)');
  const WARN_2   = buildDashedLine(4, 'rgba(255,255,0,0.9)');
  const BAD_LO   = buildDashedLine(0, 'rgba(255,0,0,0.9)');
  const BAD_HI   = buildDashedLine(5, 'rgba(255,0,0,0.9)');


fetch(`/first_app/api/s_depth/${stationname}/`)
  .then(response => response.json())
  .then(data => {
    data1 = data;  // Tallenna data globaaliin muuttujaan
    chart1 = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: limitData(data.map(item => item.seriesdate), offsetSDepth, limit),
        datasets: [{
          label: 'Herkkyys [mm]',
          data: limitData(data.map(item => item.s_depth), offsetSDepth, limit),
          fill: false,
          borderColor: 'rgb(75, 192, 192)',
          borderWidth: 1,
          tension: 0.1,
          pointBackgroundColor: Array(limit).fill('rgba(0, 0, 0, 0.1)')
        }]
      },
      options: {
        scales: {
          x: {
            ticks: {
              color: '#f8f9fa',
              callback: function(value) {
                const raw = this.getLabelForValue(value);
                const year = raw.slice(0, 4);
                const month = raw.slice(4, 6);
                const day = raw.slice(6, 8);
                return `${day}.${month}.${year}`;
              }
            },
            grid: { color: '#6c757d' }
          },
          y: {
            min: 0,
            max: 5,
            ticks: { color: '#f8f9fa' },
            grid: { color: '#6c757d' }
          }
        },
        plugins: {
          annotation: {
            annotations: {
              GOOD_MIN,
              GOOD_MAX,
              WARN_1,
              WARN_2,
              BAD_LO,
              BAD_HI
            }
          }
        }
      }
    });

    
    updateScrollbarMax();

    // Lisää vedon käsittely
    // handleDrag(chart1, data, offsetSDepth, limit, 's_depth');
    handleDrag(chart1, data1, 'offsetSDepth', limit, 's_depth');

    // Klikkaus valitsee pisteen
    document.getElementById('chart1').onclick = function(evt) {
      const activePoints = chart1.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
      if (activePoints.length > 0) {
        const clickedIndex = activePoints[0].index + offsetSDepth;
        const instanceValue = data[clickedIndex].instance;
        selectedInstance = instanceValue; // <-- TÄRKEÄÄ
        updateTableByInstance(instanceValue);
        highlightSelectedPoint(chart1, activePoints[0].index);
      }
    };

    // updateScrollbarMax();  // Päivitä skrollauspalkin maksimiarvo
    // ...chart1:n luonnin jälkeen...

    if (data1 && data1.length > 0) {
      // Valitse ensimmäinen mittauspiste
      const firstInstance = data1[0].instance;
      updateTableByInstance(firstInstance); // Päivitä taulukko ja kuva
      highlightSelectedPoint(chart1, 0);    // Korosta ensimmäinen piste
    }

    tryUpdateScrollbarMax();

  })
  .catch(error => {
    console.error('There has been a problem with your fetch operation for s_depth:', error);
  });


    fetch(`/first_app/api/u_cov/${stationname}/`)
    .then(response => response.json())
    .then(data => {
      // const chart2 = new Chart(ctx2, {
      data2 = data;
      chart2 = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: limitData(data.map(item => item.seriesdate), offsetSDepth, limit),
          datasets: [{
            label: 'Tasaisuus [%]',
            data: limitData(data.map(item => item.u_cov), offsetSDepth, limit),
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 1,
            tension: 0.1,
            pointBackgroundColor: Array(limit).fill('rgba(0, 0, 0, 0.1)')
          }]
        },
        options: {
          scales: {
            x: {
              // ticks: { color: '#f8f9fa' },
                ticks: {
                  color: '#f8f9fa',
                  callback: function(value) {
                    const raw = this.getLabelForValue(value);
                    // Odotetaan muotoa '20210603'
                    const year = raw.slice(0, 4);
                    const month = raw.slice(4, 6);
                    const day = raw.slice(6, 8);
                    return `${day}.${month}.${year}`;  // → dd.mm.yyyy
                  }
                },
              grid: { color: '#6c757d' }
            },
            y: {
              min: 0,        // Ala-arvo y-akselille
              max: 5,        // Yläarvo (voit säätää esim. 4, jos tiedät datan raja-arvot)
              ticks: { color: '#f8f9fa' },
              grid: { color: '#6c757d' }
            }
          },
          plugins: {
            annotation: {
              annotations: {
                GOOD_MIN,
                GOOD_MAX,
                WARN_1,
                WARN_2,
                BAD_LO,
                BAD_HI
              }
            }
          }
        }
      });

  

      handleDrag(chart2, data, offsetUCov, limit, 'u_cov');

      document.getElementById('chart2').onclick = function(evt) {
        const activePoints = chart2.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (activePoints.length > 0) {
          const clickedIndex = activePoints[0].index + offsetSDepth;
          const instanceValue = data[clickedIndex].instance;
          selectedInstance = instanceValue; // <-- TÄRKEÄÄ
          updateTableByInstance(instanceValue);
          highlightSelectedPoint(chart2, activePoints[0].index);
        }
      };

      if (data2 && data2.length > 0) {
      // Valitse ensimmäinen mittauspiste
      const firstInstance = data2[0].instance;
      updateTableByInstance(firstInstance); // Päivitä taulukko ja kuva
      highlightSelectedPoint(chart2, 0);    // Korosta ensimmäinen piste
    }

      tryUpdateScrollbarMax();
    })
    .catch(error => {
      console.error('There has been a problem with your fetch operation for u_cov:', error);
    });

    fetch(`/first_app/api/u_skew/${stationname}/`)
    .then(response => response.json())
    .then(data => {
      // const chart3 = new Chart(ctx3, {
      data3 = data;
      chart3 = new Chart(ctx3, { 
        type: 'line',
        data: {
          labels: limitData(data.map(item => item.seriesdate), offsetSDepth, limit),
          datasets: [{
            label: 'Epäsymmetria',
            data: limitData(data.map(item => item.u_skew), offsetSDepth, limit),
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 1,
            tension: 0.1,
            pointBackgroundColor: Array(limit).fill('rgba(0, 0, 0, 0.1)')
          }]
        },
        options: {
          scales: {
            x: {
              // ticks: { color: '#f8f9fa' },
                ticks: {
                  color: '#f8f9fa',
                  callback: function(value) {
                    const raw = this.getLabelForValue(value);
                    // Odotetaan muotoa '20210603'
                    const year = raw.slice(0, 4);
                    const month = raw.slice(4, 6);
                    const day = raw.slice(6, 8);
                    return `${day}.${month}.${year}`;  // → dd.mm.yyyy
                  }
                },
              grid: { color: '#6c757d' }
            },
            y: {
              min: -2,        // Ala-arvo y-akselille
              max: 1,        // Yläarvo (voit säätää esim. 4, jos tiedät datan raja-arvot)
              ticks: { color: '#f8f9fa' },
              grid: { color: '#6c757d' }
            }
          },
          plugins: {
            annotation: {
              annotations: {
                GOOD_MIN,
                GOOD_MAX,
                WARN_1,
                WARN_2,
                BAD_LO,
                BAD_HI
              }
            }
          }
        }
      });

      handleDrag(chart3, data, offsetUSkew, limit, 'u_skew');

      document.getElementById('chart3').onclick = function(evt) {
        const activePoints = chart3.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (activePoints.length > 0) {
          const clickedIndex = activePoints[0].index + offsetSDepth;
          const instanceValue = data[clickedIndex].instance;
          selectedInstance = instanceValue; // <-- TÄRKEÄÄ
          updateTableByInstance(instanceValue);
          highlightSelectedPoint(chart3, activePoints[0].index);
        }
      };

      if (data3 && data3.length > 0) {
      // Valitse ensimmäinen mittauspiste
      const firstInstance = data3[0].instance;
      updateTableByInstance(firstInstance); // Päivitä taulukko ja kuva
      highlightSelectedPoint(chart3, 0);    // Korosta ensimmäinen piste
    }

      tryUpdateScrollbarMax();
    })
    .catch(error => {
      console.error('There has been a problem with your fetch operation for u_skew:', error);
    });

  // Function to load image from Orthanc server based on instance value
  function loadOrthancImage(instanceValue) {
    fetch(`/first_app/get_orthanc_image/instance/${instanceValue}/`)
      .then(response => response.json())
      .then(data => {
        console.log("AJAX-vastaus:", data);
        if (data.image) {
          document.getElementById('orthanc-image').src = 'data:image/jpeg;base64,' + data.image;
        // TÄRKEÄÄ: päivitä profiilit ja piirrä ne
        if (data.horiz_prof && data.vert_prof) {
          window.horizProfile = data.horiz_prof;
          window.vertProfile = data.vert_prof;
          console.log("Piirretään profiilit:", window.horizProfile, window.vertProfile);
          // drawProfiles(window.horizProfile, window.vertProfile);
          window.uLow = data.u_low; // oletetaan että tämä on lista indeksejä
          window.sDepth = data.s_depth; // oletetaan että tämä on lista indeksejä
          window.uCov = data.u_cov; // oletetaan että tämä on lista indeksejä
          window.uSkew = data.u_skew; // oletetaan että tämä on lista indeksejä
          drawProfiles(window.horizProfile, window.vertProfile, window.uLow, window.sDepth, window.uCov, window.uSkew);
        }
        } else {
          console.error('Error loading image:', data.error);
        }
      })
      .catch(error => {
        console.error('There has been a problem with your fetch operation for Orthanc image:', error);
      });
  }

  

    // AI-kysymyslomakkeen käsittely
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const question = document.getElementById('question').value.trim();
      const answerBox = document.getElementById('answer-box');

      if (!question) {
        answerBox.textContent = "Kirjoita ensin kysymys.";
        return;
      }

      answerBox.textContent = "Haetaan vastausta...";

      try {
        const response = await fetch("/first_app/ask-ai/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCSRFToken()
          },
          body: JSON.stringify({ question: question })
        });

        const data = await response.json();
        // answerBox.textContent = data.answer || "Ei saatu vastausta.";
        typeText(answerBox, data.answer || "Ei saatu vastausta.", 20);  // 20 ms merkkiä kohden
      } catch (err) {
        answerBox.textContent = "Tapahtui virhe: " + err.message;
      }
    });
  }

  // CSRF-tokenin hakeminen cookieista
  function getCSRFToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith(name + '=')) {
        return decodeURIComponent(cookie.substring(name.length + 1));
      }
    }
    return '';
  }

  function typeText(element, text, speed) {
  element.textContent = '';  // Tyhjennä kenttä aluksi
  let i = 0;

  function type() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }

  type();
}


function drawProfiles(horizProfile, vertProfile, uLow = [], sDepth = null, uCov = null, uSkew = null) {
  const ctxHoriz = document.getElementById('horizontal-profile').getContext('2d');
  if (window.horizChart) window.horizChart.destroy();

  // 1. Laske mediaani
  const sorted = [...horizProfile].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  // 2. Segmenttirajat
  const N = horizProfile.length;
  const seg1 = Math.round(N * 0.1);
  const seg2 = seg1 + Math.round(N * 0.2);
  const seg3 = seg2 + Math.round(N * 0.4);
  const seg4 = seg3 + Math.round(N * 0.2);
  const segmentBorders = [0, seg1, seg2, seg3, seg4, N];

  // 3. Etsi pienimmät arvot segmenteittäin
  const minPoints = [];
  for (let s = 0; s < 5; s++) {
    const start = segmentBorders[s];
    const end = segmentBorders[s + 1];
    let minVal = Infinity;
    let minIdx = -1;
    for (let i = start; i < end; i++) {
      if (horizProfile[i] < minVal) {
        minVal = horizProfile[i];
        minIdx = i;
      }
    }
    minPoints.push({ x: minIdx, y: minVal });
  }

  // 4. Profiiliviiva
  const profileDataset = {
    label: 'Horisontaalinen profiili',
    data: horizProfile,
    borderColor: '#66ccff',
    borderWidth: 1,
    fill: false,
    pointRadius: 0,
    showLine: true
  };

  // 5. Mediaaniviiva
  const medianDataset = {
    label: 'Mediaani',
    data: Array(N).fill(median),
    borderColor: 'orange',
    borderWidth: 1,
    borderDash: [5, 5],
    fill: false,
    pointRadius: 0,
    showLine: false
  };

  // 6. Scatter-pisteet minimiarvoille
  const minPointsDataset = {
    label: 'U_low',
    data: minPoints,
    borderColor: 'red',
    backgroundColor: 'red',
    pointRadius: 3,
    pointStyle: 'circle',
    type: 'scatter',
    showLine: false
  };

  // 7. Segmenttirajat (pystysuorat viivat)
  const annotation = {
    annotations: {}
  };
  for (let i = 1; i < segmentBorders.length - 1; i++) {
    annotation.annotations['border' + i] = {
      type: 'line',
      xMin: segmentBorders[i],
      xMax: segmentBorders[i],
      borderColor: 'gray',
      borderWidth: 2,
      borderDash: [4, 4]
    };
  }

  window.horizChart = new Chart(ctxHoriz, {
    type: 'line',
    data: {
      labels: horizProfile.map((_, i) => i),
      datasets: [profileDataset, medianDataset, minPointsDataset]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        annotation: annotation
      },
      scales: { x: { display: false }, y: { display: false } }
    }
  });

    // Vertikaalinen profiili

  const ctxVert = document.getElementById('vertical-profile').getContext('2d');
  if (window.vertChart) window.vertChart.destroy();

  // Luo annotation-objekti s_depth-viivalle, jos arvo annettu
  const vertAnnotation = {
    annotations: {}
  };
  if (sDepth !== null && !isNaN(sDepth)) {
    vertAnnotation.annotations['s_depth_line'] = {
      type: 'line',
      yMin: sDepth,
      yMax: sDepth,
      borderColor: 'orange',
      borderWidth: 2,
      borderDash: [6, 6],
      label: {
        display: true,
        content: 'S Depth',
        position: 'start',
        color: 'orange'
      }
    };
  }

  window.vertChart = new Chart(ctxVert, {
    type: 'line',
    data: {
      labels: vertProfile.map((_, i) => i),
      datasets: [{
        // label: 'Vertikaalinen profiili', // voit poistaa labelin jos et halua legendaa
        data: vertProfile,
        borderColor: '#66ccff',
        borderWidth: 1,
        fill: false,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        annotation: vertAnnotation
      },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}



let isDicomOpen = false;

document.addEventListener('keydown', function (e) {
  //  ⌃Ctrl + I (pienellä, isolla, layoutista riippumatta)
  if (e.ctrlKey && !e.shiftKey && e.code === 'KeyI') {
    // Älä tee jos kohdistin on input/textarea
    const t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;

    e.preventDefault();
    const inst = document.getElementById('instance-value')?.textContent.trim();
    if (inst) {
      openDicomModal(inst);
    } else {
      console.warn('instance-value puuttuu');
    }
  }

  // ESC sulkee
  if (e.key === 'Escape' && isDicomOpen) {
    e.preventDefault();
    closeDicomModal();
  }
});


function openDicomModal(instanceId) {
  // fetch(`/first_app/api/dicom_info/${instanceId}/`)
  fetch(`/first_app/api/dicom_info/${instanceId}/`)      // <= etuliite + alaviiva
  // fetch(`/api/dicom_info/${instanceId}/`)
    // .then(response => response.json())
    .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  })
    .then(data => {
      if (data.status === 'success') {
        const tbody = document.querySelector('#dicom-table tbody');
        tbody.innerHTML = ''; // Tyhjennä vanhat rivit

        for (const [key, value] of Object.entries(data.data)) {
          const row = document.createElement('tr');
          row.innerHTML = `<td>${key}</td><td>${value}</td>`;
          tbody.appendChild(row);
        }

        document.getElementById('dicom-modal').style.display = 'block';
        isDicomOpen = true;
      } else {
        alert("Virhe DICOM-tietojen haussa: " + data.message);
      }
    })
    .catch(err => {
      alert("Verkkovirhe DICOM-tietojen haussa: " + err);
    });
}

function closeDicomModal() {
  document.getElementById('dicom-modal').style.display = 'none';
  isDicomOpen = false;
}


document
  .getElementById("mini-chat-form")
  .addEventListener("submit", async function (e) {
    e.preventDefault();
    const message = document
      .getElementById("mini-chat-input")
      .value
      .trim();
    if (!message) return;

    try {
      const res = await fetch("/first_app/api/report-issue/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message })
      });
      const data = await res.json();

      if (data.status === "ok") {
        alert("Viesti lähetetty Slackiin!");
        document.getElementById("mini-chat-input").value = "";
      } else {
        throw new Error(data.detail || "Tuntematon virhe");
      }
    } catch (err) {
      console.error("Lähetysvirhe:", err);
      alert("Virhe lähetyksessä.");
    }
  });
  
const scrollbar = document.getElementById('scrollbar');


function updateScrollbarMax() {
  if (data1 && data2 && data3) {
    const maxOffset = Math.min(data1.length, data2.length, data3.length) - limit;
    scrollbar.max = maxOffset >= 0 ? maxOffset : 0;
  }
}

function updateAllHighlights() {
  // chart1
  let idx1 = -1;
  if (selectedInstance && data1) {
    for (let i = offsetSDepth; i < offsetSDepth + limit && i < data1.length; i++) {
      if (data1[i].instance === selectedInstance) {
        idx1 = i - offsetSDepth;
        break;
      }
    }
  }
  highlightSelectedPoint(chart1, idx1);

  // chart2
  let idx2 = -1;
  if (selectedInstance && data2) {
    for (let i = offsetSDepth; i < offsetSDepth + limit && i < data2.length; i++) {
      if (data2[i].instance === selectedInstance) {
        idx2 = i - offsetSDepth;
        break;
      }
    }
  }
  highlightSelectedPoint(chart2, idx2);

  // chart3
  let idx3 = -1;
  if (selectedInstance && data3) {
    for (let i = offsetSDepth; i < offsetSDepth + limit && i < data3.length; i++) {
      if (data3[i].instance === selectedInstance) {
        idx3 = i - offsetSDepth;
        break;
      }
    }
  }
  highlightSelectedPoint(chart3, idx3);
}

// Kun käyttäjä säätää skrollauspalkkia, päivitä kaikkien kuvaajien offset
// scrollbar.addEventListener('input', () => {
//   offsetSDepth = parseInt(scrollbar.value);
//   updateChart(chart1, data1, offsetSDepth, limit, 's_depth');
//   updateChart(chart2, data2, offsetSDepth, limit, 'u_cov');
//   updateChart(chart3, data3, offsetSDepth, limit, 'u_skew');
// });

// scrollbar.addEventListener('input', () => {
//   offsetSDepth = parseInt(scrollbar.value);
//   updateChart(chart1, data1, offsetSDepth, limit, 's_depth');
//   updateChart(chart2, data2, offsetSDepth, limit, 'u_cov');
//   updateChart(chart3, data3, offsetSDepth, limit, 'u_skew');

//   // Nollaa valinnat kaikista kuvaajista
//   highlightSelectedPoint(chart1, -1);
//   highlightSelectedPoint(chart2, -1);
//   highlightSelectedPoint(chart3, -1);
// });

scrollbar.addEventListener('input', () => {
  offsetSDepth = parseInt(scrollbar.value);
  updateChart(chart1, data1, offsetSDepth, limit, 's_depth');
  updateChart(chart2, data2, offsetSDepth, limit, 'u_cov');
  updateChart(chart3, data3, offsetSDepth, limit, 'u_skew');
  updateAllHighlights();
});



});
