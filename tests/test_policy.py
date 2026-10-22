from backend.evidence import assess


def bundle(database, txn_id):
    txn = database.query("SELECT * FROM aml_transactions WHERE record_id = ?", (txn_id,))[0]
    entities = database.query("SELECT * FROM icij_kyc_entities")
    evidence = {f"icij_kyc_entities.{row['record_id']}": row for row in entities}
    watchlist = database.query("SELECT * FROM opensanctions_watchlist")
    screens = {row["record_id"]: [hit for hit in watchlist if hit["name"] == row["entity_name"]] for row in entities}
    return txn, evidence, screens


def test_native_numeric_strings_keep_corroborated_identity_semantics(database):
    txn, evidence, screens = bundle(database, "TXN-9002")
    for row in [txn, *evidence.values(), *screens["KYC-VIKTOR"]]:
        for key, value in row.items():
            if isinstance(value, (int, float)):
                row[key] = str(value)
    assert assess(txn, evidence, screens, True)["verdict"] == "ESCALATED"
    screens["KYC-VIKTOR"][0]["is_demo"] = "0"
    assert assess(txn, evidence, screens, True)["verdict"] == "REVIEW"


def test_incomplete_cycle_and_invalid_percentages_cannot_clear(database):
    txn, evidence, screens = bundle(database, "TXN-9001")
    assert assess(txn, evidence, screens, True)["verdict"] == "CLEARED"
    evidence["icij_kyc_entities.KYC-AURORA"]["ownership_percent"] = None
    assert assess(txn, evidence, screens, True)["verdict"] == "REVIEW"
    evidence["icij_kyc_entities.KYC-AURORA"]["ownership_percent"] = 100
    evidence["icij_kyc_entities.KYC-ELENA"]["owner_id"] = "KYC-AURORA"
    assert assess(txn, evidence, screens, True)["verdict"] == "REVIEW"


def test_name_only_hit_and_nonmajority_path_require_review(database):
    txn, evidence, screens = bundle(database, "TXN-9002")
    evidence["icij_kyc_entities.KYC-HELIOS"]["ownership_percent"] = 49
    assert assess(txn, evidence, screens, True)["verdict"] == "REVIEW"
    evidence["icij_kyc_entities.KYC-HELIOS"]["ownership_percent"] = 51
    screens["KYC-VIKTOR"][0]["identifiers"] = "different-identity"
    assert assess(txn, evidence, screens, True)["verdict"] == "REVIEW"
