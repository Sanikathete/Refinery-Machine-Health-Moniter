import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from core.exceptions import GeminiAPIException


class GeminiReportGenerator:

    def __init__(self):
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key or api_key.startswith('placeholder'):
            raise GeminiAPIException("GEMINI_API_KEY is not configured in .env")

        self.genai = self._load_genai_sdk()
        self.genai.configure(api_key=api_key)
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
        self.model = self.genai.GenerativeModel(self.model_name)
        self.request_timeout_seconds = float(os.getenv('GEMINI_TIMEOUT_SECONDS', '10'))
        self.max_retries = max(int(os.getenv('GEMINI_MAX_RETRIES', '3')), 1)
        self.retry_backoff_seconds = float(os.getenv('GEMINI_RETRY_BACKOFF_SECONDS', '1.2'))

    def _load_genai_sdk(self):
        try:
            import google.generativeai as genai
            return genai
        except ImportError as import_error:
            raise GeminiAPIException(
                "Gemini SDK is not installed. Install it with: pip install google-generativeai"
            ) from import_error

    def _generate_with_deadline(self, prompt):
        def _call_gemini():
            return self.model.generate_content(
                prompt,
                request_options={'timeout': self.request_timeout_seconds},
            )

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_call_gemini)
            try:
                return future.result(timeout=self.request_timeout_seconds + 1)
            except FutureTimeoutError as timeout_error:
                future.cancel()
                raise GeminiAPIException(
                    f"Gemini request timed out after {self.request_timeout_seconds} seconds"
                ) from timeout_error

    def _generate_with_retry(self, prompt, context_label):
        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return self._generate_with_deadline(prompt)
            except Exception as error:
                last_error = error
                if attempt < self.max_retries:
                    sleep_seconds = self.retry_backoff_seconds * attempt
                    time.sleep(sleep_seconds)
        raise GeminiAPIException(
            f"{context_label} failed after {self.max_retries} attempts: {last_error}"
        ) from last_error

    def generate_explanation(self, sensor_data, prediction):
        prompt = (
            "You are a refinery equipment maintenance expert. "
            f"A sensor reading from machine '{sensor_data['machine_id']}' returned the following:\n"
            f"- Temperature: {sensor_data['temperature']} C\n"
            f"- Pressure: {sensor_data['pressure']} PSI\n"
            f"- Vibration: {sensor_data['vibration']} mm/s\n"
            f"- Flow Rate: {sensor_data['flow_rate']} L/min\n"
            f"- Humidity: {sensor_data['humidity']}%\n\n"
            f"The ML model predicted: {prediction['prediction_label']} "
            f"with {prediction['confidence_score'] * 100:.1f}% confidence.\n\n"
            "Provide a detailed but concise analysis in plain text with these sections:\n"
            "1) Summary: one sentence on overall condition.\n"
            "2) Sensor Assessment: mention temperature, pressure, vibration, flow rate, and humidity, and mark each as normal, borderline, or abnormal.\n"
            "3) Root Cause Hypothesis: likely technical cause(s) based on the sensor pattern.\n"
            "4) Operational Risk: short-term impact if no action is taken.\n"
            "5) Recommended Actions: 4-6 specific maintenance steps in priority order.\n"
            "   Write this section as numbered points, one action per line (1., 2., 3., ...).\n"
            "6) Monitoring Plan: what to track for the next 24 hours with escalation triggers.\n"
            "Keep it practical and around 120-180 words."
        )

        try:
            response = self._generate_with_retry(prompt, "Gemini explanation generation")
            return response.text
        except Exception as e:
            raise GeminiAPIException(f"Gemini API call failed: {e}")

    def generate_full_report(self, machine_id, recent_readings):
        readings_text = ""
        latest_failure = bool(recent_readings[0].get('failure', False)) if recent_readings else False
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
            f"Important: The latest model outcome is {'FAILURE' if latest_failure else 'HEALTHY'}. "
            f"Make your status summary consistent with this latest outcome.\n"
            f"Include the following sections:\n"
            f"1. Machine Status Summary\n"
            f"2. Root Cause Analysis (identify the most likely cause of any anomalies)\n"
            f"3. Recommended Actions (specific maintenance steps)\n"
            f"4. Priority Level (Critical, High, Medium, Low)\n\n"
            f"Keep the report concise and actionable."
        )

        try:
            response = self._generate_with_retry(prompt, "Gemini report generation")
            return response.text
        except Exception as e:
            raise GeminiAPIException(f"Gemini report generation failed: {e}")
