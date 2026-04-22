#!/usr/bin/env sh

set -eu

PYTHON_BIN=""

if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python)"
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "Python 3.10+ is required. Create .venv or install a newer Python interpreter." >&2
  exit 1
fi

if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
  PYTHON_VERSION="$("$PYTHON_BIN" -c 'import sys; print(".".join(str(part) for part in sys.version_info[:3]))')"
  echo "Python 3.10+ is required; found $PYTHON_VERSION at $PYTHON_BIN. Create .venv or update PATH to a newer interpreter." >&2
  exit 1
fi

exec "$PYTHON_BIN" "$@"
