from django.apps import AppConfig


class QaCoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'qa_core'
    label = 'first_app'  # Säilytetään vanha label migraatioyhteensopivuutta varten
