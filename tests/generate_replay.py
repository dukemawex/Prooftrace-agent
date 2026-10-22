"""Rebuild the explicitly simulated browser replay from offline, fictional records.

Run: python -m tests.generate_replay
No model/provider requests are made. This utility is never imported by the app.
"""
import asyncio
import hashlib
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from backend.agent import InvestigationAgent
from backend.config import Settings
from backend.services.database import Database
from backend.evidence import Narrative, validate_citations
from scripts.seed_open_data import demo_transactions, seed
from tests.conftest import ScriptedNemotron


async def main():
    snapshots = {}
    for txn in demo_transactions():
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(sqlite_path=f"{directory}/demo.db", database_url="", mongodb_uri="",
                                meterless_api_key="replay-generation-only", openrouter_api_key="",
                                zetaris_api_url="", zetaris_api_key="", allow_local_fallback=True)
            seed(settings, offline=True)
            with patch("backend.agent.Nemotron", ScriptedNemotron):
                result = await InvestigationAgent(settings, Database(settings)).investigate(txn["record_id"])
        evidence = result["evidence"]
        claims = []

        def claim(text, citation, fields):
            claims.append({"text": f"{text} [CITE: {citation}]", "facts": [
                {"citation": citation, "field": field, "value": evidence[citation][field]} for field in fields]})

        claim(f"Meridian Ventures Inc sent ${txn['amount_cents'] / 100:,.0f} USD to {txn['beneficiary_name']} in this fictional case.",
              f"aml_transactions.{txn['record_id']}", ["sender_name", "amount_cents", "beneficiary_name", "is_demo"])
        if txn["record_id"] == "TXN-9001":
            claim("The verified software invoice INV-2026-4481 matches the wire amount of $185,000.",
                  "aml_transactions.TXN-9001", ["invoice_id", "invoice_verified", "invoice_amount_cents"])
            claim("Aurora Software Ltd is registered in Great Britain, with 100% ownership attributed to KYC-ELENA.",
                  "icij_kyc_entities.KYC-AURORA", ["jurisdiction", "owner_id", "ownership_percent"])
            claim("The ownership chain ends at Elena Hartwell, a person with no further owner recorded.",
                  "icij_kyc_entities.KYC-ELENA", ["entity_name", "entity_type", "owner_id"])
        else:
            claim("Cyprus entity Helios Maritime is 51% owned by KYC-ALBA, establishing the first ownership hop.",
                  "icij_kyc_entities.KYC-HELIOS", ["entity_name", "jurisdiction", "ownership_percent", "owner_id"])
            claim("Alba Trade is registered in the UAE and is 100% owned by KYC-VIKTOR, establishing the second hop.",
                  "icij_kyc_entities.KYC-ALBA", ["entity_name", "jurisdiction", "ownership_percent", "owner_id"])
            claim("The ultimate recorded owner is Viktor Rostov, identified by DEMO-PASSPORT-VR01.",
                  "icij_kyc_entities.KYC-VIKTOR", ["entity_name", "registration_id"])
            claim("The same identifier appears in the fictional sanctions fixture. This is a demo match, not a real-world sanctions allegation.",
                  "opensanctions_watchlist.DEMO-SANCTION-VR01", ["identifiers", "is_demo", "datasets"])
        result["claims"] = claims
        validate_citations(Narrative(verdict=result["verdict"], claims=claims), evidence)
        result["run_id"] = f"simulated-{txn['record_id'].lower()}"
        result["created_at"] = "2026-10-22T09:30:00+00:00"
        result["data_source"] = "demo-replay"
        result["memory_episodes_used"] = 0
        result["simulation"] = {"enabled": True, "label": "Simulated replay · fictional fixtures",
                                "model_calls_made": False, "memory_persisted": False}
        result["guard"]["reason"] = ("Simulated guard: an instruction to override sanctions screening was detected in untrusted memo data."
            if result["guard"]["injection_detected"] else "Simulated guard: no injection signature in this fixture; memo remains quarantined.")
        for row in evidence.values():
            if "fetched_at" in row:
                row["fetched_at"] = "2026-10-22T09:00:00+00:00"
        result["evidence_digest"] = hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
        for index, event in enumerate(result["trace"]):
            event["at"] = f"2026-10-22T09:30:{index:02d}+00:00"
            if "provider" in event:
                event["provider"] = "demo-replay"
            if "source" in event:
                event["source"] = "demo-replay"
                event["duration_ms"] = 0
                event["fallback_reason"] = None
            for row in event.get("rows", []):
                if "fetched_at" in row:
                    row["fetched_at"] = "2026-10-22T09:00:00+00:00"
            if event.get("result", {}).get("semantic_verification"):
                event["result"] = {"citations_verified": True, "verification_mode": "static-fixture-citation-check"}
            if event.get("stage") == "guard" and event.get("status") == "completed":
                event["result"] = result["guard"]
        snapshots[txn["record_id"]] = result
    destination = Path(__file__).resolve().parents[1] / "frontend/lib/replay-fixtures.json"
    destination.write_text(json.dumps(snapshots, indent=2) + "\n")
    print(f"Wrote {len(snapshots)} explicitly simulated replays with validated fixture citations.")


if __name__ == "__main__":
    asyncio.run(main())
