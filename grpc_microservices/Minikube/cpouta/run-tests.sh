#!/bin/bash
# Radiqa / AutoQAD — Physica Medica -revision suorituskyky- ja vikasietotestit.
# Aja control-planella. Vaatii: kubectl, python3, bc, jq.
#
# HUOM metodologiasta (ks. README.md):
#  - us-analyze pollaa ajastetusti + dedup -> "uutta työtä" luodaan tyhjentämällä
#    ultrasound-taulu, jolloin palvelu analysoi Orthancin US-kuvat uudelleen.
#  - Rajaa Orthancin US-kuvien määrä (esim. ~50-100) hallittuun ajoaikaan.
set -u
NS=autoqad

PW=$(kubectl get secret autoqad-secrets -n $NS -o jsonpath='{.data.MSSQL_SA_PASSWORD}' | base64 -d)
SQL() { kubectl exec -n $NS deploy/mssql -- /opt/mssql-tools18/bin/sqlcmd \
          -S localhost -U sa -P "$PW" -C -d QA-results -h -1 -W "$@" 2>/dev/null; }
us_count()  { SQL -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM ultrasound" | tr -cd '0-9'; }
reset_us()  { SQL -Q "TRUNCATE TABLE ultrasound" >/dev/null; }   # luo työtä uudelleenanalyysille
poll_start(){ kubectl rollout restart deploy/us-analysis -n $NS >/dev/null;
              kubectl rollout status  deploy/us-analysis -n $NS --timeout=120s >/dev/null; }

# Odota kunnes rivimäärä saavuttaa $1 tai ei kasva $2 sekuntiin (valmis). Palauttaa lopullisen määrän.
wait_processing() {
  local target=$1 idle_max=${2:-60} last=-1 idle=0
  while :; do
    local c; c=$(us_count); c=${c:-0}
    if [ "$c" -ge "$target" ]; then echo "$c"; return; fi
    if [ "$c" -eq "$last" ]; then idle=$((idle+3)); else idle=0; last=$c; fi
    if [ "$idle" -ge "$idle_max" ]; then echo "$c"; return; fi   # ei enää edisty
    sleep 3
  done
}

stats() { python3 -c "import sys,statistics as s;v=[float(x) for x in sys.argv[1:]];print(f'{s.mean(v):.2f} +/- {(s.stdev(v) if len(v)>1 else 0):.2f} s (n={len(v)}), min={min(v):.2f}, max={max(v):.2f}')" "$@"; }

echo "############ Baseline ############"
echo "Orthanc US-instansseja (odotettu työmäärä): $(kubectl exec -n $NS deploy/orthanc -- \
  sh -c 'curl -su admin:alice http://localhost:8042/instances | python3 -c "import sys,json;print(len(json.load(sys.stdin)))"' 2>/dev/null)"
TARGET=${TARGET:-$(us_count)}   # oletus: nykyinen rivimäärä; aseta esim. TARGET=50

echo ""
echo "############ TESTI 1: Analysis pod recovery (10x) ############"
T=()
for i in $(seq 1 10); do
  POD=$(kubectl get pods -n $NS -l app=us-analysis -o jsonpath='{.items[0].metadata.name}')
  s=$(date +%s.%N)
  kubectl delete pod "$POD" -n $NS --wait=false >/dev/null
  kubectl wait --for=condition=Ready pods -l app=us-analysis -n $NS --timeout=120s >/dev/null 2>&1
  e=$(date +%s.%N); d=$(echo "$e-$s"|bc); T+=("$d"); echo "  it $i: ${d}s"; sleep 5
done
echo "Analysis pod recovery: $(stats "${T[@]}")"

echo ""
echo "############ TESTI 2: MSSQL pod recovery ############"
POD=$(kubectl get pods -n $NS -l app=mssql -o jsonpath='{.items[0].metadata.name}')
s=$(date +%s.%N); kubectl delete pod "$POD" -n $NS --wait=false >/dev/null
kubectl wait --for=condition=Ready pods -l app=mssql -n $NS --timeout=300s >/dev/null 2>&1
e=$(date +%s.%N); echo "  MSSQL recovery: $(echo "$e-$s"|bc)s"

echo ""
echo "############ TESTI 3: Orthanc pod recovery ############"
POD=$(kubectl get pods -n $NS -l app=orthanc -o jsonpath='{.items[0].metadata.name}')
s=$(date +%s.%N); kubectl delete pod "$POD" -n $NS --wait=false >/dev/null
kubectl wait --for=condition=Ready pods -l app=orthanc -n $NS --timeout=120s >/dev/null 2>&1
e=$(date +%s.%N); echo "  Orthanc recovery: $(echo "$e-$s"|bc)s"

echo ""
echo "############ TESTI 4: Per-image processing time (suoraan mitattu) ############"
# us-analyze mittaa nyt per-kuva keston (processing_time-sarake). Replikamäärä ei
# vaikuta tulokseen, koska jokaisella rivillä on oma mitattu aikansa.
reset_us; poll_start
n=$(wait_processing "$TARGET" 90)
TIMES=$(SQL -Q "SET NOCOUNT ON; SELECT processing_time FROM ultrasound WHERE processing_time IS NOT NULL" \
  | tr -d ' \r' | grep -E '^[0-9.]+$')
echo "  Käsiteltyjä kuvia: $n"
if [ -n "$TIMES" ]; then echo "  Per-image processing (mitattu): $(stats $TIMES)"; else echo "  (ei processing_time-arvoja — onko image instrumentoitu versio?)"; fi

echo ""
echo "############ TESTI 5: Horisontaalinen skaalaus (replicas 1/2/4) ############"
declare -A WALL
for R in 1 2 4; do
  reset_us
  kubectl scale deploy/us-analysis -n $NS --replicas=$R >/dev/null; poll_start
  s=$(date +%s.%N); n=$(wait_processing "$TARGET" 90); e=$(date +%s.%N)
  WALL[$R]=$(echo "$e-$s"|bc); echo "  replicas=$R: ${WALL[$R]}s ($n kuvaa)"
done
echo "  Speedup 1->2: $(echo "scale=2; ${WALL[1]}/${WALL[2]}"|bc)x,  1->4: $(echo "scale=2; ${WALL[1]}/${WALL[4]}"|bc)x"
kubectl scale deploy/us-analysis -n $NS --replicas=2 >/dev/null

echo ""
echo "############ TESTI 6: Task survival (tapa pod kesken analyysiä) ############"
OK=0; N=5
for i in $(seq 1 $N); do
  reset_us; kubectl scale deploy/us-analysis -n $NS --replicas=1 >/dev/null; poll_start
  sleep 8   # anna analyysin edetä
  kubectl delete pod -n $NS -l app=us-analysis --wait=false >/dev/null
  kubectl wait --for=condition=Ready pods -l app=us-analysis -n $NS --timeout=120s >/dev/null 2>&1
  n=$(wait_processing "$TARGET" 120)
  if [ "$n" -ge "$TARGET" ]; then OK=$((OK+1)); echo "  test $i: PASS ($n/$TARGET)"; else echo "  test $i: FAIL ($n/$TARGET)"; fi
done
echo "  Task survival: $OK/$N"
kubectl scale deploy/us-analysis -n $NS --replicas=2 >/dev/null

echo ""
echo "############ VALMIS — kokoa tulokset README:n yhteenvetopohjaan ############"
