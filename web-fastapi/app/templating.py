"""Jaettu Jinja2-templates + render-helper (vältetään kiertoimport main<->routes)."""
from pathlib import Path
from fastapi import Request
from fastapi.templating import Jinja2Templates

from . import auth

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def render(request: Request, template: str, **ctx):
    ctx.update({
        "request": request,
        "authed": auth.is_authed(request),
        "user": request.session.get("user"),
    })
    return templates.TemplateResponse(template, ctx)
