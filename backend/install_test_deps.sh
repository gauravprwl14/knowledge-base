#!/bin/bash
# Install test dependencies

VENV_PATH="/Users/gauravporwal/Sites/projects/rnd/voice-app/backend/venv"
BACKEND_PATH="/Users/gauravporwal/Sites/projects/rnd/voice-app/backend"

cd "$BACKEND_PATH"

# Install test dependencies
"$VENV_PATH/bin/python" -m pip install -r requirements-test.txt

echo "Dependencies installed successfully"
