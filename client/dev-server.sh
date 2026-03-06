#!/bin/bash

# Kehitysapuskripti - päivittää staattiset tiedostot ja käynnistää palvelimen

echo "🔄 Päivitetään staattiset tiedostot..."

# Aktivoi virtual environment
source ../venv/Scripts/activate 2>/dev/null || source ../venv/bin/activate

# Päivitä staattiset tiedostot
python manage.py collectstatic --noinput

echo "✅ Staattiset tiedostot päivitetty!"

echo "🚀 Käynnistetään kehityspalvelin..."
echo "💡 Muista avata selain osoitteessa: http://127.0.0.1:8000"
echo "💡 Paina Ctrl+C lopettaaksesi palvelimen"
echo ""

# Käynnistä Django-palvelin
python manage.py runserver