from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from core.models import SensorReading, Alert, MaintenanceReport
from core.serializers import (
    SensorReadingSerializer, SensorInputSerializer,
    AlertSerializer, MaintenanceReportSerializer,
)
from core.exceptions import SensorDataException, ModelLoadException, GeminiAPIException
from core.ml.processor import SensorDataProcessor
from core.ml.predictor import MLPredictor
from core.services.alert_manager import AlertManager
from core.services.report_generator import GeminiReportGenerator


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
            response_data['gemini_explanation'] = 'Gemini API unavailable'

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
        return Response({'error': str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        return Response({'error': f'Report generation failed: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def health_check(request):
    return Response({'status': 'healthy', 'service': 'Refinery Monitor API'}, status=status.HTTP_200_OK)
