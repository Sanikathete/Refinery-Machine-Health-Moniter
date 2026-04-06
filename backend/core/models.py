from django.db import models


class SensorReading(models.Model):
    company_scope = models.CharField(max_length=150, default='PUBLIC', db_index=True)
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
    RESOLUTION_RESOLVED = 'RESOLVED'
    RESOLUTION_IGNORED = 'IGNORED'
    RESOLUTION_CHOICES = [
        (RESOLUTION_RESOLVED, 'Resolved'),
        (RESOLUTION_IGNORED, 'Ignored'),
    ]

    sensor_reading = models.ForeignKey(
        SensorReading,
        on_delete=models.CASCADE,
        related_name='alerts'
    )
    prediction_label = models.CharField(max_length=20)
    confidence_score = models.FloatField()
    is_resolved = models.BooleanField(default=False)
    resolution_action = models.CharField(
        max_length=20,
        choices=RESOLUTION_CHOICES,
        default=RESOLUTION_RESOLVED,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Alert [{self.prediction_label}] for {self.sensor_reading.machine_id}"

    class Meta:
        ordering = ['-created_at']
        db_table = 'alerts'


class MaintenanceReport(models.Model):
    company_scope = models.CharField(max_length=150, default='PUBLIC', db_index=True)
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


class MaintenanceSchedule(models.Model):
    company_scope = models.CharField(max_length=150, default='PUBLIC', db_index=True)
    STATUS_PENDING = 'PENDING'
    STATUS_COMPLETED = 'COMPLETED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    PRIORITY_LOW = 'LOW'
    PRIORITY_MEDIUM = 'MEDIUM'
    PRIORITY_HIGH = 'HIGH'
    PRIORITY_CRITICAL = 'CRITICAL'
    PRIORITY_CHOICES = [
        (PRIORITY_LOW, 'Low'),
        (PRIORITY_MEDIUM, 'Medium'),
        (PRIORITY_HIGH, 'High'),
        (PRIORITY_CRITICAL, 'Critical'),
    ]

    machine_id = models.CharField(max_length=50)
    alert = models.ForeignKey(
        Alert,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='schedules'
    )
    scheduled_for = models.DateTimeField()
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    notes = models.TextField(blank=True, default='')
    assigned_to = models.CharField(max_length=120, blank=True, default='')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Schedule {self.machine_id} @ {self.scheduled_for} ({self.status})"

    class Meta:
        ordering = ['scheduled_for', '-created_at']
        db_table = 'maintenance_schedules'
