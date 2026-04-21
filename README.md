# Local Karaoke Prep Pipeline

Local-first karaoke prep app for a single power user. The stack is a FastAPI backend, a React frontend, a polling worker, SQLite metadata, and filesystem-backed media storage. Product direction and roadmap live in [local_karaoke_web_app_project_brief.md](/Users/samuel/Documents/Projects/karaokeproject/local_karaoke_web_app_project_brief.md).

## Repo layout

- `backend/`: API, worker, adapters for FFmpeg, `audio-separator`, and `yt-dlp`, plus import, run, export, and settings logic.
- `frontend/`: React + Vite dashboard for import, library, run review, preview, diagnostics, and settings.
- `data/`: local uploads, outputs, exports, logs, temp files, and model cache.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
pip install -e ".[processing]"
npm install
brew install ffmpeg yt-dlp
npm run dev
```

The frontend runs on `http://127.0.0.1:5173` and proxies API traffic to `http://127.0.0.1:8000`.

`npm run dev`, `npm run dev:api`, and `npm run dev:worker` prefer `.venv/bin/python` automatically and fall back to `python3` when needed.

## Current scope

The app currently supports:

- local file import
- YouTube video and playlist resolve, review, and confirm flow
- duplicate-aware track reuse
- repeatable per-track processing runs with stored config
- instrumental and vocal preview
- WAV, MP3, metadata, and ZIP export
- local diagnostics and editable settings

Playlist imports stay explicit: nothing is added to the library until review is confirmed.

## Notes

- The worker expects `ffmpeg`, `ffprobe`, `audio-separator`, and `yt-dlp` on your path.
- Processing profiles expose official `audio-separator` model filenames, and each run stores the chosen model and MP3 bitrate for reproducibility.
- This app is for media you own, license, or are otherwise authorized to process.
