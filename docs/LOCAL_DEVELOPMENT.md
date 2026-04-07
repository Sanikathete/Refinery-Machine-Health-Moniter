# Local Development (Windows PowerShell)

From the repo root (`refinery-monitor`):

## Backend

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
cd backend
pip install -r requirements.txt
python manage.py migrate
python core/ml/trainer.py
python manage.py runserver
```

## Frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

## Configure frontend API base URL

Set `VITE_API_BASE_URL` in `frontend/.env` (example):

```text
VITE_API_BASE_URL=http://localhost:8000/api/
```

