"""Zetaris federation with bounded, application-authored SELECT templates.

Never executes arbitrary model SQL. One investigation pins its backend on the first
query, so a later outage cannot silently mix cloud evidence and a local snapshot.
"""
import asyncio
import json
import re
import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import httpx

from backend.config import Settings
from backend.services.database import Database


class DataUnavailable(RuntimeError):
    pass


@dataclass
class QueryResult:
    sql: str
    executed_sql: str
    rows: list[dict[str, Any]]
    source: str
    duration_ms: int
    fallback_reason: str | None = None
    table: str | None = None

    def as_dict(self) -> dict:
        return vars(self)


def literal(value: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 160 or "\x00" in value:
        raise ValueError("Tool identifiers must contain 1–160 characters")
    return "'" + value.replace("'", "''") + "'"


class Zetaris:
    def __init__(self, settings: Settings, database: Database, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.database = database
        self.transport = transport
        self.source: str | None = None
        self.fallback_reason: str | None = None
        for table in settings.zetaris_tables.values():
            if not re.fullmatch(r"[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*){0,2}", table):
                raise ValueError("Zetaris table mappings must be plain qualified identifiers")

    @staticmethod
    def parse_rows(payload: Any) -> list[dict]:
        # Support row-object gateways and columnar OpenSqlQuery responses.
        if isinstance(payload, dict):
            if payload.get("error") or payload.get("errors"):
                raise DataUnavailable("Zetaris returned a query error")
            if payload.get("hasMore") or payload.get("has_more"):
                raise DataUnavailable("Zetaris response is truncated")
            columns = payload.get("columns") or payload.get("schema")
            for key in ("records", "rows", "data", "result", "results"):
                if key in payload:
                    value = payload[key]
                    if isinstance(value, list) and value and isinstance(value[0], list) and columns:
                        names = [c if isinstance(c, str) else c.get("name") for c in columns]
                        if any(not name for name in names) or any(len(row) != len(names) for row in value):
                            raise DataUnavailable("Invalid Zetaris column metadata")
                        payload = [dict(zip(names, row)) for row in value]
                    else:
                        return Zetaris.parse_rows(value)
                    break
        if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
            raise DataUnavailable("Unsupported Zetaris result envelope; expected rows or columns/data")
        if len(payload) >= 100:
            raise DataUnavailable("Result reached page limit; refusing incomplete evidence")
        if len(json.dumps(payload, default=str)) > 250_000:
            raise DataUnavailable("Query result exceeds evidence size limit")
        return payload

    async def _select(self, sql: str, table: str | None = None) -> QueryResult:
        start = time.monotonic()
        remote_sql = sql
        for logical, physical in self.settings.zetaris_tables.items():
            remote_sql = re.sub(rf"\b(FROM|JOIN)\s+{logical}\b", lambda match: f"{match[1]} {physical}", remote_sql)
        configured = bool(self.settings.zetaris_api_url and self.settings.zetaris_api_key)
        if self.source is None and not configured:
            if not self.settings.allow_local_fallback:
                raise DataUnavailable("Zetaris is not configured and local fallback is disabled")
            self.source = f"{self.database.backend}-fallback"
            self.fallback_reason = "Zetaris credentials are not configured"
        if self.source in (None, "zetaris"):
            try:
                async with httpx.AsyncClient(timeout=self.settings.zetaris_timeout, transport=self.transport) as client:
                    response = await client.post(
                        self.settings.zetaris_api_url,
                        headers={"Authorization": f"Bearer {self.settings.zetaris_api_key}", "requestId": str(uuid4())},
                        json={self.settings.zetaris_query_field: remote_sql, "pageLimit": 100},
                    )
                    response.raise_for_status()
                    rows = self.parse_rows(response.json())
                self.source = "zetaris"
                return QueryResult(sql, remote_sql, rows, "zetaris", int((time.monotonic() - start) * 1000), table=table)
            except (httpx.HTTPError, ValueError, DataUnavailable) as exc:
                # Auth/schema failures must be repaired, never hidden by a local fallback.
                unavailable = isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)) or (
                    isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (429, 502, 503, 504)
                )
                if self.source == "zetaris" or not unavailable or not self.settings.allow_local_fallback:
                    raise DataUnavailable("Zetaris query failed; investigation stopped without changing evidence source") from None
                self.source = f"{self.database.backend}-fallback"
                self.fallback_reason = f"Zetaris unavailable ({type(exc).__name__})"
        try:
            rows = self.parse_rows(await asyncio.to_thread(self.database.query, sql))
        except Exception:
            raise DataUnavailable("Local evidence store is unavailable; run the data seeder") from None
        return QueryResult(sql, sql, rows, self.source, int((time.monotonic() - start) * 1000), self.fallback_reason, table)

    async def transaction(self, txn_id: str) -> QueryResult:
        return await self._select(f"SELECT * FROM aml_transactions WHERE record_id = {literal(txn_id)} LIMIT 1", "aml_transactions")

    async def execute_tool(self, name: str, args: dict, txn_id: str) -> QueryResult:
        if name == "get_transaction_context":
            if args:
                raise ValueError("get_transaction_context accepts no arguments")
            return await self.transaction(txn_id)
        if name == "cross_silo_sanctions_check":
            if args:
                raise ValueError("cross_silo_sanctions_check accepts no arguments")
            # A genuine multi-silo join; detailed canonical rows are fetched by the other tools.
            return await self._select(f"""SELECT t.record_id AS transaction_id,
    b.record_id AS beneficiary_id, b.entity_name AS beneficiary_name,
    b.ownership_percent AS first_hop_percent,
    o.record_id AS owner_id, o.entity_name AS owner_name,
    o.ownership_percent AS second_hop_percent,
    u.record_id AS ubo_id, u.entity_name AS ubo_name,
    s.record_id AS sanction_id, s.name AS sanction_name
FROM aml_transactions t
JOIN icij_kyc_entities b ON b.record_id = t.beneficiary_id
LEFT JOIN icij_kyc_entities o ON o.record_id = b.owner_id
LEFT JOIN icij_kyc_entities u ON u.record_id = o.owner_id
LEFT JOIN opensanctions_watchlist s ON LOWER(s.name) = LOWER(u.entity_name)
WHERE t.record_id = {literal(txn_id)}
LIMIT 50""")
        if name not in {"lookup_entity", "get_owners", "screen_entity"} or set(args) != {"entity_id"}:
            raise ValueError("Unknown tool or invalid arguments")
        entity_id = literal(args["entity_id"])
        if name == "lookup_entity":
            return await self._select(f"SELECT * FROM icij_kyc_entities WHERE record_id = {entity_id} LIMIT 1", "icij_kyc_entities")
        if name == "get_owners":
            return await self._select(f"""SELECT owner.* FROM icij_kyc_entities child
JOIN icij_kyc_entities owner ON owner.record_id = child.owner_id
WHERE child.record_id = {entity_id} LIMIT 50""", "icij_kyc_entities")
        return await self._select(f"""SELECT w.* FROM opensanctions_watchlist w
JOIN icij_kyc_entities e ON LOWER(w.name) = LOWER(e.entity_name)
    OR (w.aliases <> '' AND LOWER(w.aliases) LIKE '%' || LOWER(e.entity_name) || '%')
WHERE e.record_id = {entity_id} LIMIT 100""", "opensanctions_watchlist")


def tool_schema(name: str, description: str, entity: bool = False) -> dict:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": {"entity_id": {"type": "string"}} if entity else {},
                       "required": ["entity_id"] if entity else [], "additionalProperties": False},
    }}


TOOLS = [
    tool_schema("get_transaction_context", "Get the current wire, invoice proof and provenance. Memo is quarantined before delivery."),
    tool_schema("lookup_entity", "Get the canonical KYC row by ID. Follow owner_id until a natural person or incomplete graph.", True),
    tool_schema("get_owners", "Fetch canonical direct-owner KYC rows by child entity ID. Repeat for multi-hop ownership.", True),
    tool_schema("screen_entity", "Screen an entity against the available watchlist sample by name/aliases. A negative result is limited to this sample.", True),
    tool_schema("cross_silo_sanctions_check", "Execute a two-hop federated SQL join across AML transactions, KYC ownership and sanctions. Always call once."),
]
