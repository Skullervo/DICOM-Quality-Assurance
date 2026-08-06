# AutoQAD — Podman Startup Script
# Käynnistää palvelut Podman-konteissa (WSL2)
#
# Käyttö: .\start-autoqad.ps1
#         .\start-autoqad.ps1 -Build   # Buildaa Go-backend uudelleen

param([switch]$Build)

$ErrorActionPreference = "Continue"
$WSL = "podman-machine-default"
$ENV_PREFIX = "PODMAN_IGNORE_CGROUPSV1_WARNING=1"

function P([string]$cmd) {
    wsl -d $WSL -- env $ENV_PREFIX podman $cmd.Split(" ") 2>&1 |
        Where-Object { $_ -notmatch "cgroupsv1|shared mount|level=warning" }
}

Write-Host "`n=== AutoQAD Podman Startup ===" -ForegroundColor Cyan

# Verkko
P "network exists autoqad-net" 2>$null
if ($LASTEXITCODE -ne 0) { P "network create autoqad-net" }

# Käynnistä olemassaolevat kontit
foreach ($c in @("autoqad-postgres","autoqad-orthanc","autoqad-go-backend")) {
    P "container exists $c" 2>$null
    if ($LASTEXITCODE -eq 0) {
        P "start $c" | Out-Null
        Write-Host "  $c started" -ForegroundColor Green
    }
}

# Build Go backend jos -Build
if ($Build) {
    Write-Host "  Building Go backend..." -ForegroundColor Yellow
    P "stop autoqad-go-backend" 2>$null
    P "rm autoqad-go-backend" 2>$null
    wsl -d $WSL -- env $ENV_PREFIX podman build -t autoqad-go-backend `
        -f /mnt/c/Users/sylisiur/Projects/autoQAD/DICOM-Quality-Assurance/go-backend/Containerfile `
        /mnt/c/Users/sylisiur/Projects/autoQAD/DICOM-Quality-Assurance/go-backend 2>&1 | Select-Object -Last 3

    # Load .env
    $env = @{}
    Get-Content "C:\Users\sylisiur\Projects\autoQAD\DICOM-Quality-Assurance\.env" |
        Where-Object { $_ -match "=" -and $_ -notmatch "^#" } |
        ForEach-Object { $k,$v = $_ -split "=",2; $env[$k.Trim()] = $v.Trim() }

    P "run -d --name autoqad-go-backend --network autoqad-net -p 8081:8080 -e PORT=8080 -e DATABASE_HOST=autoqad-postgres -e DATABASE_PORT=5432 -e DATABASE_NAME=QA-results -e DATABASE_USER=postgres -e DATABASE_PASSWORD=$($env['DATABASE_PASSWORD']) -e ORTHANC_URL=http://autoqad-orthanc:8042 -e ORTHANC_USERNAME=admin -e ORTHANC_PASSWORD=$($env['ORTHANC_PASSWORD']) -e OPENAI_API_KEY=$($env['OPENAI_API_KEY']) -e SLACK_WEBHOOK_URL=$($env['SLACK_WEBHOOK_URL']) autoqad-go-backend"
}

# Status
Start-Sleep 2
Write-Host ""
P "ps --format table_{{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host "`n  Go Backend:  http://localhost:8081" -ForegroundColor White
Write-Host "  Orthanc:     http://localhost:18042" -ForegroundColor White
Write-Host "  PostgreSQL:  localhost:15432" -ForegroundColor White
Write-Host "  React dev:   cd frontend && npm run dev`n" -ForegroundColor White
