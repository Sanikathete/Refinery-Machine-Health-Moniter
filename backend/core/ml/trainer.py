import os
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib


def load_dataset():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    csv_path = os.path.join(base_dir, 'data', 'synthetic_data_Predictive_maintenance.csv')
    df = pd.read_csv(csv_path)
    return df


def augment_dataset(df):
    failure_rows = df[df['failure'] == 1]
    normal_rows = df[df['failure'] == 0]

    oversample_count = len(normal_rows) - len(failure_rows)
    noise_scale = 0.02
    numeric_cols = ['temperature', 'pressure', 'vibration', 'flow_rate', 'humidity']

    augmented_failures = failure_rows.sample(n=oversample_count, replace=True, random_state=42).copy()
    for col in numeric_cols:
        noise = np.random.normal(0, noise_scale * augmented_failures[col].std(), size=oversample_count)
        augmented_failures[col] = augmented_failures[col] + noise

    df_augmented = pd.concat([df, augmented_failures], ignore_index=True)
    return df_augmented


def encode_machine_id(df):
    encoder = LabelEncoder()
    df['machine_id_encoded'] = encoder.fit_transform(df['machine_id'])
    return df, encoder


def scale_features(df, feature_columns):
    scaler = StandardScaler()
    df[feature_columns] = scaler.fit_transform(df[feature_columns])
    return df, scaler


def train_model():
    print("Loading dataset...")
    df = load_dataset()
    print(f"Original dataset: {len(df)} rows")

    print("Augmenting dataset...")
    df = augment_dataset(df)
    print(f"Augmented dataset: {len(df)} rows")

    print("Encoding machine_id...")
    df, encoder = encode_machine_id(df)

    feature_columns = ['machine_id_encoded', 'temperature', 'pressure', 'vibration', 'flow_rate', 'humidity']
    target_column = 'failure'

    print("Scaling features...")
    df, scaler = scale_features(df, feature_columns)

    X = df[feature_columns]
    y = df[target_column]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    print("Training Random Forest model...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nAccuracy: {accuracy:.4f}")
    print(f"\nClassification Report:\n{classification_report(y_test, y_pred)}")

    feature_importance = dict(zip(feature_columns, model.feature_importances_))
    sorted_importance = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)
    print("Feature Importance:")
    for feature, importance in sorted_importance:
        print(f"  {feature}: {importance:.4f}")

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    pkl_dir = os.path.join(base_dir, 'models_pkl')
    os.makedirs(pkl_dir, exist_ok=True)

    model_path = os.path.join(pkl_dir, 'model.pkl')
    encoder_path = os.path.join(pkl_dir, 'encoder.pkl')
    scaler_path = os.path.join(pkl_dir, 'scaler.pkl')

    joblib.dump(model, model_path)
    joblib.dump(encoder, encoder_path)
    joblib.dump(scaler, scaler_path)

    print(f"\nSaved: {model_path}")
    print(f"Saved: {encoder_path}")
    print(f"Saved: {scaler_path}")

    return accuracy


if __name__ == '__main__':
    train_model()
