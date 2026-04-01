import os
import numpy as np
import joblib
from django.conf import settings
from core.exceptions import ModelLoadException


class MLPredictor:

    def __init__(self):
        pkl_dir = settings.ML_MODELS_DIR

        model_path = os.path.join(pkl_dir, 'model.pkl')
        encoder_path = os.path.join(pkl_dir, 'encoder.pkl')
        scaler_path = os.path.join(pkl_dir, 'scaler.pkl')

        try:
            self.model = joblib.load(model_path)
            self.encoder = joblib.load(encoder_path)
            self.scaler = joblib.load(scaler_path)
        except FileNotFoundError as e:
            raise ModelLoadException(f"ML model file missing: {e}")
        except Exception as e:
            raise ModelLoadException(f"Failed to load ML models: {e}")

        self.feature_columns = [
            'machine_id_encoded', 'temperature', 'pressure',
            'vibration', 'flow_rate', 'humidity'
        ]

    def predict(self, processed_data):
        features = np.array([[
            processed_data[col] for col in self.feature_columns
        ]])

        prediction = self.model.predict(features)[0]
        probabilities = self.model.predict_proba(features)[0]
        confidence = float(max(probabilities))

        label = 'FAILURE' if prediction == 1 else 'NORMAL'

        return {
            'prediction_label': label,
            'confidence_score': round(confidence, 4),
            'failure_probability': round(float(probabilities[1]), 4),
        }

    def get_feature_importance(self):
        importances = self.model.feature_importances_
        importance_dict = dict(zip(self.feature_columns, importances))
        sorted_importance = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)
        return sorted_importance
