from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('ultraääni_laadunvalvonta/', views.ultraaeni_laadunvalvonta_view, name='ultraaeni_laadunvalvonta'),
    path('ultraääni_laadunvalvonta/tietoa', views.laadunvalvonta_tietoa, name='tietoa'),
    path('ultraääni_laadunvalvonta/modaliteetit', views.laadunvalvonta_modaliteetit, name='modaliteetit'),
    path('api/s_depth/', views.fetch_s_depth, name='fetch_s_depth'),
    path('api/u_cov/', views.fetch_u_cov, name='fetch_u_cov'),
    path('api/u_skew/', views.fetch_u_skew, name='fetch_u_skew'),
    path('api/s_depth/<str:stationname>/', views.get_s_depth, name='get_s_depth'),
    path('api/u_cov/<str:stationname>/', views.get_u_cov, name='get_u_cov'),
    path('api/u_skew/<str:stationname>/', views.get_u_skew, name='get_u_skew'),
    
    # RÖNTGEN API-REITIT trendikaavioille
    path('api/xray/uniformity/<str:stationname>/', views.get_xray_uniformity, name='get_xray_uniformity'),
    path('api/xray/contrast/<str:stationname>/', views.get_xray_contrast, name='get_xray_contrast'),
    path('api/xray/mtf/<str:stationname>/', views.get_xray_mtf, name='get_xray_mtf'),
    path('api/xray/cnr/<str:stationname>/', views.get_xray_cnr, name='get_xray_cnr'),
    path('api/xray/low_contrast/<str:stationname>/', views.get_xray_low_contrast, name='get_xray_low_contrast'),
    path('api/xray/copper/<str:stationname>/', views.get_xray_copper, name='get_xray_copper'),
    path('api/xray/instance/<str:instance_value>/', views.get_xray_instance, name='get_xray_instance'),
    path('get_xray_image/<str:instance_value>/', views.get_xray_image, name='get_xray_image'),
    
    path('ultraääni_laadunvalvonta/OYS/uatesti_OYS/get_stationname/<int:index>/', views.get_stationname, name='get_stationname'),
    path('institutions/', views.institutions, name='institutions'),
    path('units/', views.units_view, name='units'),
    path('units/<str:unit_name>/', views.unit_details_view, name='unit_details'),
    
    # RÖNTGEN REITIT - sama hierarkia kuin ultraäänellä
    path('xray/institutions/', views.xray_institutions, name='xray_institutions'),
    path('xray/units/<str:institution_name>/', views.xray_units_view, name='xray_units'),
    path('xray/unit_details/<str:institution_name>/<str:unit_name>/', views.xray_unit_details_view, name='xray_unit_details'),
    path('xray/device/<str:institution_name>/<str:unit_name>/', views.xray_device_details, name='xray_device_details'),
    
    path('device/<str:stationname>/', views.device_details_view, name='device_details_view'),
    path('device/<int:device_id>/', views.device_details_by_id, name='device_details_by_id'),
    
    path('get_orthanc_image/instance/<str:instance_value>/', views.get_orthanc_image, name='get_orthanc_image'),
    
    path("ask-ai/", views.ask_ai, name="ask_ai"),
    path('muokkaa/', views.muokkaa_ultraa, name='muokkaa_ultraa'),
    
    path('api/ultrasound/<str:instance_value>/', views.get_ultrasound_by_instance),
    
    path("api/dicom_info/<str:instance_id>/", views.dicom_info_api, name="dicom_info_api"),
    path("api/report-issue/", views.report_issue, name="report_issue"),

]   






