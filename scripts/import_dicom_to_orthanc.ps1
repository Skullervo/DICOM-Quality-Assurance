# Tuo iso määrä DICOM-kuvia (esim. ultraääni) ulkoiselta levyltä Orthanciin REST-rajapinnan
# kautta. Lukee tiedostot rekursiivisesti ja POSTaa ne yksitellen -> ei tarvetta liittää
# levyä konttiin. Duplikaatit ohitetaan (Orthanc OverwriteInstances=false).
#
# Kaytto:
#   .\scripts\import_dicom_to_orthanc.ps1 -Source "E:\ultra"
#   .\scripts\import_dicom_to_orthanc.ps1 -Source "E:\ultra" -Filter "*.dcm"   # jos paatteet
#
param(
  [Parameter(Mandatory=$true)][string]$Source,          # kansio ulkoisella levylla
  [string]$Orthanc  = "http://localhost:18042",
  [string]$User     = "admin",
  [string]$Password = "alice",                           # = .env ORTHANC_PASSWORD
  [string]$Filter   = "*"                                # DICOM usein ilman paatetta -> "*"
)

if (-not (Test-Path -LiteralPath $Source)) { throw "Lahdekansiota ei ole: $Source" }

Write-Host "Etsitaan tiedostoja: $Source ..." -ForegroundColor Cyan
$files = Get-ChildItem -LiteralPath $Source -Recurse -File -Filter $Filter
$total = $files.Count
Write-Host "Loytyi $total tiedostoa. Ladataan Orthanciin ($Orthanc) ..." -ForegroundColor Cyan

$ok = 0; $fail = 0; $i = 0
foreach ($f in $files) {
  $i++
  # curl.exe hoitaa binaarilatauksen luotettavasti; palauttaa HTTP-koodin
  $code = curl.exe -s -o NUL -w "%{http_code}" -u "$User`:$Password" `
            --data-binary "@$($f.FullName)" -H "Content-Type: application/dicom" `
            "$Orthanc/instances"
  if ($code -eq "200") { $ok++ } else { $fail++ }
  if ($i % 200 -eq 0) {
    Write-Host ("  {0}/{1}  (tallennettu={2}, ei-DICOM/virhe={3})" -f $i,$total,$ok,$fail)
  }
}

Write-Host ""
Write-Host ("Valmis: {0} tallennettu, {1} ohitettu/virhe (esim. ei-DICOM-tiedostot)." -f $ok,$fail) -ForegroundColor Green
Write-Host "US-analyysi kaynnistyy automaattisesti seuraavalla poll-kierroksella." -ForegroundColor Gray
Write-Host "Nopeuta: wsl -d podman-machine-default -- env PODMAN_IGNORE_CGROUPSV1_WARNING=1 podman restart autoqad-us-analyze" -ForegroundColor Gray
