import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_PATH = os.environ.get("DB_PATH", "./data/meshsimple.db")

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    # Default rollback-journal mode takes an exclusive lock for the duration
    # of every write, blocking concurrent reads -- with frequent small writes
    # (a telemetry/position packet from any node commits immediately) this
    # can starve reads like /api/nodes for seconds, worse as the node count
    # grows. WAL lets readers proceed against the last-committed snapshot
    # without waiting on in-progress writes.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def run_migrations(eng):
    """Add columns that may not exist in older DB versions."""
    new_columns = [
        "ALTER TABLE nodes ADD COLUMN voltage REAL",
        "ALTER TABLE nodes ADD COLUMN firmware_version VARCHAR",
        "ALTER TABLE messages ADD COLUMN reply_id INTEGER",
        "ALTER TABLE messages ADD COLUMN read_at DATETIME",
        "CREATE TABLE IF NOT EXISTS message_reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER REFERENCES messages(id), node_id VARCHAR, emoji VARCHAR, timestamp DATETIME)",
    ]
    with eng.connect() as conn:
        for stmt in new_columns:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
