from rest_framework import serializers
from core.models import SensorReading, Alert, MaintenanceReport, MaintenanceSchedule


class SensorReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorReading
        fields = '__all__'


class SensorInputSerializer(serializers.Serializer):
    machine_id = serializers.CharField(max_length=50)
    temperature = serializers.FloatField()
    pressure = serializers.FloatField()
    vibration = serializers.FloatField()
    flow_rate = serializers.FloatField()
    humidity = serializers.FloatField()


class AlertSerializer(serializers.ModelSerializer):
    machine_id = serializers.CharField(source='sensor_reading.machine_id', read_only=True)

    class Meta:
        model = Alert
        fields = [
            'id', 'machine_id', 'prediction_label', 'confidence_score',
            'is_resolved', 'created_at', 'resolved_at'
        ]


class MaintenanceReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceReport
        fields = '__all__'


class MaintenanceScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceSchedule
        fields = '__all__'


class MaintenanceScheduleCreateSerializer(serializers.Serializer):
    machine_id = serializers.CharField(max_length=50)
    alert_id = serializers.IntegerField(required=False, allow_null=True)
    scheduled_for = serializers.DateTimeField()
    priority = serializers.ChoiceField(
        choices=[choice for choice, _ in MaintenanceSchedule.PRIORITY_CHOICES],
        default=MaintenanceSchedule.PRIORITY_MEDIUM,
        required=False,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    assigned_to = serializers.CharField(required=False, allow_blank=True, default='')
