"""Environment configuration. All model IDs are fixed NVIDIA Nemotron routes."""
import os
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

MODELS = MappingProxyType({
    "guard": "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "planner": "nvidia/llama-3.3-nemotron-super-49b-v1",
    "synthesizer": "nvidia/llama-3.1-nemotron-70b-instruct",
})
OPENROUTER_MODELS = MappingProxyType({
    "guard": "nvidia/nemotron-3.5-lightning:free",
    "planner": "nvidia/nemotron-3-super-120b-a12b:free",
    "synthesizer": "nvidia/nemotron-3-ultra-550b-a55b:free",
})
OPENROUTER_MODEL = OPENROUTER_MODELS["planner"]
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


@dataclass(frozen=True)
class Settings:
    meterless_base_url: str = field(default_factory=lambda: os.getenv("METERLESS_BASE_URL", "https://api.meterless.io/v1"))
    meterless_api_key: str = field(default_factory=lambda: os.getenv("METERLESS_API_KEY", ""))
    openrouter_api_key: str = field(default_factory=lambda: os.getenv("OPENROUTER_API_KEY", ""))
    model_timeout: float = field(default_factory=lambda: float(os.getenv("MODEL_TIMEOUT_SECONDS", "90")))
    zetaris_api_url: str = field(default_factory=lambda: os.getenv("ZETARIS_API_URL", ""))
    zetaris_api_key: str = field(default_factory=lambda: os.getenv("ZETARIS_API_KEY", ""))
    zetaris_query_field: str = field(default_factory=lambda: os.getenv("ZETARIS_QUERY_FIELD", "select"))
    zetaris_timeout: float = field(default_factory=lambda: float(os.getenv("ZETARIS_TIMEOUT_SECONDS", "15")))
    allow_local_fallback: bool = field(default_factory=lambda: os.getenv("ALLOW_LOCAL_FALLBACK", "true").lower() == "true")
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", ""))
    sqlite_path: str = field(default_factory=lambda: os.getenv("SQLITE_PATH", str(ROOT / "data/prooftrace.db")))
    mongodb_uri: str = field(default_factory=lambda: os.getenv("MONGODB_URI", ""))
    mongodb_database: str = field(default_factory=lambda: os.getenv("MONGODB_DATABASE", "prooftrace"))
    api_key: str = field(default_factory=lambda: os.getenv("PROOFTRACE_API_KEY", ""))
    cors_origins: list[str] = field(default_factory=lambda: os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","))
    zetaris_tables: dict[str, str] = field(default_factory=lambda: {
        "aml_transactions": os.getenv("ZETARIS_AML_TABLE", "aml_transactions"),
        "icij_kyc_entities": os.getenv("ZETARIS_KYC_TABLE", "icij_kyc_entities"),
        "opensanctions_watchlist": os.getenv("ZETARIS_SANCTIONS_TABLE", "opensanctions_watchlist"),
    })

    @property
    def models_configured(self) -> bool:
        return bool(self.meterless_api_key or self.openrouter_api_key)
