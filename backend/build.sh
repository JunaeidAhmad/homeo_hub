#!/usr/bin/env bash
# Render build step for the API (render.yaml: buildCommand). Installs dependencies, collects
# static files, migrates the database and loads reference data, so a plain
# `pip install -r requirements.txt` is not enough.
set -o errexit -o nounset -o pipefail

# manage.py defaults to the local settings; a deploy build must never use them. With the
# production settings a missing variable stops the build and names it.
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

pip install --upgrade pip
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input
python manage.py seed_locations # reference data; safe to repeat on every deploy
python manage.py seed_roles     # staff roles and their permissions
