#!/usr/bin/env sh
# GOREBOX needs to be served over http, because it uses ES modules.
# Any static server will do; this is the shortest one that is always around.
PORT="${1:-8080}"
echo "GOREBOX -> http://localhost:$PORT"
python3 -m http.server "$PORT" --bind 0.0.0.0
