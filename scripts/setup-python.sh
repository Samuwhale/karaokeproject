#!/usr/bin/env sh

set -eu

find_python() {
  for candidate in python3.13 python3.12 python3.11 python3.10 python3 python; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi
    binary="$(command -v "$candidate")"
    if "$binary" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
      printf '%s\n' "$binary"
      return 0
    fi
  done
  return 1
}

PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
  if ! PYTHON_BIN="$(find_python)"; then
    echo "Python 3.10+ is required. Install Python 3.10 or newer, then rerun npm run setup:python." >&2
    exit 1
  fi
fi

if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; then
  PYTHON_VERSION="$("$PYTHON_BIN" -c 'import sys; print(".".join(str(part) for part in sys.version_info[:3]))')"
  echo "Python 3.10+ is required; found $PYTHON_VERSION at $PYTHON_BIN." >&2
  exit 1
fi

"$PYTHON_BIN" -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e .
