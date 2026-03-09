# AutoQAD WSL2 Port Forwarding Script
# Aja PowerShellissa jarjestelmanvalvojana: .\wsl-ports.ps1

# Hae WSL2 IP-osoite
$wslIP = (wsl -d Ubuntu bash -c 'hostname -I').Trim().Split(' ')[0]
Write-Host "WSL2 IP: $wslIP" -ForegroundColor Cyan

# Portit jotka ohjataan
$ports = @(8001, 9000, 9443, 18042)
$names = @("Django", "Portainer", "Portainer HTTPS", "Orthanc REST")

# Poista vanhat saannot
Write-Host "`nPoistetaan vanhat portproxy-saannot..." -ForegroundColor Yellow
foreach ($port in $ports) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=127.0.0.1 2>$null
}

# Lisaa uudet saannot
Write-Host "Lisataan uudet portproxy-saannot..." -ForegroundColor Yellow
for ($i = 0; $i -lt $ports.Length; $i++) {
    $port = $ports[$i]
    $name = $names[$i]
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=127.0.0.1 connectport=$port connectaddress=$wslIP
    Write-Host "  $name -> localhost:$port -> ${wslIP}:$port" -ForegroundColor Green
}

# Nayta tulos
Write-Host "`nAktiiviset portproxy-saannot:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

Write-Host "`nValmis! Avaa selaimessa:" -ForegroundColor Green
Write-Host "  Django:    http://localhost:8001"
Write-Host "  Platform:  http://localhost:8001/platform/"
Write-Host "  Portainer: http://localhost:9000"
