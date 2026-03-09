FROM python:3.12-slim

WORKDIR /app

# Asenna järjestelmäriippuvuudet
# libpq-dev + gcc: psycopg2 käännöstä varten
# libGL + libglib: OpenCV tarvitsee headless-tilassa
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Kopioi ja asenna Python-riippuvuudet
COPY requirements_django.txt .
RUN pip install --no-cache-dir -r requirements_django.txt

# Kopioi sovellus
COPY . .

# Kerää staattiset tiedostot
RUN DJANGO_ENV=prod DJANGO_SECRET_KEY=build-time-placeholder \
    python manage.py collectstatic --noinput

EXPOSE 8000

# Gunicorn tuotantopalvelimena
CMD ["gunicorn", "autoqad.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]
