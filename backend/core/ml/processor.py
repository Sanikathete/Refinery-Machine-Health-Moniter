import numpy as np
import joblib
import os
from django.conf import settings
from core.exceptions import SensorDataException


class SensorDataProcessor:

    REQUIRED_FIELDS = ['machine_id', 'temperature', 'pressure', 'vibration', 'flow_rate', 'humidity']

    VALID_MACHINES = ['PUMP_1', 'PUMP_2', 'COMP_1', 'COMP_2', 'VALVE_1', 'VALVE_2']

    def __init__(self):
        self.minimums = {
            'temperature': 0,
            'pressure': 0,
            'vibration': 0,
            'flow_rate': 0,
            'humidity': 0,
        }

        pkl_dir = settings.ML_MODELS_DIR
        self.encoder = joblib.load(os.path.join(pkl_dir, 'encoder.pkl'))
        self.scaler = joblib.load(os.path.join(pkl_dir, 'scaler.pkl'))

    def validate(self, data):
        missing_fields = [field for field in self.REQUIRED_FIELDS if field not in data]
        if missing_fields:
            raise SensorDataException(f"Missing required fields: {', '.join(missing_fields)}")

        if data['machine_id'] not in self.VALID_MACHINES:
            raise SensorDataException(
                f"Invalid machine_id: {data['machine_id']}. Must be one of {self.VALID_MACHINES}"
            )

        for field, min_val in self.minimums.items():
            try:
                value = float(data[field])
            except (ValueError, TypeError):
                raise SensorDataException(f"Field '{field}' must be a number, got: {data[field]}")

            if value < min_val:
                raise SensorDataException(
                    f"Field '{field}' value {value} is invalid. Must be greater than or equal to {min_val}."
                )

        return True

    def preprocess(self, data):
        machine_id_encoded = self.encoder.transform([data['machine_id']])[0]

        feature_values = np.array([[
            machine_id_encoded,
            float(data['temperature']),
            float(data['pressure']),
            float(data['vibration']),
            float(data['flow_rate']),
            float(data['humidity']),
        ]])

        scaled_values = self.scaler.transform(feature_values)[0]

        processed = {
            'machine_id_encoded': scaled_values[0],
            'temperature': scaled_values[1],
            'pressure': scaled_values[2],
            'vibration': scaled_values[3],
            'flow_rate': scaled_values[4],
            'humidity': scaled_values[5],
        }

        return processed
