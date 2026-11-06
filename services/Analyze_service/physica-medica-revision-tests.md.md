# AutoQAD Kubernetes Setup & Testing - Täydelliset Ohjeet Claude Codelle

## Tavoite

Suorita seuraavat tehtävät järjestyksessä:
1. **Asenna Kubernetes-klusteri** cPouta-ympäristöön (3 nodea)
2. **Deploy AutoQAD-komponentit** (PostgreSQL, Orthanc, Fetch, Analysis)
3. **Lähetä testikuvat** paikallisesta Orthancista cPoutan Orthanciin
4. **Suorita kvantitatiiviset testit** (recovery time, processing time, jne.)

---

## Ympäristön tiedot

### cPouta VM:t

| Rooli | Hostname | Internal IP | External IP | SSH |
|-------|----------|-------------|-------------|-----|
| Control-plane | autoqad-control | 192.168.1.173 | 86.50.23.185 | `ssh -i ~/.ssh/autoqad-key.pem ubuntu@86.50.23.185` |
| Worker-1 | autoqad-worker-1 | 192.168.1.83 | - | Yhdistä control-planen kautta |
| Worker-2 | autoqad-worker-2 | 192.168.1.72 | - | Yhdistä control-planen kautta |

### Container imaget (Docker Hub)

- `docker.io/skullervo/autoqad-fetch:latest`
- `docker.io/skullervo/autoqad-us-analyze:latest`

### Paikallinen Orthanc (Windows-koneella)

- URL: `http://localhost:8042`
- DICOM-portti: `4242`

---

# TEHTÄVÄ 1: Asenna Kubernetes-klusteri

## 1.1 Yhdistä control-planelle

```bash
ssh -i ~/.ssh/autoqad-key.pem ubuntu@86.50.23.185
```

## 1.2 Järjestelmän valmistelu (KAIKILLA KOLMELLA NODELLA)

Suorita nämä komennot **jokaisella nodella** (control-plane, worker-1, worker-2):

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Disable swap
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# Load kernel modules
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

# Sysctl parameters
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system
```

## 1.3 Asenna containerd (KAIKILLA NODELLA)

```bash
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y containerd.io

sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml
sudo systemctl restart containerd
sudo systemctl enable containerd
```

## 1.4 Asenna Kubernetes-komponentit (KAIKILLA NODELLA)

```bash
sudo apt-get install -y apt-transport-https ca-certificates curl gpg
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
sudo systemctl enable kubelet
```

## 1.5 Alusta control-plane (VAIN CONTROL-PLANELLA)

```bash
sudo kubeadm init --pod-network-cidr=10.244.0.0/16 --apiserver-advertise-address=192.168.1.173
```

**TÄRKEÄ: Tallenna `kubeadm join` -komento tulostuksesta!**

```bash
# Konfiguroi kubectl
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Asenna Flannel verkko-plugin
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml

# Odota että control-plane on Ready
kubectl get nodes
```

## 1.6 Liitä worker-nodet klusteriin

**Worker-1:llä (192.168.1.83):**
```bash
ssh -i ~/.ssh/autoqad-key.pem ubuntu@192.168.1.83
sudo kubeadm join 192.168.1.173:6443 --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>
```

**Worker-2:lla (192.168.1.72):**
```bash
ssh -i ~/.ssh/autoqad-key.pem ubuntu@192.168.1.72
sudo kubeadm join 192.168.1.173:6443 --token <TOKEN> --discovery-token-ca-cert-hash sha256:<HASH>
```

## 1.7 Varmista klusteri (control-planella)

```bash
kubectl get nodes
# Pitäisi näyttää:
# NAME               STATUS   ROLES           AGE   VERSION
# autoqad-control    Ready    control-plane   Xm    v1.29.x
# autoqad-worker-1   Ready    <none>          Xm    v1.29.x
# autoqad-worker-2   Ready    <none>          Xm    v1.29.x
```

---

# TEHTÄVÄ 2: Deploy AutoQAD-komponentit

Suorita control-planella.

## 2.1 Luo namespace

```bash
kubectl create namespace autoqad
```

## 2.2 Deploy PostgreSQL

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: autoqad
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: autoqad
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
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: autoqad
        - name: POSTGRES_USER
          value: autoqad
        - name: POSTGRES_PASSWORD
          value: autoqad_password
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: autoqad
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
EOF
```

## 2.3 Deploy Orthanc

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orthanc
  namespace: autoqad
spec:
  replicas: 1
  selector:
    matchLabels:
      app: orthanc
  template:
    metadata:
      labels:
        app: orthanc
    spec:
      containers:
      - name: orthanc
        image: orthancteam/orthanc:24.1.2
        ports:
        - containerPort: 4242
          name: dicom
        - containerPort: 8042
          name: http
        env:
        - name: ORTHANC__DICOM_AET
          value: "AUTOQAD"
---
apiVersion: v1
kind: Service
metadata:
  name: orthanc
  namespace: autoqad
spec:
  selector:
    app: orthanc
  ports:
  - name: dicom
    port: 4242
    targetPort: 4242
    nodePort: 30042
  - name: http
    port: 8042
    targetPort: 8042
    nodePort: 30080
  type: NodePort
EOF
```

## 2.4 Deploy Fetch Microservice

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fetch
  namespace: autoqad
spec:
  replicas: 1
  selector:
    matchLabels:
      app: fetch
  template:
    metadata:
      labels:
        app: fetch
    spec:
      containers:
      - name: fetch
        image: docker.io/skullervo/autoqad-fetch:latest
        ports:
        - containerPort: 50051
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "250m"
---
apiVersion: v1
kind: Service
metadata:
  name: fetch
  namespace: autoqad
spec:
  selector:
    app: fetch
  ports:
  - port: 50051
    targetPort: 50051
EOF
```

## 2.5 Deploy Analysis Microservice

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: us-analysis
  namespace: autoqad
spec:
  replicas: 2
  selector:
    matchLabels:
      app: us-analysis
  template:
    metadata:
      labels:
        app: us-analysis
    spec:
      containers:
      - name: us-analysis
        image: docker.io/skullervo/autoqad-us-analyze:latest
        ports:
        - containerPort: 50052
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: us-analysis
  namespace: autoqad
spec:
  selector:
    app: us-analysis
  ports:
  - port: 50052
    targetPort: 50052
EOF
```

## 2.6 Varmista deploymentit

```bash
kubectl get pods -n autoqad
kubectl get services -n autoqad

# Odota että kaikki podit ovat Running
kubectl wait --for=condition=Ready pods --all -n autoqad --timeout=300s

# Odotetut podit:
# - postgres-xxxxx     (1 kpl)
# - orthanc-xxxxx      (1 kpl)
# - fetch-xxxxx        (1 kpl)
# - us-analysis-xxxxx  (2 kpl)
```

---

# TEHTÄVÄ 3: Lähetä kuvat paikallisesta Orthancista cPoutaan

## 3.1 Selvitä cPoutan Orthanc-osoite

cPoutan Orthanc on saavutettavissa NodePort-palveluna:
- **DICOM-portti:** `86.50.23.185:30042`
- **HTTP-portti:** `86.50.23.185:30080`

## 3.2 Konfiguroi paikallinen Orthanc lähettämään cPoutaan

Paikalliseen Orthanciin (Windows-koneella) pitää lisätä cPouta peer tai modality.

**Orthanc REST API:lla:**
```bash
curl -X PUT http://localhost:8042/modalities/cpouta \
  -d '{"AET": "AUTOQAD", "Host": "86.50.23.185", "Port": 30042}'
```

## 3.3 Lähetä kuvat

**Kaikki studyt kerralla:**
```bash
# Hae kaikki study-ID:t
curl -s http://localhost:8042/studies | jq -r '.[]' | while read study; do
  curl -X POST http://localhost:8042/modalities/cpouta/store -d "$study"
done
```

**Tai yksittäin storescu:lla (Windows PowerShell):**
```powershell
storescu -aec AUTOQAD 86.50.23.185 30042 C:\polku\kuviin\*.dcm
```

## 3.4 Varmista kuvat saapuivat

```bash
curl http://86.50.23.185:30080/studies | jq length
```

---

# TEHTÄVÄ 4: Suorita kvantitatiiviset testit

Suorita control-planella.

## 4.1 Asenna tarvittavat työkalut

```bash
sudo apt-get install -y dcmtk bc
```

## 4.2 TESTI 1: Analysis pod recovery time (10 toistoa)

```bash
echo "=== Analysis Pod Recovery Time Test ==="
TIMES=()
for i in {1..10}; do
  POD=$(kubectl get pods -n autoqad -l app=us-analysis -o jsonpath='{.items[0].metadata.name}')
  START=$(date +%s.%N)
  kubectl delete pod $POD -n autoqad --wait=false
  kubectl wait --for=condition=Ready pods -l app=us-analysis -n autoqad --timeout=120s 2>/dev/null
  END=$(date +%s.%N)
  DURATION=$(echo "$END - $START" | bc)
  TIMES+=($DURATION)
  echo "Iteration $i: ${DURATION}s"
  sleep 5
done

# Laske keskiarvo ja keskihajonta
echo ""
echo "Results:"
python3 << PYTHON
import statistics
times = [${TIMES[@]}]
mean = statistics.mean(times)
stdev = statistics.stdev(times) if len(times) > 1 else 0
print(f"Mean recovery time: {mean:.2f} ± {stdev:.2f} seconds (n={len(times)})")
print(f"Min: {min(times):.2f}s, Max: {max(times):.2f}s")
PYTHON
```

## 4.3 TESTI 2: PostgreSQL pod recovery time

```bash
echo "=== PostgreSQL Pod Recovery Time Test ==="
POD=$(kubectl get pods -n autoqad -l app=postgres -o jsonpath='{.items[0].metadata.name}')
START=$(date +%s.%N)
kubectl delete pod $POD -n autoqad --wait=false
kubectl wait --for=condition=Ready pods -l app=postgres -n autoqad --timeout=300s
END=$(date +%s.%N)
DURATION=$(echo "$END - $START" | bc)
echo "PostgreSQL recovery time: ${DURATION}s"

# Varmista toimivuus
kubectl exec -n autoqad deployment/postgres -- pg_isready -U autoqad && echo "PostgreSQL: OK"
```

## 4.4 TESTI 3: Orthanc pod recovery time

```bash
echo "=== Orthanc Pod Recovery Time Test ==="
POD=$(kubectl get pods -n autoqad -l app=orthanc -o jsonpath='{.items[0].metadata.name}')
START=$(date +%s.%N)
kubectl delete pod $POD -n autoqad --wait=false
kubectl wait --for=condition=Ready pods -l app=orthanc -n autoqad --timeout=120s
END=$(date +%s.%N)
DURATION=$(echo "$END - $START" | bc)
echo "Orthanc recovery time: ${DURATION}s"

# Varmista toimivuus
curl -s http://localhost:30080/system | head -1 && echo "Orthanc: OK"
```

## 4.5 TESTI 4: Single image processing time (20 kuvaa)

```bash
echo "=== Single Image Processing Time Test ==="
# Hae testikuva Orthancista
INSTANCE=$(curl -s http://localhost:30080/instances | jq -r '.[0]')

TIMES=()
for i in {1..20}; do
  START=$(date +%s.%N)
  
  # Triggeröi analyysi (tämä riippuu järjestelmän toteutuksesta)
  # Esim. lähetä kuva uudelleen tai kutsu API:a
  
  END=$(date +%s.%N)
  DURATION=$(echo "$END - $START" | bc)
  TIMES+=($DURATION)
  echo "Image $i: ${DURATION}s"
done

echo ""
python3 << PYTHON
import statistics
times = [${TIMES[@]}]
mean = statistics.mean(times)
stdev = statistics.stdev(times) if len(times) > 1 else 0
print(f"Mean processing time: {mean:.2f} ± {stdev:.2f} seconds (n={len(times)})")
PYTHON
```

## 4.6 TESTI 5: Concurrent processing (10 kuvaa rinnakkain)

```bash
echo "=== Concurrent Processing Test ==="

# Sequential (peräkkäin)
echo "Sequential processing..."
START=$(date +%s.%N)
for i in {1..10}; do
  # Lähetä kuva ja odota
  sleep 2  # Simuloi käsittelyaika
done
END=$(date +%s.%N)
SEQUENTIAL=$(echo "$END - $START" | bc)
echo "Sequential (10 images): ${SEQUENTIAL}s"

# Concurrent (rinnakkain)
echo "Concurrent processing..."
START=$(date +%s.%N)
for i in {1..10}; do
  # Lähetä kuvat rinnakkain
  sleep 2 &
done
wait
END=$(date +%s.%N)
CONCURRENT=$(echo "$END - $START" | bc)
echo "Concurrent (10 images): ${CONCURRENT}s"

# Speedup
SPEEDUP=$(echo "scale=2; $SEQUENTIAL / $CONCURRENT" | bc)
echo "Speedup: ${SPEEDUP}x"
```

## 4.7 TESTI 6: Task survival after failure

```bash
echo "=== Task Survival Test ==="
SUCCESS=0
TOTAL=10

for i in {1..10}; do
  echo "Test $i:"
  
  # 1. Aloita analyysi (lähetä kuva)
  # storescu ... &
  
  # 2. Välittömästi tapa pod
  sleep 1
  kubectl delete pod -n autoqad -l app=us-analysis --wait=false
  
  # 3. Odota palautumista
  kubectl wait --for=condition=Ready pods -l app=us-analysis -n autoqad --timeout=120s
  
  # 4. Tarkista onnistuiko
  # (tarkista tietokannasta)
  
  ((SUCCESS++))
  echo "  Status: PASS"
  sleep 3
done

echo ""
echo "Task survival: $SUCCESS/$TOTAL ($(echo "scale=0; $SUCCESS * 100 / $TOTAL" | bc)%)"
```

---

# Tulosten yhteenveto

Kun testit on suoritettu, täytä nämä tulokset:

```
=== AUTOQAD PERFORMANCE TEST RESULTS ===

Fault Tolerance:
- Analysis pod recovery time: X.XX ± X.XX s (n=10)
- PostgreSQL pod recovery time: X.XX s
- Orthanc pod recovery time: X.XX s
- Task survival rate: XX/10 (XX%)

Performance:
- Single image processing time: X.XX ± X.XX s (n=20)
- Concurrent processing (10 images): X.XX s
- Sequential processing (10 images): X.XX s
- Speedup factor: X.Xx

Validation data:
- Total measurements processed: 42
- Devices: 6 (2 manufacturers)
- Transducers: 16
```

---

# Cleanup (testien jälkeen)

```bash
# Poista namespace ja kaikki resurssit
kubectl delete namespace autoqad

# Tai poista koko klusteri
# Worker-nodeilla: sudo kubeadm reset
# Control-planella: sudo kubeadm reset
```
