import os
import google.generativeai as genai
from core.exceptions import GeminiAPIException


class GeminiReportGenerator:

    def __init__(self):
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key or api_key.startswith('placeholder'):
            raise GeminiAPIException("GEMINI_API_KEY is not configured in .env")

        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    def generate_explanation(self, sensor_data, prediction):
        prompt = (
            f"You are a refinery equipment maintenance expert. "
            f"A sensor reading from machine '{sensor_data['machine_id']}' returned the following:\n"
            f"- Temperature: {sensor_data['temperature']}°C\n"
            f"- Pressure: {sensor_data['pressure']} PSI\n"
            f"- Vibration: {sensor_data['vibration']} mm/s\n"
            f"- Flow Rate: {sensor_data['flow_rate']} L/min\n"
            f"- Humidity: {sensor_data['humidity']}%\n\n"
            f"The ML model predicted: {prediction['prediction_label']} "
            f"with {prediction['confidence_score'] * 100:.1f}% confidence.\n\n"
            f"Provide a brief 3-4 sentence explanation of why this prediction was made "
            f"based on the sensor values. Identify which sensor readings are abnormal "
            f"and what they indicate about the machine's health."
        )

        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            raise GeminiAPIException(f"Gemini API call failed: {e}")

    def generate_full_report(self, machine_id, recent_readings):
        readings_text = ""
        for i, reading in enumerate(recent_readings, 1):
            readings_text += (
                f"Reading {i}: Temp={reading['temperature']}, "
                f"Pressure={reading['pressure']}, Vibration={reading['vibration']}, "
                f"Flow={reading['flow_rate']}, Humidity={reading['humidity']}, "
                f"Failure={reading.get('failure', 'N/A')}\n"
            )

        prompt = (
            f"You are a refinery maintenance expert. Generate a structured maintenance report "
            f"for machine '{machine_id}' based on these recent sensor readings:\n\n"
            f"{readings_text}\n"
            f"Include the following sections:\n"
            f"1. Machine Status Summary\n"
            f"2. Root Cause Analysis (identify the most likely cause of any anomalies)\n"
            f"3. Recommended Actions (specific maintenance steps)\n"
            f"4. Priority Level (Critical, High, Medium, Low)\n\n"
            f"Keep the report concise and actionable."
        )

        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            raise GeminiAPIException(f"Gemini report generation failed: {e}")
