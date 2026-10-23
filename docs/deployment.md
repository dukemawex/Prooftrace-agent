# Deploy with Render and Vercel

Run FastAPI on Render, Next.js on Vercel, and store data in PostgreSQL. The browser calls the Next.js API proxy, which forwards requests and the backend shared key to Render. Model and database credentials stay on the backend.

## 1. Create the database

Create a PostgreSQL database on Render or another managed provider. It holds the wire queue, seeded evidence, investigation results, and episodic memory, including when Zetaris serves the evidence queries.

For Render Postgres, put the web service and database in the same region and use its **Internal Database URL** for the backend. Use its **External Database URL** when seeding from your computer or GitHub Actions, with external database access configured for that client. For another provider, use its connection string and required TLS settings.

Do not use the default SQLite file on Render: the service filesystem is ephemeral. Render's free Postgres databases also expire after 30 days; choose database storage that will last through your demo.

## 2. Deploy the backend

In Render, choose **New → Blueprint**, connect `dukemawex/Prooftrace-agent`, and select `main`. Render reads [`render.yaml`](../render.yaml), prompts for `DATABASE_URL`, and generates `PROOFTRACE_API_KEY`. The Blueprint creates one free web service; it does not create a database or seed it.

If creating a web service manually, use these settings:

| Setting | Value |
| --- | --- |
| Language | Python 3 |
| Root directory | Leave blank; use the repository root |
| Build command | `pip install -r requirements.lock.txt` |
| Start command | `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health check path | `/api/health` |

The root `.python-version` selects Python 3.12. Keep one Uvicorn worker because the per-wire investigation lock is local to the process. Deploying only the `backend/` directory omits the root dependencies and breaks package imports.

Add these variables under the Render service's **Environment** settings, then deploy the changes:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Persistent PostgreSQL connection string; required. The Blueprint prompts for it. |
| `PROOFTRACE_API_KEY` | Backend shared secret. The Blueprint generates it; for a manual service, generate one with `python -c "import secrets; print(secrets.token_urlsafe(32))"`. |
| `METERLESS_API_KEY` | Meterless key for the primary NVIDIA Nemotron routes. |
| `METERLESS_BASE_URL` | Defaults to `https://api.meterless.io/v1`. For direct NVIDIA NIM, use `https://integrate.api.nvidia.com/v1` and put the NIM key in `METERLESS_API_KEY`. |
| `OPENROUTER_API_KEY` | Optional NVIDIA Nemotron free-model fallback. An OpenRouter key alone also works. |
| `ZETARIS_API_URL` | Full Zetaris OpenSqlQuery execution endpoint from your instance. |
| `ZETARIS_API_KEY` | Zetaris bearer token. |
| `ALLOW_LOCAL_FALLBACK` | The Blueprint sets `false` to require Zetaris. Set `true` only when you intend to allow the explicitly labelled PostgreSQL fallback. |
| `MONGODB_URI` | Optional separate ownership-data silo; the SQL mirror is always seeded. |

At least one model-provider key is needed for live investigations. All model routes, including the OpenRouter fallback, use NVIDIA Nemotron. Without keys or seeded wires, `/api/health` returns HTTP 200 with `status: "setup_required"`: this lets Render start the service while you finish configuration. A database connection failure produces HTTP 503 or prevents startup. The health endpoint does not validate provider credentials.

Render free web services sleep after 15 minutes without inbound traffic and can take about a minute to wake. Open the service before a recording, or choose an always-on instance. Automatic deploys in the Blueprint wait for GitHub checks to pass.

## 3. Seed the cloud database and connect Zetaris

Use the existing GitHub Actions workflow:

1. In the repository's **Settings → Secrets and variables → Actions**, add `PROOFTRACE_DATABASE_URL` with the database connection string accessible from GitHub Actions. For Render Postgres, this is the external URL, not the internal one. Add `PROOFTRACE_MONGODB_URI` if using MongoDB.
2. Open **Actions → Seed open data and smoke test → Run workflow**, select `main`, enable **seed_cloud**, and run it.
3. Confirm the cloud seed and service checks pass. Ordinary push/PR jobs seed temporary CI databases and do not populate the deployed database.

Alternatively, install `requirements.lock.txt`, configure `DATABASE_URL` in your local environment or ignored root `.env`, and run `python scripts/seed_open_data.py --rows 300`. Use the same database as the deployed backend. The seeder imports 300 real OpenSanctions rows plus the labelled fictional cases; it preserves unrelated records and saved investigations. No OpenSanctions API key is required.

Register the PostgreSQL tables and optional MongoDB collection in your Zetaris catalog. Expose `aml_transactions`, `icij_kyc_entities`, and `opensanctions_watchlist` with the columns defined in `backend/services/database.py`. Set `ZETARIS_AML_TABLE`, `ZETARIS_KYC_TABLE`, and `ZETARIS_SANCTIONS_TABLE` in Render if your catalog uses qualified or different names. Seeding the database does not register these sources in Zetaris.

## 4. Connect the Vercel frontend

Import the same GitHub repository into Vercel. Select **Next.js**, set **Root Directory** to `frontend`, use **Node.js 22.x**, and keep `npm run build` as the build command.

Add these server-side variables to the Vercel environments you intend to deploy:

| Variable | Value |
| --- | --- |
| `BACKEND_URL` | The Render service's public HTTPS origin, copied from its dashboard, with no trailing slash or `/api` suffix. |
| `PROOFTRACE_API_KEY` | Exactly the same value as the Render service's generated key. |

Redeploy Vercel after saving or changing the variables. Never prefix these variables with `NEXT_PUBLIC_`. Model, Zetaris, and database keys belong only on Render; GitHub Actions secrets are separate and are not copied to either hosting provider.

The browser uses the same-origin Next.js proxy, so this setup does not require opening backend CORS to Vercel preview domains. The public Render URL must be reachable from Vercel.

## 5. Check the deployed flow

Open `/api/health` on the Render service and on the Vercel frontend. After seeding and configuring providers, both should report three alerts on a fresh database, `status: "ready"`, and PostgreSQL as the fallback database. `connectivity: "not_probed"` is deliberate; health checks do not spend model credits.

From the Vercel UI, run a live investigation and confirm the execution log contains model calls, Zetaris queries, returned rows, and a cited verdict. Inspect the injection warning for `TXN-9003`. Reload the queue to confirm saved results and episodic memory persist. Demo replay works without a backend, but cannot verify the live deployment.

The Next.js proxy currently allows up to 300 seconds per request. Measure a real investigation, including any cold start and provider fallback; slower runs need a different request-duration setting where supported or a background-job flow. Render hosting alone does not remove that Vercel limit.

The shared key protects direct calls to Render. It does not restrict who can call the public Next.js investigation route. Restrict access to a live deployment using deployment protection or application sign-in before sharing paid model access publicly.

Render references: [Blueprint specification](https://render.com/docs/blueprint-spec), [FastAPI deployment](https://render.com/docs/deploy-fastapi), [Python version selection](https://render.com/docs/python-version), and [free-instance limits](https://render.com/docs/free).
