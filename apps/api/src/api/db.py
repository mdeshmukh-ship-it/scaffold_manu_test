from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from api.logging_config import get_logger, reset_operation_name, set_operation_name
from api.models import Base
from api.settings import AppSettings, get_settings

logger = get_logger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_connector: Any | None = None


@dataclass
class DBOperation:
    name: str
    session: AsyncSession
    query_count: int = 0


def _to_sync_sqlite_url(async_url: str) -> str:
    return async_url.replace("sqlite+aiosqlite://", "sqlite://", 1)


def _bootstrap_sqlite_schema_if_needed(database_url: str) -> None:
    if not database_url.startswith("sqlite+aiosqlite://"):
        return
    sync_engine = create_engine(_to_sync_sqlite_url(database_url), future=True)
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()


def _build_engine(settings: AppSettings) -> AsyncEngine:
    global _connector
    if settings.cloud_sql_instance_connection_name:
        from google.cloud.sql.connector import Connector, IPTypes

        connection_name = settings.cloud_sql_instance_connection_name
        if not connection_name:
            raise RuntimeError("Missing Cloud SQL instance connection name.")

        _connector = Connector(ip_type=IPTypes.PUBLIC)

        async def get_conn() -> Any:
            return await _connector.connect_async(
                connection_name,
                driver="asyncpg",
                user=settings.cloud_sql_db_user,
                password=settings.cloud_sql_db_password,
                db=settings.cloud_sql_db_name,
                enable_iam_auth=settings.cloud_sql_iam_auth,
            )

        return create_async_engine(
            "postgresql+asyncpg://",
            async_creator=get_conn,
            pool_pre_ping=True,
        )

    return create_async_engine(
        settings.database_url,
        echo=settings.database_echo,
        pool_pre_ping=True,
    )


def init_db(settings: AppSettings | None = None) -> None:
    global _engine
    global _session_factory
    if _engine is not None and _session_factory is not None:
        return

    config = settings or get_settings()
    _bootstrap_sqlite_schema_if_needed(config.database_url)
    _engine = _build_engine(config)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


def get_engine() -> AsyncEngine:
    if _engine is None:
        init_db()
    engine = _engine
    if engine is None:
        raise RuntimeError("Database engine is not initialized.")
    return engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        init_db()
    session_factory = _session_factory
    if session_factory is None:
        raise RuntimeError("Database session factory is not initialized.")
    return session_factory


@asynccontextmanager
async def operation(name: str) -> AsyncIterator[DBOperation]:
    session_factory = get_session_factory()
    session = session_factory()
    counter = {"count": 0}

    @event.listens_for(session.sync_session, "do_orm_execute")
    def count_orm_queries(_execute_state) -> None:  # type: ignore[no-untyped-def]
        counter["count"] += 1

    op = DBOperation(name=name, session=session)
    token = set_operation_name(name)
    started = time.perf_counter()
    try:
        yield op
        op.query_count = counter["count"]
        logger.info(
            "db operation completed",
            event_type="db.operation",
            severity="INFO",
            op=name,
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
            ok=True,
            query_count=op.query_count,
        )
    except Exception as exc:
        op.query_count = counter["count"]
        if session.in_transaction():
            await session.rollback()
        logger.error(
            "db operation failed",
            event_type="db.operation",
            severity="ERROR",
            op=name,
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
            ok=False,
            query_count=op.query_count,
            error_type=exc.__class__.__name__,
            error_message=str(exc)[:256],
        )
        raise
    finally:
        await session.close()
        reset_operation_name(token)


async def dispose_db() -> None:
    global _engine
    global _session_factory
    global _connector

    if _engine is not None:
        await _engine.dispose()
    if _connector is not None:
        _connector.close()
    _engine = None
    _session_factory = None
    _connector = None
