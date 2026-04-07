#!/bin/bash
set -e

cd backend

if [ ! -f ../venv/bin/activate ]; then
  echo "Python venv not found at ../venv. Creating it now..."
  echo "If this fails on Ubuntu/Debian, install python3-venv: sudo apt-get install -y python3-venv"
  python3 -m venv ../venv
fi

source ../venv/bin/activate
python -m pip install -U pip
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python core/ml/trainer.py

if [ "${SEED_FROM_CSV:-false}" = "true" ]; then
  python manage.py seed_readings_from_csv --replace
fi
