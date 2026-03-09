from django.urls import path
from . import views

app_name = 'platform'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('api/status/', views.api_status, name='api_status'),
    path('api/inspect/<str:container_name>/', views.api_inspect, name='api_inspect'),
    path('api/logs/<str:container_name>/', views.api_logs, name='api_logs'),
    path('api/container/<str:container_name>/<str:action>/', views.api_container_action, name='api_container_action'),
    path('api/bulk/<str:action>/', views.api_bulk_action, name='api_bulk_action'),
    path('api/positions/', views.api_save_positions, name='api_save_positions'),
    path('api/service/add/', views.api_add_service, name='api_add_service'),
    path('api/service/<int:service_id>/delete/', views.api_delete_service, name='api_delete_service'),
    path('api/connection/add/', views.api_add_connection, name='api_add_connection'),
    path('api/connection/<int:connection_id>/delete/', views.api_delete_connection, name='api_delete_connection'),
    path('api/files/<str:container_name>/tree/', views.api_file_tree, name='api_file_tree'),
    path('api/files/<str:container_name>/read/', views.api_file_read, name='api_file_read'),
    path('api/files/<str:container_name>/write/', views.api_file_write, name='api_file_write'),

    # Projektit
    path('projects/', views.project_list, name='project_list'),
    path('projects/<int:project_id>/', views.project_builder, name='project_builder'),
    path('api/project/create/', views.api_project_create, name='api_project_create'),
    path('api/project/<int:project_id>/delete/', views.api_project_delete, name='api_project_delete'),
    path('api/project/<int:project_id>/layer/add/', views.api_layer_add, name='api_layer_add'),
    path('api/project/<int:project_id>/service/add/', views.api_project_add_service, name='api_project_add_service'),
    path('api/project/<int:project_id>/connection/add/', views.api_project_add_connection, name='api_project_add_connection'),
    path('api/project/<int:project_id>/positions/', views.api_project_save_positions, name='api_project_save_positions'),
    path('api/project/<int:project_id>/layers/', views.api_project_save_layers, name='api_project_save_layers'),
    path('api/layer/<int:layer_id>/update/', views.api_layer_update, name='api_layer_update'),
    path('api/layer/<int:layer_id>/delete/', views.api_layer_delete, name='api_layer_delete'),
]
