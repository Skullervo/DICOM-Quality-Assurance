@echo off
REM Kehitysapuskripti Windows PowerShellille - päivittää staattiset tiedostot

echo 🔄 Päivitetään staattiset tiedostot...

REM Aktivoi virtual environment  
call ..\venv\Scripts\activate.bat

REM Päivitä staattiset tiedostot
python manage.py collectstatic --noinput

echo ✅ Staattiset tiedostot päivitetty!

echo 🚀 Käynnistetään kehityspalvelin...
echo 💡 Muista avata selain osoitteessa: http://127.0.0.1:8000
echo 💡 Paina Ctrl+C lopettaaksesi palvelimen
echo.

REM Käynnistä Django-palvelin
python manage.py runserver