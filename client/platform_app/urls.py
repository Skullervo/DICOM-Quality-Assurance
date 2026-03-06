from django.urls import path
from . import views

app_name = 'platform'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('api/status/', views.api_status, name='api_status'),
]
