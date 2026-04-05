from django.urls import path
from core import views

urlpatterns = [
    path('auth/signup/', views.signup, name='signup'),
    path('auth/login/', views.login, name='login'),
    path('forgot-password/', views.forgot_password, name='forgot-password'),
    path('predict/', views.predict_failure, name='predict-failure'),
    path('readings/', views.get_sensor_readings, name='sensor-readings'),
    path('alerts/', views.get_alerts, name='alerts'),
    path('alerts/history/', views.get_alert_history, name='alert-history'),
    path('alerts/ignored/', views.get_ignored_alerts, name='ignored-alerts'),
    path('alerts/<int:alert_id>/resolve/', views.resolve_alert, name='resolve-alert'),
    path('alerts/<int:alert_id>/ignore/', views.ignore_alert, name='ignore-alert'),
    path('schedules/', views.schedules, name='schedules'),
    path('schedules/<int:schedule_id>/complete/', views.complete_schedule, name='complete-schedule'),
    path('schedules/<int:schedule_id>/cancel/', views.cancel_schedule, name='cancel-schedule'),
    path('reports/', views.get_reports, name='reports'),
    path('reports/generate/', views.generate_report, name='generate-report'),
    path('reports/<int:report_id>/', views.delete_report, name='delete-report'),
    path('health/', views.health_check, name='health-check'),
]
