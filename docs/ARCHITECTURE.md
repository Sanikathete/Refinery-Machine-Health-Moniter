# Architecture Overview

## Frontend (React + Vite)

Pages:
- Dashboard: live telemetry charts for a selected machine
- Predict: submit readings and get AI prediction + local history
- Alerts: active alerts, ignore/resolve/schedule flows
- Reports: generate AI maintenance reports per machine

API client:
- `frontend/src/api/axios.js` adds auth token headers and normalizes errors.

## Backend (Django + DRF)

Core endpoints:
- `POST /api/predict/` prediction + storage
- `GET /api/readings/` readings list (optionally filtered by `machine_id`)
- `GET /api/alerts/` and related alert workflow endpoints
- `GET/POST/DELETE /api/reports/` report workflow endpoints

Data model highlights:
- `SensorReading` stores the telemetry snapshot
- `Alert` links to `SensorReading` and tracks resolution state
- `MaintenanceReport` stores AI/fallback report output
- `MaintenanceSchedule` tracks scheduled work

## Serving on a VM (typical)

- Nginx serves `frontend/dist` at `/`
- Nginx reverse-proxies Django API under `/api/`

