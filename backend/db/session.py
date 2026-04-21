from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.core.config import get_runtime_settings


class Base(DeclarativeBase):
    pass


runtime_settings = get_runtime_settings()
engine = create_engine(
    runtime_settings.database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_database() -> None:
    from backend.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
