from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
import re

from django.utils import timezone
from django.contrib.auth import authenticate, get_user_model
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

User = get_user_model()

TEMPERATURE_LIMIT = 91.0
PRESSURE_LIMIT = 225.0
VIBRATION_LIMIT = 0.50
FLOW_RATE_MIN = 116.0
HUMIDITY_LIMIT = 48.0


def get_company_scope(request):
    auth_header = str(request.headers.get('Authorization', '')).strip()
    token = ''
    if auth_header.lower().startswith('bearer '):
        token = auth_header[7:].strip()
    if not token:
        token = str(request.headers.get('X-Auth-Token', '')).strip()
    if not token:
        return 'PUBLIC'

    match = re.match(r'^(?P<company>.+)-(?P<timestamp>\d{9,})$', token)
    if match:
        company = str(match.group('company') or '').strip()
        if company:
            return company
    return token


def build_fallback_report(machine_id, readings_list):
    if not readings_list:
        return (
            f"Machine Status Summary: No recent readings available for {machine_id}.\n"
            "Root Cause Analysis: Data unavailable, so fault classification is inconclusive.\n"
            "Recommended Actions:\n"
            "1. Reconnect the sensor stream and verify data ingestion.\n"
            "2. Capture a fresh batch of readings over the next 10-15 minutes.\n"
            "3. Re-run prediction and report generation once data stabilizes.\n"
            "4. If data remains unavailable, escalate to instrumentation support.\n"
            "Priority Level: Medium"
        )

    def machine_family(machine_code):
        code = str(machine_code or '').upper()
        if code.startswith('PUMP'):
            return 'pump'
        if code.startswith('COMP'):
            return 'compressor'
        if code.startswith('VALVE'):
            return 'valve'
        return 'generic'

    latest = readings_list[0]
    recent_window = readings_list[:3]
    recent_window = recent_window if recent_window else readings_list

    temp = float(latest.get('temperature', 0))
    pressure = float(latest.get('pressure', 0))
    vibration = float(latest.get('vibration', 0))
    flow = float(latest.get('flow_rate', 0))
    humidity = float(latest.get('humidity', 0))
    latest_failure_flag = bool(latest.get('failure', False))
    short_window_failures = sum(1 for row in recent_window if bool(row.get('failure', False)))

    anomaly_flags = {
        'temperature': temp > TEMPERATURE_LIMIT,
        'pressure': pressure > PRESSURE_LIMIT,
        'vibration': vibration > VIBRATION_LIMIT,
        'flow_rate': flow < FLOW_RATE_MIN,
        'humidity': humidity > HUMIDITY_LIMIT,
    }
    anomalies = [name.replace('_', ' ') for name, triggered in anomaly_flags.items() if triggered]

    avg_temp = sum(float(row.get('temperature', 0)) for row in recent_window) / len(recent_window)
    avg_pressure = sum(float(row.get('pressure', 0)) for row in recent_window) / len(recent_window)
    avg_vibration = sum(float(row.get('vibration', 0)) for row in recent_window) / len(recent_window)
    avg_flow = sum(float(row.get('flow_rate', 0)) for row in recent_window) / len(recent_window)
    avg_humidity = sum(float(row.get('humidity', 0)) for row in recent_window) / len(recent_window)

    family = machine_family(machine_id)
    if family == 'compressor':
        component_hint = "compressor stage loading, intercooler efficiency, or anti-surge control instability"
        specific_checks = (
            "1. Inspect compressor bearings and coupling alignment.\n"
            "2. Verify suction/discharge pressure-control response and anti-surge logic.\n"
            "3. Check inlet filter/fouling and flow restrictions.\n"
            "4. Validate vibration sensor baseline and mounting integrity.\n"
            "5. Schedule focused compressor inspection in next maintenance window."
        )
    elif family == 'pump':
        component_hint = "pump impeller wear, cavitation onset, or seal degradation under load"
        specific_checks = (
            "1. Check pump seal condition, bearing temperature, and shaft alignment.\n"
            "2. Inspect suction line integrity and possible cavitation indicators.\n"
            "3. Validate discharge pressure control and recirculation path.\n"
            "4. Recalibrate vibration and flow instrumentation.\n"
            "5. Plan corrective pump maintenance in next available shift."
        )
    elif family == 'valve':
        component_hint = "valve stiction, actuator drift, or partial restriction in the control path"
        specific_checks = (
            "1. Stroke-test the control valve and confirm actuator response.\n"
            "2. Inspect valve positioner calibration and control loop tuning.\n"
            "3. Check downstream/upstream restrictions affecting flow behavior.\n"
            "4. Confirm pressure transmitter and flow meter calibration.\n"
            "5. Schedule valve trim/actuator service if drift persists."
        )
    else:
        component_hint = "mechanical stress and process-control drift under current operating profile"
        specific_checks = (
            "1. Inspect mechanical components for wear or misalignment.\n"
            "2. Validate pressure/flow control response and line restrictions.\n"
            "3. Verify vibration sensor mounting and recalibrate if unstable.\n"
            "4. Compare readings with process setpoints and recent maintenance logs.\n"
            "5. Schedule corrective checks in the nearest maintenance window."
        )

    if anomalies:
        status = (
            f"Abnormal conditions detected for {machine_id} "
            f"({', '.join(anomalies)}). Latest reading requires attention."
        )
    elif latest_failure_flag:
        status = (
            f"Latest model outcome for {machine_id} indicates FAILURE despite near-threshold sensor values."
        )
    elif short_window_failures >= 2:
        status = (
            f"{machine_id} shows intermittent instability in the last {len(recent_window)} readings; "
            "closer observation is required."
        )
    else:
        status = (
            f"{machine_id} is currently stable with no active threshold breach in the latest reading."
        )

    if anomalies or latest_failure_flag or short_window_failures >= 2:
        root_cause = (
            f"Most likely cause is {component_hint}. Recent averages for {machine_id}: "
            f"Temp {avg_temp:.1f}C, Pressure {avg_pressure:.1f}, Vibration {avg_vibration:.2f}, "
            f"Flow {avg_flow:.1f} L/min, Humidity {avg_humidity:.1f}%."
        )
        actions = specific_checks
        priority = "High" if latest_failure_flag or len(anomalies) >= 2 or short_window_failures >= 2 else "Medium"
    else:
        root_cause = (
            f"No dominant failure signature observed for {machine_id}. "
            f"Recent averages are within expected operating band: Temp {avg_temp:.1f}C, "
            f"Pressure {avg_pressure:.1f}, Vibration {avg_vibration:.2f}, "
            f"Flow {avg_flow:.1f} L/min, Humidity {avg_humidity:.1f}%."
        )
        actions = (
            "1. Continue routine preventive maintenance for this machine class.\n"
            "2. Keep pressure, flow, and vibration trend checks active each shift.\n"
            "3. Reconfirm sensor calibration during planned maintenance.\n"
            "4. Escalate if two consecutive readings breach thresholds."
        )
        priority = "Low"

    monitoring = (
        "Monitoring Plan: Check this machine every 30 minutes for the next 4 hours, then hourly for 24 hours. "
        f"Escalate immediately if temperature > {TEMPERATURE_LIMIT}C, pressure > {PRESSURE_LIMIT}, "
        f"vibration > {VIBRATION_LIMIT} mm/s, flow < {FLOW_RATE_MIN} L/min, or humidity > {HUMIDITY_LIMIT}%."
    )

    return (
        f"Machine Status Summary: {status}\n"
        f"Root Cause Analysis: {root_cause}\n"
        f"Recommended Actions:\n{actions}\n"
        f"{monitoring}\n"
        f"Priority Level: {priority}"
    )


def build_fallback_explanation(sensor_data, prediction):
    temperature = float(sensor_data.get('temperature', 0))
    pressure = float(sensor_data.get('pressure', 0))
    vibration = float(sensor_data.get('vibration', 0))
    flow_rate = float(sensor_data.get('flow_rate', 0))
    humidity = float(sensor_data.get('humidity', 0))
    label = str(prediction.get('prediction_label', 'HEALTHY')).upper()
    confidence = float(prediction.get('confidence_score', 0)) * 100

    def upper_limit_assessment(value, limit):
        if value > limit:
            return 'abnormal'
        margin = limit * 0.1
        if value >= (limit - margin):
            return 'borderline'
        return 'normal'

    def lower_limit_assessment(value, limit):
        if value < limit:
            return 'abnormal'
        margin = limit * 0.1
        if value <= (limit + margin):
            return 'borderline'
        return 'normal'

    assessments = {
        'temperature': upper_limit_assessment(temperature, TEMPERATURE_LIMIT),
        'pressure': upper_limit_assessment(pressure, PRESSURE_LIMIT),
        'vibration': upper_limit_assessment(vibration, VIBRATION_LIMIT),
        'flow_rate': lower_limit_assessment(flow_rate, FLOW_RATE_MIN),
        'humidity': upper_limit_assessment(humidity, HUMIDITY_LIMIT),
    }

    status_line = (
        f"Summary: Prediction is {label} with {confidence:.1f}% confidence for machine {sensor_data.get('machine_id', 'N/A')}."
    )
    sensor_line = (
        "Sensor Assessment: "
        f"Temperature {temperature:.1f}C ({assessments['temperature']}), "
        f"Pressure {pressure:.1f} hPa ({assessments['pressure']}), "
        f"Vibration {vibration:.2f} mm/s ({assessments['vibration']}), "
        f"Flow Rate {flow_rate:.1f} L/min ({assessments['flow_rate']}), "
        f"Humidity {humidity:.1f}% ({assessments['humidity']})."
    )

    if label == 'FAILURE':
        root_cause = (
            "Root Cause Hypothesis: The combined stress pattern indicates possible bearing wear, "
            "flow restriction, or process-control drift."
        )
        risk = (
            "Operational Risk: If unaddressed, the machine may experience efficiency loss, unstable output, "
            "or unplanned downtime in the near term."
        )
        actions = (
            "Recommended Actions:\n"
            "1. Inspect bearings and rotating assemblies.\n"
            "2. Verify pressure-control valves and line restrictions.\n"
            "3. Check lubrication condition and shaft alignment.\n"
            "4. Validate flow instrumentation and recalibrate if needed.\n"
            "5. Schedule corrective maintenance in the next shift."
        )
        monitoring = (
            "Monitoring Plan: Track vibration, pressure, and temperature every 15-30 minutes. "
            f"Escalate immediately if temperature exceeds {TEMPERATURE_LIMIT}C, "
            f"pressure exceeds {PRESSURE_LIMIT}, vibration exceeds {VIBRATION_LIMIT} mm/s, "
            f"flow rate drops below {FLOW_RATE_MIN} L/min, or humidity exceeds {HUMIDITY_LIMIT}%."
        )
    else:
        root_cause = (
            "Root Cause Hypothesis: Current readings suggest stable operating conditions with no dominant fault signature."
        )
        risk = (
            "Operational Risk: Low immediate risk, but sustained drift in pressure, vibration, or flow can still "
            "reduce reliability over time."
        )
        actions = (
            "Recommended Actions:\n"
            "1. Continue routine preventive maintenance.\n"
            "2. Inspect for early vibration trend changes.\n"
            "3. Verify calibration of pressure and flow sensors.\n"
            "4. Maintain housekeeping around humidity control."
        )
        monitoring = (
            "Monitoring Plan: Continue standard interval logging and escalate if "
            f"temperature exceeds {TEMPERATURE_LIMIT}C, pressure exceeds {PRESSURE_LIMIT}, "
            f"vibration exceeds {VIBRATION_LIMIT} mm/s, flow rate drops below {FLOW_RATE_MIN} L/min, "
            f"or humidity exceeds {HUMIDITY_LIMIT}%."
        )

    return "\n".join([status_line, sensor_line, root_cause, risk, actions, monitoring])


def enforce_report_consistency(report_text, latest_reading):
    if not report_text:
        return report_text

    latest_failure = bool(latest_reading.get('failure', False)) if latest_reading else False
    if not latest_failure:
        return report_text

    normalized = str(report_text)
    lower_text = normalized.lower()
    if 'no major anomalies detected in the latest reading' in lower_text:
        normalized = normalized.replace(
            'Machine Status Summary: No major anomalies detected in the latest reading.',
            (
                'Machine Status Summary: Failure trend detected in the latest reading and '
                'operational anomalies require immediate attention.'
            ),
        )
        normalized = normalized.replace(
            'Priority Level: Low',
            'Priority Level: High',
        )
    return normalized


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

    breach_flags = []
    if temperature > TEMPERATURE_LIMIT:
        breach_flags.append(f'temperature above {TEMPERATURE_LIMIT}C')
    if pressure > PRESSURE_LIMIT:
        breach_flags.append(f'pressure above {PRESSURE_LIMIT}')
    if vibration > VIBRATION_LIMIT:
        breach_flags.append(f'vibration above {VIBRATION_LIMIT} mm/s')
    if flow_rate < FLOW_RATE_MIN:
        breach_flags.append(f'flow rate below {FLOW_RATE_MIN} L/min')
    if humidity > HUMIDITY_LIMIT:
        breach_flags.append(f'humidity above {HUMIDITY_LIMIT}%')

    force_failure = bool(breach_flags)
    if not force_failure:
        return prediction

    existing_confidence = float(prediction.get('confidence_score', 0))
    prediction['prediction_label'] = 'FAILURE'
    prediction['confidence_score'] = round(max(existing_confidence, 0.9), 4)
    prediction['override_applied'] = True
    prediction['override_reason'] = (
        f"Safety override triggered due to: {', '.join(breach_flags)}"
    )
    return prediction


@api_view(['POST'])
def predict_failure(request):
    input_serializer = SensorInputSerializer(data=request.data)
    if not input_serializer.is_valid():
        return Response({'error': input_serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

    sensor_data = input_serializer.validated_data

    company_scope = get_company_scope(request)

    try:
        processor = SensorDataProcessor()
        processor.validate(sensor_data)
        processed_data = processor.preprocess(sensor_data)

        predictor = MLPredictor()
        prediction = predictor.predict(processed_data)
        prediction = apply_safety_override(sensor_data, prediction)

        sensor_reading = SensorReading.objects.create(
            company_scope=company_scope,
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
                recent_readings = SensorReading.objects.filter(
                    company_scope=company_scope,
                    machine_id=sensor_data['machine_id'],
                )[:10]
                readings_list = SensorReadingSerializer(recent_readings, many=True).data
                latest_reading = readings_list[0] if readings_list else None
                # Keep /predict responsive: avoid a second heavy Gemini call here.
                # Full report generation remains available via /reports/generate/.
                detailed_report = explanation
                detailed_report = enforce_report_consistency(detailed_report, latest_reading)
                MaintenanceReport.objects.create(
                    company_scope=company_scope,
                    machine_id=sensor_data['machine_id'],
                    alert=alert,
                    gemini_explanation=detailed_report,
                    root_cause=detailed_report,
                )
        except GeminiAPIException:
            response_data['gemini_explanation'] = build_fallback_explanation(sensor_data, prediction)
            if alert:
                recent_readings = SensorReading.objects.filter(
                    company_scope=company_scope,
                    machine_id=sensor_data['machine_id'],
                )[:10]
                readings_list = SensorReadingSerializer(recent_readings, many=True).data
                latest_reading = readings_list[0] if readings_list else None
                detailed_report = build_fallback_report(sensor_data['machine_id'], readings_list)
                detailed_report = enforce_report_consistency(detailed_report, latest_reading)
                MaintenanceReport.objects.create(
                    company_scope=company_scope,
                    machine_id=sensor_data['machine_id'],
                    alert=alert,
                    gemini_explanation=detailed_report,
                    root_cause=detailed_report,
                )

        return Response(response_data, status=status.HTTP_200_OK)

    except SensorDataException as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except ModelLoadException as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': f'Internal server error: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def get_sensor_readings(request):
    company_scope = get_company_scope(request)
    machine_id = request.query_params.get('machine_id')
    if machine_id:
        readings = SensorReading.objects.filter(company_scope=company_scope, machine_id=machine_id)[:50]
    else:
        readings = SensorReading.objects.filter(company_scope=company_scope)[:50]

    serializer = SensorReadingSerializer(readings, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_alerts(request):
    alert_manager = AlertManager()
    company_scope = get_company_scope(request)
    machine_id = request.query_params.get('machine_id')

    if machine_id:
        alerts = alert_manager.get_alerts_by_machine(machine_id, company_scope=company_scope)
    else:
        alerts = alert_manager.get_pending_alerts(company_scope=company_scope)

    serializer = AlertSerializer(alerts, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_alert_history(request):
    company_scope = get_company_scope(request)
    completed_schedules = (
        MaintenanceSchedule.objects.filter(
            company_scope=company_scope,
            status=MaintenanceSchedule.STATUS_COMPLETED,
        )
        .select_related('alert__sensor_reading')
        .order_by('-completed_at', '-updated_at', '-created_at')
    )
    history = []

    for schedule in completed_schedules:
        alert = getattr(schedule, 'alert', None)
        sensor_reading = getattr(alert, 'sensor_reading', None) if alert is not None else None

        history.append(
            {
                'id': getattr(alert, 'id', schedule.id),
                'created_at': schedule.completed_at or schedule.updated_at or schedule.created_at,
                'machine_id': schedule.machine_id or getattr(sensor_reading, 'machine_id', None),
                'alert_type': str(getattr(alert, 'prediction_label', 'FAILURE') or 'FAILURE').upper(),
                'severity': (
                    'CRITICAL'
                    if str(getattr(alert, 'prediction_label', 'FAILURE') or 'FAILURE').upper() == 'FAILURE'
                    else 'WARNING'
                ),
                'maintenance_date': schedule.scheduled_for,
                'maintenance_status': 'Completed',
                'schedule_id': schedule.id,
            }
        )

    return Response(history, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_ignored_alerts(request):
    company_scope = get_company_scope(request)
    ignored_alerts = (
        Alert.objects.filter(
            sensor_reading__company_scope=company_scope,
            is_resolved=True,
            resolution_action=Alert.RESOLUTION_IGNORED,
        )
        .select_related('sensor_reading')
        .order_by('-resolved_at', '-created_at')
    )

    rows = []
    for alert in ignored_alerts:
        machine_id = getattr(alert.sensor_reading, 'machine_id', None)
        alert_type = str(alert.prediction_label or 'UNKNOWN').upper()
        severity = 'CRITICAL' if alert_type == 'FAILURE' else 'WARNING'
        rows.append(
            {
                'id': alert.id,
                'machine_id': machine_id,
                'date_time': alert.resolved_at or alert.created_at,
                'alert_type': alert_type,
                'severity': severity,
                'confidence_score': round(float(alert.confidence_score or 0) * 100, 1),
            }
        )

    return Response(rows, status=status.HTTP_200_OK)


@api_view(['POST'])
def resolve_alert(request, alert_id):
    alert_manager = AlertManager()
    company_scope = get_company_scope(request)
    alert = (
        Alert.objects.filter(id=alert_id, sensor_reading__company_scope=company_scope)
        .select_related('sensor_reading')
        .first()
    )

    if alert is None:
        return Response({'error': f'Alert {alert_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    alert_manager.resolve_alert(alert.id)
    alert.resolution_action = Alert.RESOLUTION_RESOLVED
    alert.save(update_fields=['resolution_action', 'updated_at'] if hasattr(alert, 'updated_at') else ['resolution_action'])

    serializer = AlertSerializer(alert)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
def ignore_alert(request, alert_id):
    company_scope = get_company_scope(request)
    alert = Alert.objects.filter(id=alert_id, sensor_reading__company_scope=company_scope).first()
    if alert is None:
        return Response({'error': f'Alert {alert_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    alert.is_resolved = True
    alert.resolved_at = timezone.now()
    alert.resolution_action = Alert.RESOLUTION_IGNORED
    alert.save(update_fields=['is_resolved', 'resolved_at', 'resolution_action'])

    serializer = AlertSerializer(alert)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_reports(request):
    company_scope = get_company_scope(request)
    machine_id = request.query_params.get('machine_id')
    if machine_id:
        reports = MaintenanceReport.objects.filter(company_scope=company_scope, machine_id=machine_id)[:20]
    else:
        reports = MaintenanceReport.objects.filter(company_scope=company_scope)[:20]

    serializer = MaintenanceReportSerializer(reports, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
def generate_report(request):
    company_scope = get_company_scope(request)
    machine_id = request.data.get('machine_id')
    if not machine_id:
        return Response({'error': 'machine_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    recent_readings = SensorReading.objects.filter(company_scope=company_scope, machine_id=machine_id)[:10]
    if not recent_readings:
        return Response({'error': f'No readings found for {machine_id}'}, status=status.HTTP_404_NOT_FOUND)

    readings_list = SensorReadingSerializer(recent_readings, many=True).data
    latest_reading = readings_list[0] if readings_list else None
    latest_prediction = None
    if latest_reading:
        latest_reading_id = latest_reading.get('id')
        latest_alert = None
        if latest_reading_id is not None:
            latest_alert = (
                Alert.objects.filter(sensor_reading_id=latest_reading_id)
                .order_by('-created_at')
                .first()
            )
        latest_prediction = {
            'prediction_label': 'FAILURE' if bool(latest_reading.get('failure', False)) else 'HEALTHY',
            'confidence_score': float(getattr(latest_alert, 'confidence_score', 0)) if latest_alert else None,
        }

    try:
        report_generator = GeminiReportGenerator()
        report_text = report_generator.generate_full_report(
            machine_id=machine_id,
            latest_reading=latest_reading or {},
            recent_readings=readings_list,
            latest_prediction=latest_prediction or {},
        )
        report_text = enforce_report_consistency(report_text, latest_reading)

        report = MaintenanceReport.objects.create(
            company_scope=company_scope,
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
        report_text = enforce_report_consistency(report_text, latest_reading)
        report = MaintenanceReport.objects.create(
            company_scope=company_scope,
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


@api_view(['DELETE'])
def delete_report(request, report_id):
    company_scope = get_company_scope(request)
    report = MaintenanceReport.objects.filter(id=report_id, company_scope=company_scope).first()
    if report is None:
        return Response({'error': f'Report {report_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    report.delete()
    return Response({'message': 'Report removed successfully.'}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
def schedules(request):
    company_scope = get_company_scope(request)
    if request.method == 'GET':
        machine_id = request.query_params.get('machine_id')
        status_filter = request.query_params.get('status')

        queryset = MaintenanceSchedule.objects.filter(company_scope=company_scope)
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
        alert = Alert.objects.filter(id=alert_id, sensor_reading__company_scope=company_scope).first()
        if alert is None:
            return Response({'error': f'Alert {alert_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    schedule = MaintenanceSchedule.objects.create(
        company_scope=company_scope,
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
    company_scope = get_company_scope(request)
    schedule = MaintenanceSchedule.objects.filter(id=schedule_id, company_scope=company_scope).first()
    if schedule is None:
        return Response({'error': f'Schedule {schedule_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    if schedule.status == MaintenanceSchedule.STATUS_CANCELLED:
        return Response(
            {'error': 'Cancelled schedules cannot be completed.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    schedule.status = MaintenanceSchedule.STATUS_COMPLETED
    schedule.completed_at = timezone.now()
    schedule.save(update_fields=['status', 'completed_at', 'updated_at'])

    serializer = MaintenanceScheduleSerializer(schedule)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['DELETE'])
def cancel_schedule(request, schedule_id):
    company_scope = get_company_scope(request)
    schedule = MaintenanceSchedule.objects.filter(id=schedule_id, company_scope=company_scope).first()
    if schedule is None:
        return Response({'error': f'Schedule {schedule_id} not found'}, status=status.HTTP_404_NOT_FOUND)

    if schedule.status == MaintenanceSchedule.STATUS_COMPLETED:
        return Response(
            {'error': 'Completed schedules cannot be cancelled.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if schedule.status == MaintenanceSchedule.STATUS_CANCELLED:
        return Response(
            {'error': 'Schedule is already cancelled.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    schedule.status = MaintenanceSchedule.STATUS_CANCELLED
    schedule.save(update_fields=['status', 'updated_at'])
    serializer = MaintenanceScheduleSerializer(schedule)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
def health_check(request):
    return Response({'status': 'healthy', 'service': 'Refinery Monitor API'}, status=status.HTTP_200_OK)


@api_view(['POST'])
def signup(request):
    company_name = str(request.data.get('company_name', '')).strip()
    sector = str(request.data.get('sector', '')).strip()
    password = str(request.data.get('password', ''))

    if not company_name or not sector or not password:
        return Response(
            {'error': 'company_name, sector, and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(password) < 6:
        return Response(
            {'error': 'Password must be at least 6 characters long.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username__iexact=company_name).exists():
        return Response(
            {'error': 'A company with this name already exists.'},
            status=status.HTTP_409_CONFLICT,
        )

    user = User.objects.create_user(
        username=company_name,
        password=password,
        first_name=sector,
    )

    return Response(
        {
            'message': 'Signup successful.',
            'company_name': user.username,
            'sector': user.first_name,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
def login(request):
    company_name = str(request.data.get('company_name', '')).strip()
    password = str(request.data.get('password', ''))

    if not company_name or not password:
        return Response(
            {'error': 'company_name and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(username__iexact=company_name).first()
    if user is None:
        return Response({'error': 'Invalid company name or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    authenticated_user = authenticate(username=user.username, password=password)
    if authenticated_user is None:
        return Response({'error': 'Invalid company name or password.'}, status=status.HTTP_401_UNAUTHORIZED)

    token = f"{authenticated_user.username}-{int(timezone.now().timestamp())}"
    return Response(
        {
            'message': 'Login successful.',
            'token': token,
            'company_name': authenticated_user.username,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
def forgot_password(request):
    company_name = str(request.data.get('company_name', '')).strip()
    new_password = str(request.data.get('new_password', ''))

    if not company_name or not new_password:
        return Response(
            {'error': 'company_name and new_password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(new_password) < 6:
        return Response(
            {'error': 'New password must be at least 6 characters long.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(username__iexact=company_name).first()
    if user is None:
        return Response(
            {'error': 'No account found for this company name.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    user.set_password(new_password)
    user.save(update_fields=['password'])

    return Response({'message': 'Password reset successful.'}, status=status.HTTP_200_OK)
