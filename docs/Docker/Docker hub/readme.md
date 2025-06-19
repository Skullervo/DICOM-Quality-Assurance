# 🐳 INSTRUCTIONS: Uploading a Docker Image to Docker Hub

## 1. Log in to Docker Hub (https://hub.docker.com)
```PowerShell
docker login
```

## 2. Rename an existing local Docker image to match the Docker Hub format:
```PowerShell
docker tag <local-image-name> <dockerhub-username>/<desired-image-name>:<version>
```

**EXAMPLE:**
```PowerShell
docker tag my-local-image myusername/my-image:latest
```

## 3. Push the image to your Docker Hub account:
```PowerShell
# docker push <dockerhub-username>/<image-name>:<version>
```

**EXAMPLE:**
```PowerShell
docker push myusername/my-image:latest
```

## 4. Check in your browser that the image has appeared in your repository:
https://hub.docker.com/repositories

### 📥 If you want to download the image on another machine:

```PowerShell
# docker pull <dockerhub-username>/<image-name>:<version>
```

**EXAMPLE:**
```PowerShell
docker pull myusername/my-image:latest
```

## 🏁 You can run the image directly like this:

```PowerShell
# docker run -d --name <container-name> -p <host-port>:<container-port> <dockerhub-username>/<image-name>:<version>
```
