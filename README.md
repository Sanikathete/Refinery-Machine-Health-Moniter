# Refinery Machine Health Monitor

Full-stack predictive maintenance platform for refinery assets (pumps, compressors, valves).  
It combines:
- ML failure prediction
- Real-time alerting
- Maintenance scheduling workflow
- Gemini-powered operational analysis and reports

Live website:
- https://neurorefine.duckdns.org
- Health check: https://neurorefine.duckdns.org/api/health/

## 1. Current System Overview

Frontend:
- React + Vite
- Dashboard, Predict, Alerts, Reports, Auth pages

Backend:
- Django + DRF
- Models for sensor readings, alerts, reports, schedules
- ML inference + rule-based safety override
- Gemini integration with retry/backoff

Database:
- SQLite for local development or PostgreSQL for deployment

Monitored machines (default):
- `PUMP_1`, `PUMP_2`
- `COMP_1`, `COMP_2`
- `VALVE_1`, `VALVE_2`

## 2. Major Features Implemented

1. Prediction engine:
- Accepts live/manual sensor readings
- Returns `HEALTHY` or `FAILURE` with confidence
- Stores latest reading in DB

2. Rule-based breach override:
- Forces `FAILURE` when any configured threshold is breached
- Makes failure decisions deterministic for critical limits

3. Alerts workflow:
- Active Alerts list
- Actions: `Schedule Maintenance`, `Ignore Alert`
- Ignored alerts moved to a dedicated table

4. Maintenance workflow:
- Schedule from alert
- Assign responsible person/team
- Mark maintenance complete
- Cancel maintenance
- Filter schedule table by status

5. History behavior:
- Alert History shows completed maintenance history
- Scheduled alerts move to maintenance table and should not remain active

6. Reports:
- AI-generated reports page
- Per-report remove button
- Backend report delete API
- Improved fallback behavior and text consistency

7. UX and reliability improvements:
- Better timeout/error handling
- Clear success/error status messages
- Faster predict response path

## 3. Active Threshold Rules (Current)

The app now treats a prediction as failure when ANY one condition is breached:
- Temperature `> 91 C`
- Pressure `> 225`
- Vibration `> 0.50`
- Flow rate `< 116`
- Humidity `> 48%`

These rules are enforced in backend safety override logic and reflected in frontend labels/placeholders.

## 4. Data and Decision Flow

1. User submits sensor readings on Predict page.
2. Backend validates/preprocesses input.
3. ML model predicts base label + confidence.
4. Safety override applies threshold logic.
5. Sensor reading is stored.
6. If failure, alert is created.
7. Gemini explanation is generated for prediction response.
8. Report records are created and shown in Reports page.

## 5. Alerts/Maintenance Business Rules

1. Active Alerts should contain unresolved and unscheduled actionable alerts.
2. Scheduling maintenance from an alert:
- Creates maintenance schedule row
- Assigns person/team
- Removes alert from active list (resolved/moved flow)
3. Maintenance Scheduling table:
- Shows pending/completed rows
- Supports complete and cancel actions
4. Alert History:
- Shows completed maintenance outcomes
5. Ignored Alerts:
- Stored separately and shown in bottom ignored-alert table

## 6. Report Generation Behavior

Prediction page:
- Returns immediate AI explanation (optimized for response time)

Reports page:
- Generates and stores report records
- `Remove` action deletes unwanted reports

Gemini resilience:
- Timeout configured
- Retry attempts with backoff
- Fallback logic when Gemini unavailable

Consistency guard:
- Prevents contradictory failure/healthy phrasing in report text when latest reading indicates failure

## 7. API Endpoints (Core)

Auth:
- `POST /api/auth/signup/`
- `POST /api/auth/login/`
- `POST /api/forgot-password/`

Prediction and readings:
- `POST /api/predict/`
- `GET /api/readings/`

Alerts:
- `GET /api/alerts/`
- `GET /api/alerts/history/`
- `GET /api/alerts/ignored/`
- `POST /api/alerts/<alert_id>/resolve/`
- `POST /api/alerts/<alert_id>/ignore/`

Schedules:
- `GET /api/schedules/`
- `POST /api/schedules/`
- `PATCH /api/schedules/<schedule_id>/complete/`
- `DELETE /api/schedules/<schedule_id>/cancel/`

Reports:
- `GET /api/reports/`
- `POST /api/reports/generate/`
- `DELETE /api/reports/<report_id>/`

Health:
- `GET /api/health/`

## 8. Project Structure (Key Files)

Backend:
- `backend/core/models.py`
- `backend/core/views.py`
- `backend/core/urls.py`
- `backend/core/services/alert_manager.py`
- `backend/core/services/report_generator.py`
- `backend/core/ml/processor.py`
- `backend/core/ml/predictor.py`
- `backend/core/ml/trainer.py`
- `backend/core/management/commands/seed_readings_from_csv.py`

Frontend:
- `frontend/src/api/axios.js`
- `frontend/src/pages/Predict.jsx`
- `frontend/src/pages/Alerts.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Reports.jsx`
- `frontend/src/styles/global.css`

## 9. Local Setup (Windows PowerShell)

From project root (`refinery-monitor`):

1. Create venv if needed:
```powershell
python -m venv venv
```

2. Activate venv:
```powershell
.\venv\Scripts\Activate.ps1
```

If execution policy blocks:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

3. Backend install and run:
```powershell
cd backend
pip install -r requirements.txt
python manage.py migrate
python core/ml/trainer.py
python manage.py runserver
```

4. Frontend run:
```powershell
cd ..\frontend
npm install
npm run dev
```

## 10. Environment Variables

Use `backend/.env.example` as template.

Important:
- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `USE_SQLITE`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `DB_SSLMODE`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_TIMEOUT_SECONDS`
- `GEMINI_MAX_RETRIES`
- `GEMINI_RETRY_BACKOFF_SECONDS`
- `SEED_FROM_CSV`

Security note:
- Never commit real API keys/passwords.
- Rotate keys immediately if exposed.

## 11. Deployment Notes (Azure App + VM PostgreSQL)

This project supports app deployment on Azure while DB stays on your own VM.

Set in App Service configuration:
- `USE_SQLITE=False`
- `DB_HOST=<vm-ip-or-dns>`
- `DB_PORT=5432`
- `DB_NAME=<...>`
- `DB_USER=<...>`
- `DB_PASSWORD=<...>`
- `DB_SSLMODE=prefer` (or as per your PostgreSQL setup)
- Gemini variables as above

Ensure VM/network:
- PostgreSQL port `5432` allowed only from trusted Azure outbound IPs
- DB authentication/pg_hba configured correctly

### VM deploy (backend + frontend)

If you host **both** Django API and the Vite frontend on the **same VM**, deploy by pulling latest code and rebuilding the frontend so the website never serves an old dropdown/graph bundle:

```bash
cd /home/azureuser/Refinery-Machine-Health-Moniter
bash deploy_vm.sh
```

### Nginx cache safety (prevents “old UI” after deploy)

If Nginx serves your frontend from `frontend/dist`, ensure `index.html` is **not cached**, otherwise browsers can keep loading an old JS bundle:

```nginx
location = /index.html {
  add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
}
```

CSV seeding:
- Manual:
```bash
python manage.py seed_readings_from_csv --replace
```
- Optional startup:
```bash
SEED_FROM_CSV=true
```

## 12. `deploy.sh` Notes

Current script runs:
- install requirements
- migrate
- collectstatic
- train model
- optional CSV seed

Important:
- If script is inside `backend/`, ensure paths are executed from correct working directory to avoid bad `cd` behavior.

## 13. Troubleshooting

1. `Request timed out` on Predict:
- Backend may be busy or Gemini slow.
- Check backend logs.
- Verify Gemini key and internet access.

2. Alert remains in Active after scheduling:
- Use refresh once.
- Confirm schedule row exists and alert is unresolved+scheduled exclusion logic active.

3. Old report text still visible after fixes:
- Old rows remain in DB.
- Remove old reports and regenerate.

4. PowerShell activation error using `.env\Scripts\Activate`:
- `.env` is env file, not venv folder.
- Use `.\venv\Scripts\Activate.ps1`.

## 14. Validation Commands

Backend health check:
```powershell
cd backend
python manage.py check
```

Frontend production build:
```powershell
cd frontend
npm run build
```

## 15. Git/Release Notes

Recent integrated update includes:
- Alerts workflow rework
- Maintenance scheduling actions and history flow
- Ignored alerts table
- Reports delete action + API
- Threshold alignment to dataset limits
- Predict timeout/performance improvements
- Gemini retry/backoff reliability improvements
- README handover documentation

---

If you are handing this to another developer, this README is the operational source of truth for current behavior and deployment.
