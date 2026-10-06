"""Radiqa — kevyt web-frontend (FastAPI + Jinja2 + HTMX).

Vaihtoehtoinen, yhtenäistetty (koko-Python) toteutus Go + React -stackin rinnalle.
Lukee samaa MSSQL:ää (QA-results) + Orthancia. Go+React jää koskematta.

Aja paikallisesti (Podman-MSSQL host-portissa 11433):
  cd web-fastapi
  DATABASE_HOST=localhost DATABASE_PORT=11433 DATABASE_PASSWORD=<sa-pw> \
    uvicorn app.main:app --reload --port 8082
Avaa http://localhost:8082/
"""
import os
from pathlib import Path

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from . import auth
from .templating import render

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Radiqa (FastAPI)")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "radiqa-dev-secret-change-me"),
    same_site="lax",
)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


# ---- Health ----
@app.get("/health")
def health():
    return {"service": "radiqa-fastapi", "status": "ok"}


# ---- Auth ----
@app.get("/login", response_class=HTMLResponse)
def login_get(request: Request):
    if auth.is_authed(request):
        return RedirectResponse("/", status_code=303)
    return render(request, "login.html", error=None)


@app.post("/login", response_class=HTMLResponse)
def login_post(request: Request, username: str = Form(...), password: str = Form(...)):
    if auth.check_credentials(username, password):
        request.session["authed"] = True
        request.session["user"] = username.strip()
        return RedirectResponse("/", status_code=303)
    return render(request, "login.html", error="Väärä käyttäjätunnus tai salasana.")


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


# ---- Home ----
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    if not auth.is_authed(request):
        return RedirectResponse("/login", status_code=303)
    modalities = [
        {"key": "us", "name": "Ultraääni", "desc": "In-air reverberation QA"},
        {"key": "xray", "name": "Röntgen", "desc": "NORMI-13 fantomi"},
        {"key": "ct", "name": "TT (CT)", "desc": "Catphan"},
    ]
    return render(request, "home.html", modalities=modalities)


# Modaliteettinäkymät liitetään erillisistä reittimoduuleista (us/xray/ct) kun
# datakerros on portattu. Rekisteröidään täällä:
from .routes import us as us_routes  # noqa: E402

app.include_router(us_routes.router)
