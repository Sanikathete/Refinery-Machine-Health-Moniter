from django.urls import path
from core import views

urlpatterns = [
    path('predict/', views.predict_failure, name='predict-failure'),
    path('readings/', views.get_sensor_readings, name='sensor-readings'),
    path('alerts/', views.get_alerts, name='alerts'),
    path('alerts/<int:alert_id>/resolve/', views.resolve_alert, name='resolve-alert'),
    path('schedules/', views.schedules, name='schedules'),
    path('schedules/<int:schedule_id>/complete/', views.complete_schedule, name='complete-schedule'),
    path('reports/', views.get_reports, name='reports'),
    path('reports/generate/', views.generate_report, name='generate-report'),
    path('health/', views.health_check, name='health-check'),
]
