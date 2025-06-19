document.addEventListener('DOMContentLoaded', function() {
  let offsetSDepth = 0;
  let offsetUCov = 0;
  let offsetUSkew = 0;
  const limit = 10;
  let isDragging = false;
  let startX = 0;
  let scrollSpeed = 0.2; // Skrollauksen herkkyys (säädä tätä)

  // Funktio päivittää taulukon
  function updateTable(data, index) {
    const sDepthValue = data[index].s_depth;
    const uCovValue = data[index].u_cov;
    const uSkewValue = data[index].u_skew;
    const instanceValue = data[index].instance;

    document.getElementById('s-depth-value').innerText = sDepthValue;
    document.getElementById('u-cov-value').innerText = uCovValue;
    document.getElementById('u-skew-value').innerText = uSkewValue;
    document.getElementById('instance-value').innerText = instanceValue;

    loadOrthancImage(instanceValue);  // Lataa vastaava kuva
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
            label: 'S Depth Values',
            data: limitData(data.map(item => item.s_depth), offsetSDepth, limit),
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
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

      // Add click event listener to chart1
      document.getElementById('chart1').onclick = function(evt) {
        const activePoints = chart1.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (activePoints.length > 0) {
          const clickedIndex = activePoints[0].index + offsetSDepth;
          updateTable(data, clickedIndex);
          highlightSelectedPoint(chart1, activePoints[0].index); // Korostetaan valittu piste
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
            label: 'U Cov Values',
            data: limitData(data.map(item => item.u_cov), offsetUCov, limit),
            fill: false,
            borderColor: 'rgb(255, 99, 132)',
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
          const clickedIndex = activePoints[0].index + offsetUCov;
          updateTable(data, clickedIndex);
          highlightSelectedPoint(chart2, activePoints[0].index); // Korostetaan valittu piste
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
            label: 'U Skew Values',
            data: limitData(data.map(item => item.u_skew), offsetUSkew, limit),
            fill: false,
            borderColor: 'rgb(255, 255, 50)',
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
          const clickedIndex = activePoints[0].index + offsetUSkew;
          updateTable(data, clickedIndex);
          highlightSelectedPoint(chart3, activePoints[0].index); // Korostetaan valittu piste
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
        if (data.image) {
          document.getElementById('orthanc-image').src = 'data:image/jpeg;base64,' + data.image;
        } else {
          console.error('Error loading image:', data.error);
        }
      })
      .catch(error => {
        console.error('There has been a problem with your fetch operation for Orthanc image:', error);
      });
  }
});
