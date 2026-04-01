from django.db import models


class SensorReading(models.Model):
    machine_id = models.CharField(max_length=50)
    timestamp = models.DateTimeField(auto_now_add=True)
    temperature = models.FloatField()
    pressure = models.FloatField()
    vibration = models.FloatField()
    flow_rate = models.FloatField()
    humidity = models.FloatField()
    failure = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.machine_id} @ {self.timestamp}"

    class Meta:
        ordering = ['-timestamp']
        db_table = 'sensor_readings'


class Alert(models.Model):
    sensor_reading = models.ForeignKey(
        SensorReading,
        on_delete=models.CASCADE,
        related_name='alerts'
    )
    prediction_label = models.CharField(max_length=20)
    confidence_score = models.FloatField()
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Alert [{self.prediction_label}] for {self.sensor_reading.machine_id}"

    class Meta:
        ordering = ['-created_at']
        db_table = 'alerts'


class MaintenanceReport(models.Model):
    machine_id = models.CharField(max_length=50)
    alert = models.ForeignKey(
        Alert,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reports'
    )
    gemini_explanation = models.TextField()
    root_cause = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Report for {self.machine_id} @ {self.created_at}"

    class Meta:
        ordering = ['-created_at']
        db_table = 'maintenance_reports'
