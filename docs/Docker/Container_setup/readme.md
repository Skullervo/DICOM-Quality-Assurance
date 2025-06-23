## 🐳 General Docker Container Creation Process

### 1. Create Dockerfiles

Define the container setup in a `Dockerfile`, including:
- 🧱 Base image to build upon
- 📦 Required dependencies and libraries
- 📁 Files to copy into the container
- ▶️ Command to run when the container starts

---

## 📦 Docker Images in the `distributedQA` Project (LV Automation)

### 🔍 ANALYZE MICROSERVICE

**Dockerfile: `Dockerfile.analyze`**
```Dockerfile
FROM python:3.12-slim
WORKDIR /app

# Install dependencies (e.g., for OpenCV)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    protobuf-compiler

# Install Python dependencies
COPY ../requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code and required files
COPY analyze_service.py analyze_service.proto test_analyze_service.py fetch_service.proto US_IQ_analysis3.py LUT_table_codes.py LUT_taulukko_lisaa.py probe-LUT.xls .

# Generate gRPC code
RUN python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. analyze_service.proto fetch_service.proto

# Expose gRPC port (check if is it free)
EXPOSE 50052

# Start service
CMD ["python", "analyze_service.py"]
```

**Generate the Docker image:**
```PowerShell
docker build -f Dockerfile.analyze -t analyze-service:distributedQA .
```

**Check if image is generated:**
```PowerShell
docker images
```

**Run the container:**
```PowerShell
docker run -d `
  --name analyze-service-container `
  -p 50052:50052 `
  -e ORTHANC_URL=http://host.docker.internal:8042 `
  -e DATABASE_HOST=host.docker.internal `
  -e DATABASE_PORT=55432 `
  -e DATABASE_NAME=QA-results `
  -e DATABASE_USER=postgres `
  -e DATABASE_PASSWORD=pohde24 `
  -e FETCH_SERVICE_HOST=host.docker.internal:50051 `
  analyze-service:distributedQA
```

---

### 📥 FETCH MICROSERVICE

**Dockerfile: `Dockerfile.fetch`**
```PowerShell
FROM python:3.12-slim
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y protobuf-compiler

# Install Python dependencies
COPY ../requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code and proto file
COPY fetch_service.py fetch_service.proto .

# Generate gRPC code
RUN python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. fetch_service.proto

# 🔹 Optional but recommended: expose the gRPC port
EXPOSE 50051

# Start the service
CMD ["python", "fetch_service.py"]

```

**Generate the Docker image:**
```PowerShell
docker build -f Dockerfile.fetch -t fetch-service:distributedQA .
```

**Check if image is generated:**
```PowerShell
docker images
```

**Run the container:**
```PowerShell
docker run -d `
  --name fetch-service-container `
  -p 50051:50051 `
  -e ORTHANC_URL=http://host.docker.internal:8042 `
  fetch-service:distributedQA .
```

---

### 🗄️ POSTGRES MICROSERVICE

**Run PostgreSQL directly from Docker Hub:**
```PowerShell
docker run -d `
     --name postgres-db-distributedQA `
     -e POSTGRES_USER=postgres `
     -e POSTGRES_PASSWORD=pohde24 `
     -e POSTGRES_DB=QA-results `
     -p 55432:5432 `
     postgres:16
```

---

## 🛠️ 2. Interact With a Running Container

**Access a container shell:**
```PowerShell
docker exec -it <container_name_or_ID> bash
```

**Mount local code (for development):**
```PowerShell
docker run -it -v "$(pwd):/app" my-app
```

---

## 💾 3. Save or Share an Image (Optional)

**Export to `.tar`:**
```PowerShell
docker save my-app > my-app.tar
```

**Push to Docker Hub:**
```PowerShell
docker login
docker tag my-app username/my-app:latest
docker push username/my-app:latest
```

---
