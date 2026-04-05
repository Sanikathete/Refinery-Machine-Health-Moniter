#!/bin/bash
set -e

cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python core/ml/trainer.py

if [ "${SEED_FROM_CSV:-false}" = "true" ]; then
  python manage.py seed_readings_from_csv --replace
fi
