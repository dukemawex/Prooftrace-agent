"""Deterministic provenance, citation checks and conservative demo policy."""
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

CITE = re.compile(r"\[CITE: ([A-Za-z_][\w]*\.[A-Za-z0-9_\-]+)\]")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GuardDecision(StrictModel):
    injection_detected: StrictBool
    reason: str = Field(min_length=1, max_length=600)


class Fact(StrictModel):
    citation: str
    field: str
    value: Any


class Claim(StrictModel):
    text: str = Field(min_length=1, max_length=1200)
    facts: list[Fact] = Field(min_length=1, max_length=15)


class Narrative(StrictModel):
    verdict: Literal["CLEARED", "ESCALATED", "REVIEW"]
    claims: list[Claim] = Field(min_length=2, max_length=10)


class Verification(StrictModel):
    supported: StrictBool
    supported_claims: list[int]
    reason: str = Field(min_length=1, max_length=1000)


def safe_for_model(value: Any) -> Any:
    """Never send a memo (even an apparently benign one) past the guard boundary."""
    if isinstance(value, dict):
        return {k: "[PAYMENT MEMO QUARANTINED; use structured invoice fields]" if k == "payment_memo" else safe_for_model(v)
                for k, v in value.items()}
    if isinstance(value, list):
        return [safe_for_model(v) for v in value]
    return value


def validate_citations(narrative: Narrative, evidence: dict[str, dict]) -> None:
    for claim in narrative.claims:
        citations = set(CITE.findall(claim.text))
        if not citations or citations != {fact.citation for fact in claim.facts}:
            raise ValueError("Every claim must cite exactly its supporting facts")
        if claim.text.count("[CITE:") != len(CITE.findall(claim.text)):
            raise ValueError("Malformed citation")
        for fact in claim.facts:
            row = evidence.get(fact.citation)
            if row is None or fact.field not in row:
                raise ValueError("Citation points to an unobserved record or field")
            if fact.field == "payment_memo":
                raise ValueError("Quarantined memos cannot support a narrative claim")
            if row[fact.field] != fact.value:
                raise ValueError("Claim fact does not match its source row")


def numeric(value: Any) -> Decimal | None:
    """Interpret native Zetaris's string-valued numbers without changing raw rows."""
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def assess(txn: dict, evidence: dict[str, dict], screens: dict[str, list[dict]], joined: bool) -> dict:
    """A transparent demo policy, not a legal sanctions determination.

    The sample is incomplete, so even the clear path is scoped to the demo. An
    identity corroboration and a continuous >=50% chain are needed to escalate.
    """
    chain: list[dict] = []
    seen: set[str] = set()
    entity_id = txn["beneficiary_id"]
    complete = False
    majority = True
    matched: list[str] = []
    ambiguous = False
    valid_path = True
    for _ in range(6):
        if entity_id in seen:
            break
        seen.add(entity_id)
        row = evidence.get(f"icij_kyc_entities.{entity_id}")
        if not row or entity_id not in screens:
            break
        chain.append(row)
        for hit in screens[entity_id]:
            identifiers = [s.strip() for s in re.split(r"[;,|]", hit.get("identifiers", ""))]
            demo_flag = numeric(txn.get("is_demo"))
            corroborated = (bool(row.get("registration_id")) and row["registration_id"] in identifiers
                            and demo_flag in (0, 1) and numeric(hit.get("is_demo")) == demo_flag)
            if majority and corroborated:
                matched.append(hit["record_id"])
            else:
                ambiguous = True
        if not row.get("owner_id"):
            complete = row.get("entity_type") == "Person"
            break
        pct = numeric(row.get("ownership_percent"))
        valid_path = valid_path and pct is not None and 0 < pct <= 100
        majority = majority and valid_path and pct >= 50
        entity_id = row["owner_id"]
    if matched and joined:
        verdict, reason = "ESCALATED", "Corroborated watchlist identity on a continuous majority-ownership path."
    elif (complete and valid_path and joined and not ambiguous and numeric(txn.get("invoice_verified")) == 1
          and numeric(txn.get("invoice_amount_cents")) == numeric(txn["amount_cents"])
          and numeric(txn["amount_cents"]) is not None and numeric(txn["amount_cents"]) > 0
          and numeric(txn.get("is_demo")) == 1):
        verdict, reason = "CLEARED", "Demo invoice matches the wire; all observed owners were screened against the available sample."
    else:
        verdict, reason = "REVIEW", "Evidence is incomplete, ambiguous, or insufficient for the scoped demo clearance rule."
    return {"verdict": verdict, "reason": reason, "chain": [row["record_id"] for row in chain],
            "sanctions_matches": matched, "ownership_complete": complete, "cross_silo_checked": joined,
            "scope": "Demo investigation only. A 300-row sample cannot establish real-world sanctions clearance."}
