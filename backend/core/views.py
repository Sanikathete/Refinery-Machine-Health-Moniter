from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from django.utils import timezone
from core.models import SensorReading, Alert, MaintenanceReport, MaintenanceSchedule
from core.serializers import (
    SensorReadingSerializer, SensorInputSerializer,
    AlertSerializer, MaintenanceReportSerializer, MaintenanceScheduleSerializer,
    MaintenanceScheduleCreateSerializer,
)
from core.exceptions import SensorDataException, ModelLoadException, GeminiAPIException
from core.ml.processor import SensorDataProcessor
from core.ml.predictor import MLPredictor
from core.services.alert_manager import AlertManager
from core.services.report_generator import GeminiReportGenerator


def build_fallback_report(machine_id, readings_list):
    if not readings_list:
        return (
            f"Machine Status Summary: No recent readings available for {machine_id}.\n"
            "Root Cause Analysis: Data unavailable.\n"
            "Recommended Actions: Collect fresh sensor data and retry.\n"
            "Priority Level: Medium"
        )

    latest = readings_list[0]
    temp = float(latest.get('temperature', 0))
    pressure = float(latest.get('pressure', 0))
    vibration = float(latest.get('vibration', 0))
    flow = float(latest.get('flow_rate', 0))
    humidity = float(latest.get('humidity', 0))

    anomalies = []
    if temp > 95:
        anomalies.append('high temperature')
    if pressure > 135 or pressure < 95:
        anomalies.append('pressure out of expected range')
    if vibration > 1.0:
        anomalies.append('elevated vibration')
    if flow < 35:
        anomalies.append('low flow rate')
    if humidity > 70:
        anomalies.append('high humidity')

    if anomalies:
        status = f"Abnormal conditions detected ({', '.join(anomalies)})."
        root_cause = "Most likely mechanical stress and process instability under current load."
        actions = "Inspect bearings/seals, validate pressure control, and schedule maintenance."
        priority = "High" if len(anomalies) > 1 else "Medium"
    else:
        status = "No major anomalies detected in the latest reading."
        root_cause = "System appears stable with current operating profile."
        actions = "Continue monitoring and maintain preventive maintenance schedule."
        priority = "Low"

    return (
        f"Machine Status Summary: {status}\n"
        f"Root Cause Analysis: {root_cause}\n"
        f"Recommended Actions: {actions}\n"
        f"Priority Level: {priority}\n"
        "Note: This fallback report was generated because Gemini was unavailable."
    )


def build_fallback_explanation(sensor_data, prediction):
    temperature = float(sensor_data.get('temperature', 0))
    pressure = float(sensor_data.get('pressure', 0))
    vibration = float(sensor_data.get('vibration', 0))
    flow_rate = float(sensor_data.get('flow_rate', 0))
    humidity = float(sensor_data.get('humidity', 0))
    label = str(prediction.get('prediction_label', 'HEALTHY')).upper()
    confidence = float(prediction.get('confidence_score', 0)) * 100

    flags = []
    if temperature > 95:
        flags.append('temperature is above the safe operating band')
    if pressure > 135 or pressure < 95:
        flags.append('pressure is outside the normal range')
    if vibration > 1.0:
        flags.append('vibration is elevated')
    if flow_rate < 35:
        flags.append('flow rate is lower than expected')
    if humidity > 70:
        flags.append('humidity is high')

    if not flags:
        return (
            f"The model predicts {label} with {confidence:.1f}% confidence. "
            "Sensor values are within expected operating ranges, indicating stable machine behavior. "
            "Continue routine monitoring and preventive maintenance."
        )

    return (
        f"The model predicts {label} with {confidence:.1f}% confidence. "
        f"Key signal drivers: {', '.join(flags)}. "
        "These patterns suggest rising mechanical stress; schedule targeted inspection and corrective maintenance."
    )


def infer_priority(prediction_label, confidence_score):
    label = str(prediction_label or '').upper()
    confidence = float(confidence_score or 0)

    if label == 'FAILURE' and confidence >= 0.9:
        return MaintenanceSchedule.PRIORITY_CRITICAL
    if label == 'FAILURE' and confidence >= 0.75:
        return MaintenanceSchedule.PRIORITY_HIGH
    if label == 'FAILURE':
        return MaintenanceSchedule.PRIORITY_MEDIUM
    return MaintenanceSchedule.PRIORITY_LOW


def apply_safety_override(sensor_data, prediction):
    temperature = float(sensor_data.get('temperature', 0))
    pressure = float(sensor_data.get('pressure', 0))
    vibration = float(sensor_data.get('vibration', 0))
    flow_rate = float(sensor_data.get('flow_rate', 0))
    humidity = float(sensor_data.get('humidity', 0))

    hard_flags = []
    if pressure >= 180:
        hard_flags.append('pressure extremely high')
    if temperature >= 120:
        hard_flags.append('temperature extremely high')
    if vibration >= 8:
        hard_flags.append('vibration extremely high')
    if flow_rate <= 25:
        hard_flags.append('flow rate critically low')
    if humidity >= 85:
        hard_flags.append('humidity critically high')

    soft_flags = []
    if pressure >= 150:
        soft_flags.append('high pressure')
    if temperature >= 95:
        soft_flags.append('high temperature')
    if vibration >= 3:
        soft_flags.append('elevated vibration')
    if flow_rate <= 40:
        soft_flags.append('reduced flow rate')
    if humidity >= 70:
        soft_flags.append('high humidity')

    force_failure = bool(hard_flags) or len(soft_flags) >= 3
    if not force_failure:
        return prediction

    existing_confidence = float(prediction.get('confidence_score', 0))
    prediction['prediction_label'] = 'FAILURE'
    prediction['confidence_score'] = round(max(existing_confidence, 0.9 if hard_flags else 0.75), 4)
    prediction['override_applied'] = True
    prediction['override_reason'] = (
        f"Safety override triggered due to: {', '.join(hard_flags or soft_flags)}"
    )
    return prediction


@api_view(['POST'])
def predict_failure(request):
    input_serializer = SensorInputSerializer(data=request.data)
    if not input_serializer.is_valid():
        return Response({'error': input_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    sensor_data = input_serializer.validated_data

    try:
        processor = SensorDataProcessor()
        processor.validate(sensor_data)
        processed_data = processor.preprocess(sensor_data)

        predictor = MLPredictor()
        prediction = predictor.predict(processed_data)
        prediction = apply_safety_override(sensor_data, prediction)

        sensor_reading = SensorReading.objects.create(
            machine_id=sensor_data['machine_id'],
            temperature=sensor_data['temperature'],
            pressure=sensor_data['pressure'],
            vibration=sensor_data['vibration'],
            flow_rate=sensor_data['flow_rate'],
            humidity=sensor_data['humidity'],
            failure=(prediction['prediction_label'] == 'FAILURE'),
        )

        alert = None
        if prediction['prediction_label'] == 'FAILURE':
            alert_manager = AlertManager()
            alert = alert_manager.create_alert(sensor_reading, prediction)

        response_data = {
            'sensor_reading': SensorReadingSerializer(sensor_reading).data,
            'prediction': prediction,
            'feature_importance': predictor.get_feature_importance(),
            'alert': AlertSerializer(alert).data if alert else None,
        }

        try:
            report_generator = GeminiReportGenerator()
            explanation = report_generator.generate_explanation(sensor_data, prediction)
            response_data['gemini_explanation'] = explanation

            if alert:
                MaintenanceReport.objects.create(
                    machine_id=sensor_data['machine_id'],
                    alert=alert,
                    gemini_explanation=explanation,
                    root_cause=explanation,
                )
        except GeminiAPIException:
            response_data['gemini_explanation'] = build_fallback_explanation(sensor_data, prediction)

        return Response(response_data, status=status.HTTP_200_OK)

    except SensorDataException as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except ModelLoadException as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': f'Internal server error: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def get_sensor_readings(request):
    machine_id = request.query_params.get('machine_id')
    if machine_id:
        readings = SensorReading.objects.filter(machine_id=machine_id)[:50]
    else:
        readings = SensorReading.objects.all()[:50]

    serializer = SensorReadingSerializer(readings, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_alerts(request):
    alert_manager = AlertManager()
    machine_id = request.query_params.get('machine_id')

    if machine_id:
        alerts = alert_manager.get_alerts_by_machine(machine_id)
    else:
        alerts = alert_manager.get_pending_alerts()

    serializer = AlertSerializer(alerts, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
def resolve_alert(request, alert_id):
    alert_manager = AlertManager()
    alert = alert_manager.resolve_alert(alert_id)

    if alert is None:
        return Response({'error': f'Alert {alert_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = AlertSerializer(alert)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_reports(request):
    machine_id = request.query_params.get('machine_id')
    if machine_id:
        reports = MaintenanceReport.objects.filter(machine_id=machine_id)[:20]
    else:
        reports = MaintenanceReport.objects.all()[:20]

    serializer = MaintenanceReportSerializer(reports, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
def generate_report(request):
    machine_id = request.data.get('machine_id')
    if not machine_id:
        return Response({'error': 'machine_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    recent_readings = SensorReading.objects.filter(machine_id=machine_id)[:10]
    if not recent_readings:
        return Response({'error': f'No readings found for {machine_id}'}, status=status.HTTP_404_NOT_FOUND)

    readings_list = SensorReadingSerializer(recent_readings, many=True).data

    try:
        report_generator = GeminiReportGenerator()
        report_text = report_generator.generate_full_report(machine_id, readings_list)

        report = MaintenanceReport.objects.create(
            machine_id=machine_id,
            gemini_explanation=report_text,
            root_cause=report_text,
        )

        return Response({
            'report': MaintenanceReportSerializer(report).data,
            'generated_text': report_text,
        }, status=status.HTTP_200_OK)

    except GeminiAPIException as e:
        report_text = build_fallback_report(machine_id, readings_list)
        report = MaintenanceReport.objects.create(
            machine_id=machine_id,
            gemini_explanation=report_text,
            root_cause='Gemini unavailable. Generated local fallback summary.',
        )
        return Response({
            'report': MaintenanceReportSerializer(report).data,
            'generated_text': report_text,
            'warning': str(e),
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': f'Report generation failed: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET', 'POST'])
def schedules(request):
    if request.method == 'GET':
        machine_id = request.query_params.get('machine_id')
        status_filter = request.query_params.get('status')

        queryset = MaintenanceSchedule.objects.all()
        if machine_id:
            queryset = queryset.filter(machine_id=machine_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter.upper())

        serializer = MaintenanceScheduleSerializer(queryset[:100], many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    create_serializer = MaintenanceScheduleCreateSerializer(data=request.data)
    if not create_serializer.is_valid():
        return Response({'error': create_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    payload = create_serializer.validated_data
    alert = None
    alert_id = payload.get('alert_id')
    if alert_id is not None:
        alert = Alert.objects.filter(id=alert_id).first()
        if alert is None:
            return Response({'error': f'Alert {alert_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    schedule = MaintenanceSchedule.objects.create(
        machine_id=payload['machine_id'],
        alert=alert,
        scheduled_for=payload['scheduled_for'],
        priority=payload.get('priority') or infer_priority(
            getattr(alert, 'prediction_label', None),
            getattr(alert, 'confidence_score', None),
        ),
        notes=payload.get('notes', ''),
        assigned_to=payload.get('assigned_to', ''),
    )
    serializer = MaintenanceScheduleSerializer(schedule)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
def complete_schedule(request, schedule_id):
    schedule = MaintenanceSchedule.objects.filter(id=schedule_id).first()
    if schedule is None:
        return Response({'error': f'Schedule {schedule_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    schedule.status = MaintenanceSchedule.STATUS_COMPLETED
    schedule.completed_at = timezone.now()
    schedule.save(update_fields=['status', 'completed_at', 'updated_at'])

    serializer = MaintenanceScheduleSerializer(schedule)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
def health_check(request):
    return Response({'status': 'healthy', 'service': 'Refinery Monitor API'}, status=status.HTTP_200_OK)
