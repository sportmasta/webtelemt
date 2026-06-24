#!/bin/sh
set -e

PORT="${PANEL_PORT:-8080}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
