# Compact the podman WSL virtual disk to reclaim freed space back to C:.
# The disk already has ~29 GB free INSIDE the VM (old image layers were pruned),
# but the .vhdx file on C: does not shrink by itself — this compacts it.
#
# RUN AS ADMINISTRATOR (diskpart requires elevation):
#   Right-click -> "Run with PowerShell" as admin, or from an elevated prompt:
#     powershell -ExecutionPolicy Bypass -File .\compact-podman-disk.ps1
#
# It briefly stops the whole local stack (~5 min), compacts, then restarts it.
$ErrorActionPreference = "Stop"
$vhdx = "C:\Users\sylisiur\.local\share\containers\podman\machine\wsl\wsldist\podman-machine-default\ext4.vhdx"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: run this script AS ADMINISTRATOR (diskpart needs elevation)." -ForegroundColor Red
    exit 1
}

$before = [math]::Round((Get-Item $vhdx).Length/1GB,2)
$cFree  = [math]::Round((Get-Volume C).SizeRemaining/1GB,2)
Write-Host "vhdx before: $before GB   C: free: $cFree GB"

Write-Host "Shutting down WSL (stops all local containers)..." -ForegroundColor Cyan
wsl --shutdown
Start-Sleep -Seconds 8

$sf = "$env:TEMP\compact_podman.txt"
@"
select vdisk file="$vhdx"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"@ | Set-Content -Path $sf -Encoding ascii

Write-Host "Compacting vhdx (a few minutes)..." -ForegroundColor Cyan
diskpart /s $sf

$after = [math]::Round((Get-Item $vhdx).Length/1GB,2)
Write-Host "vhdx after: $after GB  (freed $([math]::Round($before-$after,1)) GB)" -ForegroundColor Green

Write-Host "Restarting podman machine + containers..." -ForegroundColor Cyan
podman machine start
Start-Sleep -Seconds 8
foreach ($c in "autoqad-mssql","autoqad-orthanc","autoqad-fetch","autoqad-image-service","autoqad-us-analyze","autoqad-xr-analyze","autoqad-ct-analyze") {
    podman start $c | Out-Null
}
Write-Host "Waiting for MS SQL to accept connections before starting go-backend..."
Start-Sleep -Seconds 25
podman start autoqad-go-backend | Out-Null

Write-Host ("Done. C: free now: {0} GB" -f [math]::Round((Get-Volume C).SizeRemaining/1GB,2)) -ForegroundColor Green
podman ps --format "{{.Names}} {{.Status}}"
