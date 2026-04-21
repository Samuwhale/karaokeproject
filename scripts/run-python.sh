#!/usr/bin/env sh

set -eu

if [ -x ".venv/bin/python" ]; then
  exec ".venv/bin/python" "$@"
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$@"
fi

exec python "$@"
