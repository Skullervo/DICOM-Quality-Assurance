# 🐳 Docker Basic Command Reference

## 🔹 1. Build a Docker Image
Build an image from a Dockerfile in the current directory.
```bash
docker build -t <image-name>:<tag> .
```
**Example:**
```bash
docker build -t my-app:latest .
```

---

## 🔹 2. List Docker Images
```bash
docker images
```

---

## 🔹 3. Run a Container
Run a container from an image.
```bash
docker run -d --name <container-name> -p <host-port>:<container-port> <image-name>:<tag>
```
**Example:**
```bash
docker run -d --name my-container -p 8080:80 my-app:latest
```

---

## 🔹 4. View Running Containers
```bash
docker ps
```

## 🔹 5. View All Containers (including stopped ones)
```bash
docker ps -a
```

---

## 🔹 6. Stop a Running Container
```bash
docker stop <container-name>
```

---

## 🔹 7. Remove a Container
```bash
docker rm <container-name>
```

---

## 🔹 8. Remove an Image
```bash
docker rmi <image-name>:<tag>
```

---

## 🔹 9. Tag an Image for Docker Hub
```bash
docker tag <local-image-name> <dockerhub-username>/<image-name>:<tag>
```

---

## 🔹 10. Push an Image to Docker Hub
```bash
docker push <dockerhub-username>/<image-name>:<tag>
```

---

## 🔹 11. Pull an Image from Docker Hub
```bash
docker pull <dockerhub-username>/<image-name>:<tag>
```

---

## 🔹 12. Execute a Command in a Running Container
```bash
docker exec -it <container-name> bash
```

---

## 🔹 13. View Container Logs
```bash
docker logs <container-name>
```

---

## 🔹 14. Login to Docker Hub
```bash
docker login
```

---

## 🔹 15. Logout from Docker Hub
```bash
docker logout
```
