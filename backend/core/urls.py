from django.urls import path
from core import views

urlpatterns = [
    path('predict/', views.predict_failure, name='predict-failure'),
    path('readings/', views.get_sensor_readings, name='sensor-readings'),
    path('alerts/', views.get_alerts, name='alerts'),
    path('alerts/<int:alert_id>/resolve/', views.resolve_alert, name='resolve-alert'),
    path('reports/', views.get_reports, name='reports'),
    path('reports/generate/', views.generate_report, name='generate-report'),
    path('health/', views.health_check, name='health-check'),
]
