"""FastAPI API and live server-sent investigation events."""
import asyncio
import hmac
import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from backend.agent import InvestigationAgent
from backend.config import MODELS, Settings
from backend.services.database import Database
from backend.services.nemotron import ModelUnavailable
from backend.services.zetaris import DataUnavailable


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    database = Database(config)
    locks: dict[str, asyncio.Lock] = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await asyncio.to_thread(database.init_schema)
        yield

    api = FastAPI(title="ProofTrace Agent", version="1.0.0", lifespan=lifespan)
    api.state.database = database
    api.state.settings = config
    api.add_middleware(CORSMiddleware, allow_origins=config.cors_origins,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-ProofTrace-Key"])

    async def authorize(x_prooftrace_key: str = Header(default="")):
        if config.api_key and not hmac.compare_digest(x_prooftrace_key, config.api_key):
            raise HTTPException(401, "Invalid API key")

    @api.get("/api/health")
    async def health():
        try:
            metadata = await asyncio.to_thread(database.metadata)
            counts = await asyncio.to_thread(database.query, "SELECT COUNT(*) AS count FROM aml_transactions")
        except Exception:
            return JSONResponse(status_code=503, content={"status": "database_unavailable"})
        cloud_configured = bool(config.zetaris_api_url and config.zetaris_api_key)
        ready = bool(config.meterless_api_key and counts[0]["count"] and (cloud_configured or config.allow_local_fallback))
        return {
            "status": "ready" if ready else "setup_required", "models": dict(MODELS),
            "meterless": {"configured": bool(config.meterless_api_key), "connectivity": "not_probed"},
            "zetaris": {"configured": cloud_configured, "connectivity": "not_probed",
                        "fallback_enabled": config.allow_local_fallback, "fallback_database": database.backend},
            "seed": metadata, "alert_count": counts[0]["count"],
        }

    @api.get("/api/alerts", dependencies=[Depends(authorize)])
    async def alerts():
        rows = await asyncio.to_thread(database.query, "SELECT * FROM aml_transactions ORDER BY record_id LIMIT 100")
        for row in rows:
            memory = await asyncio.to_thread(database.memory, row["beneficiary_id"])
            row["memory_episodes"] = len(memory)
            row["last_verdict"] = next((m["verdict"] for m in memory if m["txn_id"] == row["record_id"]), None)
        return {"alerts": rows, "seed": await asyncio.to_thread(database.metadata)}

    @api.post("/api/investigate/{txn_id}", dependencies=[Depends(authorize)])
    async def investigate(txn_id: str = Path(pattern=r"^[A-Za-z0-9_-]{1,80}$"), stream: bool = Query(False)):
        if not config.meterless_api_key:
            raise HTTPException(503, "Set METERLESS_API_KEY to run NVIDIA Nemotron investigations")
        if not await asyncio.to_thread(database.query, "SELECT record_id FROM aml_transactions WHERE record_id = ?", (txn_id,)):
            raise HTTPException(404, "Transaction not found")
        lock = locks.setdefault(txn_id, asyncio.Lock())
        if lock.locked():
            raise HTTPException(409, "An investigation of this wire is already running")
        await lock.acquire()

        async def run(emit=None):
            try:
                return await InvestigationAgent(config, database).investigate(txn_id, emit)
            finally:
                lock.release()

        if not stream:
            try:
                return await run()
            except LookupError:
                raise HTTPException(404, "Transaction not found") from None
            except (ModelUnavailable, DataUnavailable) as exc:
                raise HTTPException(503, str(exc)) from None
            except Exception:
                raise HTTPException(502, "Investigation could not be verified; no verdict is available") from None

        async def events():
            queue: asyncio.Queue = asyncio.Queue()

            async def worker():
                try:
                    result = await run(queue.put)
                    await queue.put({"type": "result", "result": result})
                except asyncio.CancelledError:
                    raise
                except (ModelUnavailable, DataUnavailable) as exc:
                    await queue.put({"type": "error", "message": str(exc)})
                except Exception:
                    await queue.put({"type": "error", "message": "Investigation could not be verified; no verdict is available"})
                finally:
                    await queue.put(None)

            task = asyncio.create_task(worker())
            try:
                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=15)
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
                        continue
                    if event is None:
                        break
                    yield f"data: {json.dumps(event, default=str)}\n\n"
            finally:
                if not task.done():
                    task.cancel()
                await asyncio.gather(task, return_exceptions=True)

        return StreamingResponse(events(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache", "X-Accel-Buffering": "no",
        })

    return api


app = create_app()
