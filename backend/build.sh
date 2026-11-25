#!/usr/bin/env bash
# Render build step for the API.
set -o errexit -o nounset -o pipefail

pip install --upgrade pip
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input
python manage.py seed_locations # reference data; safe to repeat on every deploy
