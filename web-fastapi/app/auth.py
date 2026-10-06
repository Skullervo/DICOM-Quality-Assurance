"""Kevyt sessiopohjainen autentikointi (sama oletus kuin React-frontendissä: admin/radiqa).

Yliajettavissa LOGIN_USER / LOGIN_PASSWORD -ympäristömuuttujilla.
Sessio talletetaan allekirjoitettuun cookieen (Starlette SessionMiddleware).
"""
import os
from fastapi import Request
from fastapi.responses import RedirectResponse

VALID_USER = os.getenv("LOGIN_USER", "admin")
VALID_PASS = os.getenv("LOGIN_PASSWORD", "radiqa")


def check_credentials(user: str, password: str) -> bool:
    return user.strip() == VALID_USER and password == VALID_PASS


def is_authed(request: Request) -> bool:
    return bool(request.session.get("authed"))


def require_auth(request: Request):
    """FastAPI-riippuvuus: ohjaa /login:iin jos ei kirjautunut.

    Nostaa RedirectResponsen poikkeuksena? Ei — palautamme redirectin
    reiteissä. Tässä helper vain tarkistaa; reitit käyttävät is_authed().
    """
    if not is_authed(request):
        return RedirectResponse("/login", status_code=303)
    return None
