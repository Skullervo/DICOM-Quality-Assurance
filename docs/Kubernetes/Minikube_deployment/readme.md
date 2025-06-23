# 🐳 Kubernetes Deployment Instructions for Docker Hub Images

This guide explains how to create Kubernetes Pods for project using images hosted on Docker Hub. The structure assumes you have pushed your images to Docker Hub and Minikube is running.

---

## 1. ✅ Create a Deployment YAML files

Create a .yaml file for each microservice. Here's the general format:

### 🧩 `fetch-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fetch-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: fetch-service
  template:
    metadata:
      labels:
        app: fetch-service
    spec:
      containers:
        - name: fetch-service
          image: <your-dockerhub-username>/fetch-service:<tag>
          ports:
            - containerPort: 50051
          env:
            - name: ORTHANC_URL
              value: "http://orthanc-service:8042"
```

### 🧩 analyze-deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analyze-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: analyze-service
  template:
    metadata:
      labels:
        app: analyze-service
    spec:
      containers:
        - name: analyze-service
          image: <your-dockerhub-username>/analyze-service:<tag>
          ports:
            - containerPort: 50052
          env:
            - name: ORTHANC_URL
              value: "http://orthanc-service:8042"
            - name: DATABASE_HOST
              value: "postgres"
            - name: DATABASE_PORT
              value: "5432"
            - name: DATABASE_NAME
              value: "QA-results"
            - name: DATABASE_USER
              value: "postgres"
            - name: DATABASE_PASSWORD
              value: "yourpassword"
```

### 🧩 postgres-deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: "QA-results"
            - name: POSTGRES_USER
              value: "postgres"
            - name: POSTGRES_PASSWORD
              value: "yourpassword"
```


## 2. 🚀 Apply the Deployments
Run these commands to deploy your pods to Minikube:

```bash
kubectl apply -f fetch-deployment.yaml
kubectl apply -f analyze-deployment.yaml
kubectl apply -f postgres-deployment.yaml
```

## 3. 🧪 Check Pod Status
```bash
kubectl get pods
```

If all pods are STATUS: Running, everything is working!

## 4. 🛠️ Troubleshooting
Use this to inspect failing pods:

```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name>
```

## 5. Login into analyze_service pod and run test analysis

```bash
kubectl exec -it <pod_name> -- /bin/bash
```

example:

```bash
kubectl exec -it analyze-service-bf4b87849-f9wl9 -- /bin/bash
```
