# Päivittää pelkät staattiset tiedostot (nopea komento)
$ErrorActionPreference = "Stop"

Write-Host "🔄 Päivitetään staattiset tiedostot..." -ForegroundColor Cyan

try {
    # Aktivoi virtual environment jos ei ole jo aktiivinen
    if (-not $env:VIRTUAL_ENV) {
        & "..\venv\Scripts\Activate.ps1"
        Write-Host "✅ Virtual environment aktivoitu" -ForegroundColor Green
    }

    # Päivitä staattiset tiedostot
    python manage.py collectstatic --noinput
    Write-Host "✅ Staattiset tiedostot päivitetty!" -ForegroundColor Green
    Write-Host "💡 Voit nyt päivittää selaimen Ctrl+Shift+R (hard refresh)" -ForegroundColor Yellow
}
catch {
    Write-Host "❌ Virhe: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}