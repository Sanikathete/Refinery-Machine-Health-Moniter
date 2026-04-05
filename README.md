# Refinery Machine Health Monitor

A full-stack predictive maintenance system for refinery machines. It uses Machine Learning (Random Forest) to predict mechanical failures from real-time sensor readings, and Google Gemini AI to generate human-readable root cause explanations and maintenance reports.

---

## Project Goal

Monitor refinery machines (pumps, compressors, valves) in real time. When sensors detect abnormal readings, the system predicts an upcoming failure, raises an alert, and generates an AI-powered maintenance report — before the machine actually breaks down.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Backend     | Django + Django REST Framework      |
| Database    | PostgreSQL                          |
| ML          | scikit-learn (Random Forest)        |
| GenAI       | Google Gemini API (gemini-1.5-flash)|
| Deployment  | Azure App Service + Azure PostgreSQL|

---

## Backend Folder Structure

```
refinery-monitor/
├── backend/
│   ├── core/                        # Main Django app
│   │   ├── models.py                # DB models: SensorReading, Alert, MaintenanceReport
│   │   ├── views.py                 # REST API endpoints
│   │   ├── urls.py                  # App-level URL routing
│   │   ├── serializers.py           # DRF serializers
│   │   ├── exceptions.py            # Custom exceptions
│   │   ├── ml/
│   │   │   ├── trainer.py           # Train and save ML model
│   │   │   ├── predictor.py         # MLPredictor class
│   │   │   └── processor.py         # SensorDataProcessor class
│   │   └── services/
│   │       ├── alert_manager.py     # AlertManager class
│   │       └── report_generator.py  # GeminiReportGenerator class
│   ├── data/
│   │   └── synthetic_data_Predictive_maintenance.csv
│   ├── models_pkl/                  # Saved ML artifacts (git-ignored)
│   │   ├── model.pkl
│   │   ├── encoder.pkl
│   │   └── scaler.pkl
│   ├── refinery_backend/            # Django project settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── manage.py
│   ├── requirements.txt
│   └── .env                         # Secret keys and DB credentials (git-ignored)
├── .gitignore
└── README.md
```

---

## Data Flow

```
User Input (machine_id + sensor readings)
        ↓
Django REST API (views.py)
        ↓
SensorDataProcessor → validates + preprocesses
        ↓
MLPredictor → Random Forest prediction (failure / no failure + confidence)
        ↓
AlertManager → creates Alert record in PostgreSQL (if failure predicted)
        ↓
GeminiReportGenerator → AI explanation + root cause analysis
        ↓
JSON Response returned to frontend
```

---

## Machines Monitored

- PUMP_1, PUMP_2
- COMP_1, COMP_2
- VALVE_1, VALVE_2

---

## Setup Instructions

> Detailed step-by-step setup will be added as development progresses.

1. Clone the repository
2. Create and activate a Python virtual environment
3. Install dependencies: `pip install -r requirements.txt`
4. Configure `.env` with your DB credentials and Gemini API key
5. Run migrations: `python manage.py migrate`
6. Train the ML model: `python core/ml/trainer.py`
7. Start the server: `python manage.py runserver`

---

## Deployment Notes (Azure App Service + VM PostgreSQL)

If you do not want Azure Database for PostgreSQL, you can deploy only the app on Azure and connect to PostgreSQL running on your own VM.

1. In Azure App Service environment variables, set:
   - `USE_SQLITE=False`
   - `DB_HOST=<your-vm-ip-or-dns>`
   - `DB_PORT=5432`
   - `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - `DB_SSLMODE=prefer` (or empty if your VM PostgreSQL has no SSL)
2. Ensure your VM firewall/security group allows inbound PostgreSQL (`5432`) from Azure App Service outbound IPs.
3. Keep `backend/data/synthetic_data_Predictive_maintenance.csv` in the deployed package.
4. Seed DB from CSV with:
   - `python manage.py seed_readings_from_csv --replace`
5. Optional startup seeding:
   - Set `SEED_FROM_CSV=true` and use `backend/deploy.sh`.

---

## Author

Built as a final interview project demonstrating full-stack development, machine learning integration, and generative AI usage in a real-world industrial monitoring scenario.
