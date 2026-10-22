"""Portable SQL state store and explicitly labelled federated fallback."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import ROOT, Settings

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS aml_transactions (
        record_id TEXT PRIMARY KEY, timestamp TEXT NOT NULL,
        sender_name TEXT NOT NULL, sender_country TEXT NOT NULL,
        beneficiary_id TEXT NOT NULL, beneficiary_name TEXT NOT NULL,
        beneficiary_country TEXT NOT NULL, amount_cents BIGINT NOT NULL,
        currency TEXT NOT NULL, payment_memo TEXT NOT NULL,
        invoice_id TEXT, invoice_amount_cents BIGINT, invoice_verified INTEGER NOT NULL,
        alert_reason TEXT NOT NULL, typology TEXT NOT NULL,
        source_dataset TEXT NOT NULL, source_url TEXT NOT NULL, is_demo INTEGER NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS icij_kyc_entities (
        record_id TEXT PRIMARY KEY, entity_name TEXT NOT NULL,
        entity_type TEXT NOT NULL, jurisdiction TEXT NOT NULL,
        registration_id TEXT NOT NULL, owner_id TEXT,
        ownership_percent REAL, verified_at TEXT NOT NULL,
        source_dataset TEXT NOT NULL, source_url TEXT NOT NULL, is_demo INTEGER NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS opensanctions_watchlist (
        record_id TEXT PRIMARY KEY, name TEXT NOT NULL, schema_type TEXT NOT NULL,
        aliases TEXT NOT NULL, countries TEXT NOT NULL, datasets TEXT NOT NULL,
        identifiers TEXT NOT NULL, source_url TEXT NOT NULL,
        fetched_at TEXT NOT NULL, is_demo INTEGER NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS entity_risk_memory (
        record_id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, txn_id TEXT NOT NULL,
        verdict TEXT NOT NULL, claims_json TEXT NOT NULL,
        evidence_digest TEXT NOT NULL, created_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS memory_entity_idx ON entity_risk_memory(entity_id, created_at)",
    """CREATE TABLE IF NOT EXISTS investigation_runs (
        record_id TEXT PRIMARY KEY, txn_id TEXT NOT NULL,
        result_json TEXT NOT NULL, created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS seed_metadata (
        record_id TEXT PRIMARY KEY, value_json TEXT NOT NULL
    )""",
)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.is_postgres = bool(settings.database_url)
        path = Path(settings.sqlite_path)
        self.path = path if path.is_absolute() else ROOT / path

    @property
    def backend(self) -> str:
        return "postgres" if self.is_postgres else "sqlite"

    @contextmanager
    def connection(self):
        if self.is_postgres:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            conn = psycopg2.connect(self.settings.database_url, cursor_factory=RealDictCursor, connect_timeout=10)
        else:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.path, timeout=15)
            conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_schema(self) -> None:
        with self.connection() as conn:
            cursor = conn.cursor()
            for statement in SCHEMA:
                cursor.execute(statement)

    def query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        # Only application-authored SQL reaches this method.
        with self.connection() as conn:
            cursor = conn.cursor()
            if params:
                cursor.execute(sql.replace("?", "%s") if self.is_postgres else sql, params)
            else:
                cursor.execute(sql)
            return [dict(row) for row in cursor.fetchall()]

    def upsert(self, table: str, rows: list[dict[str, Any]]) -> None:
        allowed = {"aml_transactions", "icij_kyc_entities", "opensanctions_watchlist", "entity_risk_memory", "investigation_runs", "seed_metadata"}
        if table not in allowed:
            raise ValueError("Unknown table")
        if not rows:
            return
        columns = list(rows[0])
        if not all(column.replace("_", "").isalnum() for column in columns):
            raise ValueError("Invalid column")
        marker = "%s" if self.is_postgres else "?"
        sql = (f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join([marker] * len(columns))}) "
               f"ON CONFLICT(record_id) DO UPDATE SET " + ", ".join(f"{c}=excluded.{c}" for c in columns if c != "record_id"))
        with self.connection() as conn:
            conn.cursor().executemany(sql, [tuple(row[c] for c in columns) for row in rows])

    def memory(self, entity_id: str) -> list[dict]:
        rows = self.query("SELECT * FROM entity_risk_memory WHERE entity_id = ? ORDER BY created_at DESC LIMIT 5", (entity_id,))
        for row in rows:
            row["claims"] = json.loads(row.pop("claims_json"))
        return rows

    def metadata(self) -> dict:
        rows = self.query("SELECT value_json FROM seed_metadata WHERE record_id = ?", ("latest",))
        return json.loads(rows[0]["value_json"]) if rows else {}
