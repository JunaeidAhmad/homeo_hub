#!/usr/bin/env bash
# Render build step for the API (render.yaml: buildCommand). Installs dependencies, collects
# static files, migrates the database and loads reference data, so a plain
# `pip install -r requirements.txt` is not enough.
set -o errexit -o nounset -o pipefail

pip install --upgrade pip
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input
python manage.py seed_locations # reference data; safe to repeat on every deploy
python manage.py seed_roles     # staff roles and their permissions
