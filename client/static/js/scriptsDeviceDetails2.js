document.addEventListener('DOMContentLoaded', function() {
  let offsetSDepth = 0;
  let offsetUCov = 0;
  let offsetUSkew = 0;
  const limit = 10;
  let isDragging = false;
  let startX = 0;
  let scrollSpeed = 0.2; // Skrollauksen herkkyys (säädä tätä)


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
  function handleDrag(chart, data, offset, limit, fieldName) {
    chart.canvas.addEventListener('mousedown', function(evt) {
      isDragging = true;
      startX = evt.clientX;
      chart.canvas.style.cursor = 'grabbing';  // Muuta kursori vedon ajaksi
    });

    chart.canvas.addEventListener('mousemove', function(evt) {
      if (isDragging) {
        const deltaX = evt.clientX - startX;
        startX = evt.clientX;

        // Päivitä offset-arvo suhteessa hiiren liikkeeseen dynaamisemmin
        const dataShift = Math.round(deltaX * scrollSpeed);

        if (dataShift < 0) {
          offset = Math.min(offset + Math.abs(dataShift), data.length - limit);
        } else if (dataShift > 0) {
          offset = Math.max(offset - dataShift, 0);
        }

        updateChart(chart, data, offset, limit, fieldName);
      }
    });

    chart.canvas.addEventListener('mouseup', function() {
      isDragging = false;
      chart.canvas.style.cursor = 'default';  // Palauta kursori normaaliksi
    });

    chart.canvas.addEventListener('mouseleave', function() {
      isDragging = false;
      chart.canvas.style.cursor = 'default';  // Palauta kursori, jos hiiri poistuu kuvaajasta
    });
  }

  // Funktio käsittelee pisteen valinnan ja vaihtaa sen värin
  function highlightSelectedPoint(chart, index) {
    const dataset = chart.data.datasets[0];
    const pointColors = dataset.pointBackgroundColor;
    if (!Array.isArray(pointColors)) {
      dataset.pointBackgroundColor = Array(dataset.data.length).fill('rgba(0, 0, 0, 0.1)');
    }

    // Nollataan kaikki värit
    dataset.pointBackgroundColor = dataset.pointBackgroundColor.map(() => 'rgba(0, 0, 0, 0.1)');

    // Vaihdetaan valitun pisteen väri
    dataset.pointBackgroundColor[index] = 'rgba(255, 0, 0, 1)'; // Punainen valitulle pisteelle
    chart.update();
  }

  // Ota stationname suoraan HTML:stä
  const stationname = document.getElementById('device-name').innerText;

  // Fetch chart data and initialize charts for s_depth
  fetch(`/first_app/api/s_depth/${stationname}/`)
    .then(response => response.json())
    .then(data => {
      const ctx1 = document.getElementById('chart1').getContext('2d');
      
      const chart1 = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: limitData(data.map(item => item.seriesdate), offsetSDepth, limit),
          datasets: [{
            label: 'Herkkyys (S Depth)',
            data: limitData(data.map(item => item.s_depth), offsetSDepth, limit),
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 1,
            tension: 0.1,
            pointBackgroundColor: Array(limit).fill('rgba(0, 0, 0, 0.1)') // Oletusväri
          }]
        },
        options: {
          scales: {
            x: {
              ticks: {
                color: '#f8f9fa' // Vaalea väri X-akselin teksteille
              },
              grid: {
                color: '#6c757d' // Grid-linjat vaaleaksi
              }
            },
            y: {
              ticks: {
                color: '#f8f9fa' // Vaalea väri Y-akselin teksteille
              },
              grid: {
                color: '#6c757d' // Grid-linjat vaaleaksi
              }
            }
          },
          plugins: {
            legend: {
              labels: {
                color: '#f8f9fa' // Vaalea väri legendalle
              }
            }
          }
        }
      });

      // Lisää vedon käsittely s_depthille
      handleDrag(chart1, data, offsetSDepth, limit, 's_depth');

      document.getElementById('chart1').onclick = function(evt) {
          const activePoints = chart1.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
          if (activePoints.length > 0) {
            const clickedIndex = activePoints[0].index + offsetSDepth;
            const instanceValue = data[clickedIndex].instance;
            updateTableByInstance(instanceValue);
            highlightSelectedPoint(chart1, activePoints[0].index);
          }
        };
    })
    .catch(error => {
      console.error('There has been a problem with your fetch operation for s_depth:', error);
    });

  // Sama logiikka u_coville
  fetch(`/first_app/api/u_cov/${stationname}/`)
    .then(response => response.json())
    .then(data => {
      const ctx2 = document.getElementById('chart2').getContext('2d');
      const chart2 = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: limitData(data.map(item => item.seriesdate), offsetUCov, limit),
          datasets: [{
            label: 'Tasaisuus (U Cov)',
            data: limitData(data.map(item => item.u_cov), offsetUCov, limit),
            fill: false,
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 1,
            tension: 0.1,
            pointBackgroundColor: Array(limit).fill('rgba(0, 0, 0, 0.1)') // Oletusväri
          }]
        },
        options: {
          scales: {
            x: {
              ticks: {
                color: '#f8f9fa' // Vaalea väri X-akselin teksteille
              },
              grid: {
                color: '#6c757d' // Grid-linjat vaaleaksi
              }
            },
            y: {
              ticks: {
                color: '#f8f9fa' // Vaalea väri Y-akselin teksteille
              },
              grid: {
                color: '#6c757d' // Grid-linjat vaaleaksi
              }
            }
          },
          plugins: {
            legend: {
              labels: {
                color: '#f8f9fa' // Vaalea väri legendalle
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
          updateTableByInstance(instanceValue);
          highlightSelectedPoint(chart2, activePoints[0].index);
        }
      };
    })
    .catch(error => {
      console.error('There has been a problem with your fetch operation for u_cov:', error);
    });

  // Sama logiikka u_skewille
  fetch(`/first_app/api/u_skew/${stationname}/`)
    .then(response => response.json())
    .then(data => {
      const ctx3 = document.getElementById('chart3').getContext('2d');
      const chart3 = new Chart(ctx3, {
        type: 'line',
        data: {
          labels: limitData(data.map(item => item.seriesdate), offsetUSkew, limit),
          datasets: [{
            label: 'Epäsymmetria (U Skew)',
            data: limitData(data.map(item => item.u_skew), offsetUSkew, limit),
            fill: false,
            borderColor: 'rgb(255, 255, 50)',
            borderWidth: 1,
            tension: 0.1,
            pointBackgroundColor: Array(limit).fill('rgba(0, 0, 0, 0.1)') // Oletusväri
          }]
        },
        options: {
          scales: {
            x: {
              ticks: {
                color: '#ffffff' // Vaalea väri X-akselin teksteille
              },
              grid: {
                color: '#ffffff' // Grid-linjat vaaleaksi
              }
            },
            y: {
              ticks: {
                color: '#f8f9fa' // Vaalea väri Y-akselin teksteille
              },
              grid: {
                color: '#6c757d' // Grid-linjat vaaleaksi
              }
            }
          },
          plugins: {
            legend: {
              labels: {
                color: '#f8f9fa' // Vaalea väri legendalle
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
          updateTableByInstance(instanceValue);
          highlightSelectedPoint(chart3, activePoints[0].index);
        }
      };
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
    showLine: true
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


document.addEventListener("DOMContentLoaded", function () {
  const instanceValue = document.getElementById('instance-value').textContent.trim();
  if (instanceValue) {
    loadOrthancImage(instanceValue);
  } else {
    console.error("Instance value not found.");
  }
});


});
