# Radiqa — Windows launcher
# Runs start-podman.sh inside the podman machine (WSL). The bash script does the actual
# work (network, MS SQL + schema, Orthanc, services). Usage:  .\start-autoqad.ps1
$ErrorActionPreference = "Stop"
$WSL = "podman-machine-default"

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
# C:\Users\...\repo  ->  /mnt/c/Users/.../repo
$wslPath = "/mnt/" + $repo.Substring(0,1).ToLower() + $repo.Substring(2).Replace('\','/')

Write-Host "Running start-podman.sh in podman machine ($wslPath) ..." -ForegroundColor Cyan
wsl -d $WSL -- bash "$wslPath/start-podman.sh"
