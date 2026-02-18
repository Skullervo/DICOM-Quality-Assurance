"""
Django development settings for autoqad project.
"""

import os
import logging
from .base import *  # noqa: F401,F403

logger = logging.getLogger(__name__)

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "django-insecure-a+$=05!2k8i3_#i&vh#2y#kw0!r=ptb(*p3+55gvugq(5wv^b1"
)

DEBUG = True

ALLOWED_HOSTS = os.getenv(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1,host.docker.internal"
).split(",")

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv("DATABASE_NAME", "QA-results"),
        'USER': os.getenv("DATABASE_USER", "postgres"),
        'PASSWORD': os.getenv("DATABASE_PASSWORD", ""),
        'HOST': os.getenv("DATABASE_HOST", "localhost"),
        'PORT': os.getenv("DATABASE_PORT", "5432"),
    }
}

# OpenAI API key check
if os.getenv("OPENAI_API_KEY"):
    logger.debug("OpenAI API key detected in environment variables.")
else:
    logger.warning("OpenAI API key missing from environment variables.")

# Cache busting for static files in development
import time
STATIC_VERSION = str(int(time.time()))
