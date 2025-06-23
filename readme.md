# 🌌 DICOM Image Analysis with gRPC 🏥

![Python](https://img.shields.io/badge/python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![gRPC](https://img.shields.io/badge/gRPC-4285F4?style=for-the-badge&logo=grpc&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgres-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)
![Prometheus](https://img.shields.io/badge/prometheus-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/grafana-F46800?style=for-the-badge&logo=grafana&logoColor=white)



This project consists of **gRPC-based microservices** that analyze **DICOM images**. The architecture is composed of three main services:

- 🏷 **fetch_service** – Retrieves DICOM images from the **Orthanc server**.
- 🛠 **analyze_service** – Processes images and stores results in the database.
- 🐄 **PostgreSQL** – Stores the analysis results.

---

## 📌 Technologies Used
- ✅ **Orthanc** – DICOM server  
- ✅ **gRPC** – Efficient and fast communication between microservices  
- ✅ **Docker & Docker Hub** – Container management and deployment  
- ✅ **PostgreSQL** – Database for storing analysis results  
- ✅ **Python & pydicom** – DICOM image processing
- ✅ **Kubernetes** – Minikube
- :x: **Prometheus** – In progress
- :x: **Grafana** – In progress

---

## 🔥 Architecture
```
[Orthanc]  →  [fetch_service]  →  [analyze_service]  →  [PostgreSQL]
```
- **fetch_service** retrieves images from **Orthanc**.
- **analyze_service** processes the images and stores the results in the database.
- **PostgreSQL** stores the analysis data.

---

## 🚀 Installation & Deployment

### 1⃣ Pull Docker Containers from Docker Hub
Log in to each CSC server and pull the necessary containers:

```sh
docker pull skullervo/orthanc:master1
docker pull skullervo/fetch_service:worker1v2
docker pull skullervo/analyze_service:worker2v2
docker pull skullervo/postgres:master1
```

### 2⃣ Start the Services

#### Start `fetch_service`:
```sh
docker run -d --name fetch_service -p 50051:50051 skullervo/fetch_service:worker1v2
```

#### Start `analyze_service`:
```sh
sudo docker run -d --name analyze_service -p 50052:50052 \
    -e FETCH_SERVICE_URL="worker-node1-ip:50051" \
    -e POSTGRES_HOST="master-node-ip" \
    -e POSTGRES_USER="<your_username>" \
    -e POSTGRES_PASSWORD="<your_psw>" \
    -e POSTGRES_DB="QA-results" \
    skullervo/analyze_service:latest
```

#### Start `PostgreSQL`:
```sh
sudo docker run -d --name postgres -p 5432:5432 \
    -e POSTGRES_USER=<your_username> \
    -e POSTGRES_PASSWORD=<your_psw> \
    -e POSTGRES_DB=QA-results \
    skullervo/postgres:latest
```

#### Start `Prometheus`:
```sh
sudo docker run -d --name=prometheus -p 9090:9090 prom/prometheus
```

#### `Prometheus` yaml configuration:
```sh
global:
  scrape_interval: 15s  # Kuinka usein dataa kerätään

scrape_configs:
  - job_name: 'master-node'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'worker-node1'
    static_configs:
      - targets: ['192.168.1.234:9090']  # Korvaa oikealla IP-osoitteella

  - job_name: 'worker-node2'
    static_configs:
      - targets: ['192.168.1.245:9090']  # Korvaa oikealla IP-osoitteella

  - job_name: 'analyze_service'
    static_configs:
      - targets: ['192.168.1.245:50053']  # Worker-node2:n IP ja oikea portti

  - job_name: 'fetch_service'
    static_configs:
      - targets: ['192.168.1.234:50054']  # Korvaa oikealla Worker-node1:n IP:llä
```

#### Start `Grafana`:
```sh
sudo docker run -d --name=grafana -p 3000:3000 grafana/grafana
```

---

## ✅ Microservices Overview

| **Service**         | **Port**  | **Function** |
|--------------------|---------|------------|
| **Orthanc**    | `8082`  | Stores DICOM images |
| **fetch_service**  | `50051` | Retrieves DICOM images from Orthanc |
| **analyze_service** | `50052` | Analyzes images and stores results in the database |
| **PostgreSQL**    | `5432`  | Stores analysis results |

---

## 🔍 Testing

### 1⃣ Test Fetch Service
```sh
grpcurl -plaintext worker-node1-ip:50051 list
```

### 2⃣ Test Analyze Service 
```sh
grpcurl -plaintext worker-node2-ip:50052 list
```

### 3⃣ Test PostgreSQL Connection 
```sh
psql -h master-node-ip -U postgres -d QA-results -c "\dt"
```

### 4⃣ Test the Entire System
Run the test script:
```sh
python test_analyze_service.py
```

✅ **If the analysis runs successfully, the entire system is working!** 🎉

---

## 🛠 Development Tools
- 🐍 **Python** (`pydicom`, `grpcio`, `grpcio-tools`, `gRPC`)
- 🐳 **Docker**
- 🐄 **PostgreSQL**
- 🏥 **Orthanc (DICOM server)**

---

## 📜 Future Enhancements
- 🔄 **Asynchronous communication for the analysis service** (Kafka maybe?)
- 🔍 **Logging and monitoring** (Prometheus & Grafana) 
- 📊 **Error handling improvements** (Grafana) 
- :trollface: **Kubernetes**

--- 
  


