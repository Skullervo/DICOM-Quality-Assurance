"""
URL configuration for autoqad project.
"""

from django.contrib import admin
from django.urls import path
from django.conf.urls import include
from qa_core import views

urlpatterns = [
    path('', views.index, name = 'index'),
    path('qa/', include('qa_core.urls')),
    path('admin/', admin.site.urls),
    path('muokkaa/', views.muokkaa_ultraa, name='muokkaa_ultraa'),
    path('i18n/', include('django.conf.urls.i18n')),
    path('platform/', include('platform_app.urls', namespace='platform')),
]
