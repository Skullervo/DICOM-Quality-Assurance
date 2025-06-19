# 🌌 CSC Microservices: DICOM Image Analysis with gRPC 🏥

This project consists of **gRPC-based microservices** that analyze **DICOM images** on a CSC virtual server. The architecture is composed of three main services:

- 🏷 **fetch_service (Worker-Node1)** – Retrieves DICOM images from the **Orthanc server**.
- 🛠 **analyze_service (Worker-Node2)** – Processes images and stores results in the database.
- 🐄 **PostgreSQL (Master-Node)** – Stores the analysis results.

---

## 📌 Technologies Used
- ✅ **gRPC** – Efficient and fast communication between microservices  
- ✅ **Docker & Docker Hub** – Container management and deployment to CSC  
- ✅ **PostgreSQL** – Database for storing analysis results  
- ✅ **Python & pydicom** – DICOM image processing  

---

## 🔥 Architecture
```
[fetch_service]  →  [analyze_service]  →  [PostgreSQL]
(Worker-Node1)       (Worker-Node2)       (Master-Node)
```
- **fetch_service** retrieves images from **Orthanc**.
- **analyze_service** processes the images and stores the results in the database.
- **PostgreSQL** stores the analysis data.

---

## 🚀 Installation & Deployment

### 1⃣ Pull Docker Containers from Docker Hub
Log in to each CSC server and pull the necessary containers:

```sh
docker pull skullervo/fetch_service:latest
docker pull skullervo/analyze_service:latest
docker pull skullervo/postgres:latest
```

### 2⃣ Start the Services

#### Start `fetch_service` on Worker-Node1:
```sh
docker run -d --name fetch_service -p 50051:50051 skullervo/fetch_service:latest
```

#### Start `analyze_service` on Worker-Node2:
```sh
docker run -d --name analyze_service -p 50052:50052 \
    -e FETCH_SERVICE_URL="worker-node1-ip:50051" \
    -e POSTGRES_HOST="master-node-ip" \
    -e POSTGRES_USER="postgres" \
    -e POSTGRES_PASSWORD="***REDACTED***" \
    -e POSTGRES_DB="QA-results" \
    skullervo/analyze_service:latest
```

#### Start `PostgreSQL` on Master-Node:
```sh
docker run -d --name postgres -p 5432:5432 \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=***REDACTED*** \
    -e POSTGRES_DB=QA-results \
    skullervo/postgres:latest
```

---

## ✅ Microservices Overview

| **Service**         | **Node**        | **Port**  | **Function** |
|--------------------|---------------|---------|------------|
| **fetch_service**  | Worker-Node1  | `50051` | Retrieves DICOM images from Orthanc |
| **analyze_service** | Worker-Node2  | `50052` | Analyzes images and stores results in the database |
| **PostgreSQL**    | Master-Node   | `5432`  | Stores analysis results |

---

## 🔍 Testing

### 1⃣ Test Fetch Service (`worker-node1`)
```sh
grpcurl -plaintext worker-node1-ip:50051 list
```

### 2⃣ Test Analyze Service (`worker-node2`)
```sh
grpcurl -plaintext worker-node2-ip:50052 list
```

### 3⃣ Test PostgreSQL Connection (`master-node`)
```sh
psql -h master-node-ip -U postgres -d QA-results -c "\dt"
```

### 4⃣ Test the Entire System
Run the test script:
```sh
python test_analyze_service.py
```

✅ **If the analysis runs successfully, the entire system is working in CSC!** 🎉

---

## 🛠 Development Tools
- 🐍 **Python** (`pydicom`, `grpcio`, `grpcio-tools`)
- 🐳 **Docker**
- 🐄 **PostgreSQL**
- 🏥 **Orthanc (DICOM server)**

---

## 📜 Future Enhancements
- 🔄 **Asynchronous communication for the analysis service** (Kafka no longer needed due to gRPC)
- 🔍 **Logging and error handling improvements**
- 📊 **Grafana monitoring for microservices**

---

## 🤝 Contact & Contributions
👤 **Skullervo**  
  


