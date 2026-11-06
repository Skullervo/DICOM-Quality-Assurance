# Radiqa — Windows stopper. Sammuttaa koko lokaalin stäkin (kontit) siististi.
#
# SUOMEKSI: tämä pysäyttää kaikki Radiqan kontit. Data säilyy (nimetyissä volyymeissa),
# joten seuraava '.\start-autoqad.ps1' jatkaa siitä mihin jäätiin.
#
# Käyttö PowerShellissä:
#   .\stop-autoqad.ps1            sammuttaa kontit, jättää podman-koneen pyörimään
#   .\stop-autoqad.ps1 -Machine   sammuttaa MYÖS podman-koneen (vapauttaa RAM:in)
param([switch]$Machine)
$ErrorActionPreference = "Continue"

# Kontit sammutusjärjestyksessä (edustasta taaksepäin, tietokanta viimeisenä).
$names = @(
  "autoqad-caddy", "autoqad-go-backend",
  "us-worker", "xr-worker", "ct-worker", "angio-worker",
  "autoqad-image-service", "ingestion-service", "autoqad-orthanc",
  "object-storage", "autoqad-mssql"
)

Write-Host "Stopping Radiqa containers..." -ForegroundColor Cyan
# podman stop ohittaa kontit jotka eivät ole käynnissä (varoitus vain) — ei haittaa.
podman stop $names

if ($Machine) {
  Write-Host "Stopping podman machine (frees RAM)..." -ForegroundColor Cyan
  podman machine stop
}

Write-Host "Done. (Data säilyy. Käynnistä uudelleen: .\start-autoqad.ps1)" -ForegroundColor Green
