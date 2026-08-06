#!/bin/bash
# AutoQAD-palvelimen kaynnistys (podman-machine-default, WSL).
# Aja podman-koneen sisalta:  bash start-palvelin.sh
# tai Windowsista:  wsl -d podman-machine-default -- bash /mnt/c/.../scripts/start-palvelin.sh
export PODMAN_IGNORE_CGROUPSV1_WARNING=1

start() { printf '  %-24s ' "$1"; podman start "$1" >/dev/null 2>&1 && echo ok || echo FAIL; }

# Verkko (luo jos puuttuu)
podman network exists autoqad-net 2>/dev/null || podman network create autoqad-net >/dev/null

echo "== Datavarastot =="
start autoqad-mssql
start autoqad-postgres
start esapi-pg
start autoqad-orthanc

echo "== Tukipalvelut =="
start autoqad-fetch
start autoqad-image-service

echo "   odotetaan 20s (mssql/orthanc valmistautuu)..."
sleep 20

echo "== Analyysi + backend =="
start autoqad-xr-analyze
start autoqad-ct-analyze
start autoqad-us-analyze
start autoqad-go-backend

echo "== Monitorointi =="
start prometheus
start grafana
start loki

echo "== Tila =="
podman ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -E 'autoqad|prometheus|grafana|loki|esapi'
