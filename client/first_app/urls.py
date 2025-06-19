from django.urls import path
from first_app import views
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('ultraääni_laadunvalvonta/', views.ultraaeni_laadunvalvonta_view, name='ultraaeni_laadunvalvonta'),
    path('ultraääni_laadunvalvonta/OYS/', views.ultraaeni_oys_view, name='ultraaeni_oys'),
    path('ultraääni_laadunvalvonta/OYS/uatesti_OYS', views.ultraaeni_oys_dashboard, name='uatesti'),
    path('ultraääni_laadunvalvonta/modaliteetit', views.laadunvalvonta_modaliteetit, name='modaliteetit'),
    path('api/s_depth/', views.fetch_s_depth, name='fetch_s_depth'),
    path('api/u_cov/', views.fetch_u_cov, name='fetch_u_cov'),
    path('api/u_skew/', views.fetch_u_skew, name='fetch_u_skew'),
    path('api/s_depth/<str:stationname>/', views.get_s_depth, name='get_s_depth'),
    path('api/u_cov/<str:stationname>/', views.get_u_cov, name='get_u_cov'),
    path('api/u_skew/<str:stationname>/', views.get_u_skew, name='get_u_skew'),
    path('ultraääni_laadunvalvonta/OYS/uatesti_OYS/get_stationname/<int:index>/', views.get_stationname, name='get_stationname'),
    path('institutions/', views.institutions, name='institutions'),
    path('units/', views.units_view, name='units'),
    path('units/<str:unit_name>/', views.unit_details_view, name='unit_details'),
    path('device/<str:stationname>/', views.device_details_view, name='device_details'),
    path('get_orthanc_image/instance/<str:instance_value>/', views.get_orthanc_image, name='get_orthanc_image'),
    path('device/<int:device_id>/', views.device_details, name='device_details'),
]


