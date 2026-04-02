#!/bin/bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python core/ml/trainer.py
