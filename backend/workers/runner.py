from __future__ import annotations

import signal
import time

from backend.core.config import get_runtime_settings
from backend.db.session import SessionLocal, init_database
from backend.services.tracks import claim_next_run, recover_orphaned_runs
from backend.workers.processor import process_run


shutdown_requested = False


def _handle_shutdown(_signum: int, _frame: object) -> None:
    global shutdown_requested
    if shutdown_requested:
        return
    shutdown_requested = True
    print("[worker] shutdown requested, exiting after current poll", flush=True)


def main() -> None:
    runtime_settings = get_runtime_settings()
    runtime_settings.ensure_directories()
    init_database()

    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    with SessionLocal() as session:
        recovered = recover_orphaned_runs(session)
        if recovered:
            print(f"[worker] recovered {recovered} orphaned run(s) from previous session", flush=True)

    while not shutdown_requested:
        with SessionLocal() as session:
            run = claim_next_run(session)
            if run is not None:
                session.commit()
                process_run(session, runtime_settings, run)
        if shutdown_requested:
            break
        time.sleep(runtime_settings.worker_poll_interval_seconds)


if __name__ == "__main__":
    main()
