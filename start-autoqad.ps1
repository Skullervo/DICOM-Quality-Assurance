# Radiqa — Windows launcher
# Runs start-podman.sh inside the podman machine (WSL). The bash script does the actual
# work (network, MS SQL + schema, Orthanc, services). Usage:  .\start-autoqad.ps1
#
# SUOMEKSI: tämä on Windowsin käynnistin. Se ei itse tee asennustyötä, vaan ajaa
# varsinaisen start-podman.sh-skriptin WSL:ssä pyörivän Podman-koneen sisällä.
# Käyttö PowerShellissä:  .\start-autoqad.ps1
# Keskeytä heti jos jokin menee pieleen.
$ErrorActionPreference = "Stop"
# Podman-koneen (WSL-distron) nimi.
$WSL = "podman-machine-default"

# Selvitä tämän skriptin (ja siten repon) hakemisto Windows-polkuna.
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
# C:\Users\...\repo  ->  /mnt/c/Users/.../repo
# Muunna Windows-polku WSL:n ymmärtämään /mnt/<asema>/... -muotoon.
$wslPath = "/mnt/" + $repo.Substring(0,1).ToLower() + $repo.Substring(2).Replace('\','/')

# Aja bash-käynnistysskripti Podman-koneen sisällä.
Write-Host "Running start-podman.sh in podman machine ($wslPath) ..." -ForegroundColor Cyan
wsl -d $WSL -- bash "$wslPath/start-podman.sh"
