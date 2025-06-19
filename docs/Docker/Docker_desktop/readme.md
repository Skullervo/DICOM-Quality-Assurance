## 🐳 Docker Desktop Setup on Windows with WSL2

### 1. Install Ubuntu via WSL
```powershell
wsl --install -d Ubuntu
```

### 2. Launch WSL (Ubuntu)
```powershell
wsl
```

### 3. Start Docker Desktop in PowerShell
```powershell
Start-Process "Path_to_Docker_Desktop\Docker Desktop.exe"
```

### 4. If WSL and Docker Desktop have issues (e.g. not starting), run:
```powershell
wsl --shutdown
wsl --unregister docker-desktop
wsl --unregister docker-desktop-data
```

### 5. Restart Docker Desktop
```powershell
Start-Process "Path_to_Docker_Desktop\Docker Desktop.exe"
```

### 6. List all containers (including stopped ones)
```bash
docker ps -a
```

#### Where are the containers and images stored?
Since Docker Desktop uses WSL 2, container files and images are stored inside WSL distributions:

```
\\wsl$\docker-desktop-data\
```

You can access them via File Explorer:

- Open a file explorer window and paste the following into the address bar:
```
\\wsl$\docker-desktop-data\version-pack-data\community\docker\
```

### 7. Start a container
```bash
docker start <container_name_or_ID>
```

### 8. Access a running container
```bash
docker exec -it <container_name_or_ID> bash
```
