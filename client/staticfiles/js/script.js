// Function to fetch and update device name
function updateDeviceName(stationname) {
    console.log("Updating device name to:", stationname); // Debug log
    document.getElementById('device-name').innerText = stationname;
  }
  
  // Fetch chart data and initialize charts
  fetch('/first_app/api/s_depth/')
    .then(response => response.json())
    .then(data => {
      var ctx1 = document.getElementById('chart1').getContext('2d');
      var chart1 = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: data.map((_, index) => `Sample ${index + 1}`),
          datasets: [{
            label: 'S Depth Values',
            data: data,
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1
          }]
        },
        options: {
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const index = elements[0].index;
              console.log("Clicked on element index:", index); // Debug log
              fetch(`/first_app/ultraääni_laadunvalvonta/OYS/uatesti_OYS/get_stationname/${index}/`)
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                  }
                  return response.json();
                })
                .then(data => {
                  console.log("Fetched data:", data); // Debug log
                  updateDeviceName(data.stationname);
                })
                .catch(error => {
                  console.error('There has been a problem with your fetch operation:', error);
                });
            }
          }
        }
      });
    });
  
  fetch('/first_app/api/u_cov/')
    .then(response => response.json())
    .then(data => {
      var ctx2 = document.getElementById('chart2').getContext('2d');
      var chart2 = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: data.map((_, index) => `Sample ${index + 1}`),
          datasets: [{
            label: 'U Cov Values',
            data: data,
            fill: false,
            borderColor: 'rgb(255, 99, 132)',
            tension: 0.1
          }]
        },
        options: {
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const index = elements[0].index;
              console.log("Clicked on element index:", index); // Debug log
              fetch(`/first_app/ultraääni_laadunvalvonta/OYS/uatesti_OYS/get_stationname/${index}/`)
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                  }
                  return response.json();
                })
                .then(data => {
                  console.log("Fetched data:", data); // Debug log
                  updateDeviceName(data.stationname);
                })
                .catch(error => {
                  console.error('There has been a problem with your fetch operation:', error);
                });
            }
          }
        }
      });
    });
  
  fetch('/first_app/api/u_skew/')
   .then(response => response.json())
   .then(data => {
      var ctx3 = document.getElementById('chart3').getContext('2d');
      var chart3 = new Chart(ctx3, {
        type: 'line',
        data: {
          labels: data.map((_, index) => `Sample ${index + 1}`),
          datasets: [{
            label: 'U skew Values',
            data: data,
            fill: false,
            borderColor: 'rgb(255, 255, 50)',
            tension: 0.1
          }]
        },
        options: {
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const index = elements[0].index;
              console.log("Clicked on element index:", index); // Debug log
              fetch(`/first_app/ultraääni_laadunvalvonta/OYS/uatesti_OYS/get_stationname/${index}/`)
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                  }
                  return response.json();
                })
                .then(data => {
                  console.log("Fetched data:", data); // Debug log
                  updateDeviceName(data.stationname);
                })
                .catch(error => {
                  console.error('There has been a problem with your fetch operation:', error);
                });
            }
          }
        }
      });
    });