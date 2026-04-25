# StemStudio

StemStudio is a local-first stem separation and mixing tool. It imports songs from local files or YouTube, creates stem runs in the background, lets you choose the best output, and exports the mix or stems you need.

## Local Setup

Install the JavaScript workspace dependencies:

```sh
npm install
```

Create a Python virtual environment and install the backend package:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e .
```

Install optional processing dependencies when you want real stem separation:

```sh
.venv/bin/python -m pip install -e '.[processing]'
```

Install optional YouTube and audio tooling on the machine:

```sh
brew install ffmpeg yt-dlp
```

## Development

Run the API, worker, and Vite frontend together:

```sh
npm run dev
```

Useful checks:

```sh
npm run lint
npm run typecheck
npm run build
```

Runtime data stays under `data/` and is intentionally ignored except for `.gitkeep` files that preserve the folder structure.
