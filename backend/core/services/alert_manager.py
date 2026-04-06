from django.utils import timezone
from core.models import Alert


class AlertManager:

    def create_alert(self, sensor_reading, prediction_result):
        alert = Alert.objects.create(
            sensor_reading=sensor_reading,
            prediction_label=prediction_result['prediction_label'],
            confidence_score=prediction_result['confidence_score'],
        )
        return alert

    def get_pending_alerts(self, company_scope=None):
        queryset = Alert.objects.filter(is_resolved=False)
        if company_scope:
            queryset = queryset.filter(sensor_reading__company_scope=company_scope)
        return (
            queryset
            .exclude(schedules__status='PENDING')
            .distinct()
        )

    def resolve_alert(self, alert_id):
        try:
            alert = Alert.objects.get(id=alert_id)
        except Alert.DoesNotExist:
            return None

        alert.is_resolved = True
        alert.resolved_at = timezone.now()
        alert.save()
        return alert

    def get_alerts_by_machine(self, machine_id, company_scope=None):
        queryset = Alert.objects.filter(
            sensor_reading__machine_id=machine_id,
            is_resolved=False,
        )
        if company_scope:
            queryset = queryset.filter(sensor_reading__company_scope=company_scope)
        return (
            queryset
            .exclude(schedules__status='PENDING')
            .distinct()
        )
