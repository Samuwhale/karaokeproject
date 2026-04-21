from __future__ import annotations

import time

from backend.core.config import get_runtime_settings
from backend.db.session import SessionLocal, init_database
from backend.services.tracks import claim_next_run
from backend.workers.processor import process_run


def main() -> None:
    runtime_settings = get_runtime_settings()
    runtime_settings.ensure_directories()
    init_database()

    while True:
        with SessionLocal() as session:
            run = claim_next_run(session)
            if run is not None:
                session.commit()
                process_run(session, runtime_settings, run)
        time.sleep(runtime_settings.worker_poll_interval_seconds)


if __name__ == "__main__":
    main()
