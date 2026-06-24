from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.billing.models import Base

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_database(database_url: str) -> None:
    global _engine, _session_factory
    engine_kwargs: dict = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        engine_kwargs["poolclass"] = StaticPool
    _engine = create_async_engine(database_url, **engine_kwargs)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def close_database() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


async def create_tables() -> None:
    if _engine is None:
        raise RuntimeError("База данных не инициализирована")
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def run_migrations() -> None:
    if _engine is None:
        raise RuntimeError("База данных не инициализирована")
    dialect = _engine.dialect.name
    if dialect == "sqlite":
        await create_tables()
        return
    migration_file = Path(__file__).resolve().parent.parent.parent / "migrations" / "001_orders.sql"
    sql = migration_file.read_text(encoding="utf-8")
    async with _engine.begin() as conn:
        for statement in _split_sql(sql):
            await conn.exec_driver_sql(statement)


def _split_sql(sql: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        current.append(line)
        if stripped.endswith(";"):
            parts.append("\n".join(current))
            current = []
    if current:
        parts.append("\n".join(current))
    return parts


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if _session_factory is None:
        raise RuntimeError("База данных не инициализирована")
    async with _session_factory() as session:
        yield session
