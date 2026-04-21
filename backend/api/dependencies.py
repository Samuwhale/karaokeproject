from collections.abc import Generator

from sqlalchemy.orm import Session

from backend.core.config import RuntimeSettings, get_runtime_settings
from backend.db.session import SessionLocal


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_settings_dependency() -> RuntimeSettings:
    return get_runtime_settings()
