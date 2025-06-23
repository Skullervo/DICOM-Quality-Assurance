# 🧪 Local Kubernetes with Minikube + Docker Desktop on Windows

This guide shows how to install and run Kubernetes locally on Windows using **Minikube** with **Docker Desktop** as the container driver.

---

## ✅ Prerequisites

- ✔️ Windows 10/11
- ✔️ Docker Desktop installed and running (WSL2 or Hyper-V backend enabled)
- ✔️ WSL2 installed and a Linux distro (e.g., Ubuntu) set up

---

## 🛠️ Step 1: Install Minikube

### Option A: Using Chocolatey (PowerShell as Admin)
```powershell
choco install minikube
```

### Option B: Manual Download (if not using Chocolatey)
- Download from: https://github.com/kubernetes/minikube/releases
- Add to `PATH`

---

## 🚀 Step 2: Start Minikube with Docker as the driver

```bash
minikube start --driver=docker --kubernetes-version=v1.30.1
```

> ✅ This uses Docker Desktop as the backend – no need for VirtualBox or Hyper-V.

---

## 📋 Step 3: Verify the Cluster

```bash
kubectl get nodes
```

You should see your Minikube node in the `Ready` state.

---

## 📦 Step 4: Deploy a Sample App (Optional Test)

```bash
kubectl create deployment hello-minikube --image=kicbase/echo-server:1.0
kubectl expose deployment hello-minikube --type=NodePort --port=8080
minikube service hello-minikube
```

This will open your browser to the running service.

---

## 🔧 Common Minikube Commands

```bash
minikube status            # Check cluster status
minikube dashboard         # Launch K8s dashboard
minikube stop              # Stop the cluster
minikube delete            # Delete the cluster
```

---

## 🧼 Optional: Enable Add-ons

```bash
minikube addons enable ingress
minikube addons enable metrics-server
```

---

## ✅ Summary

| Task                       | Command |
|----------------------------|---------|
| Install Minikube           | `choco install minikube` |
| Start with Docker driver   | `minikube start --driver=docker` |
| Check nodes                | `kubectl get nodes` |
| Stop cluster               | `minikube stop` |
| Delete cluster             | `minikube delete` |
| Open dashboard             | `minikube dashboard` |

---

> 📌 Tip: Always make sure Docker Desktop is **running** before starting Minikube.
