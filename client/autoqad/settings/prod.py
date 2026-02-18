"""
Django production settings for autoqad project.
"""

import os
import logging
from .base import *  # noqa: F401,F403

logger = logging.getLogger(__name__)

# SECURITY: Secret key must be set via environment variable
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET_KEY environment variable is required in production")

DEBUG = False

ALLOWED_HOSTS = os.getenv("DJANGO_ALLOWED_HOSTS", "").split(",")

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

# Security settings
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'

# OpenAI API key check
if os.getenv("OPENAI_API_KEY"):
    logger.debug("OpenAI API key detected in environment variables.")
else:
    logger.warning("OpenAI API key missing from environment variables.")
