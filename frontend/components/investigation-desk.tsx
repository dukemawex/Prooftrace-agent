"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDot,
  Clock3,
  Database,
  Download,
  Fingerprint,
  GitBranch,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Square,
  Terminal,
  Waypoints,
  X,
} from "lucide-react";
import type {
  Alert,
  Health,
  Investigation,
  Row,
  TraceEvent,
} from "@/lib/types";

const stages = [
  {
    key: "guard",
    number: "01",
    title: "Guard & triage",
    size: "NANO · 8B",
    icon: ShieldCheck,
    model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
    description: "Inspect the memo. Quarantine untrusted instructions.",
  },
  {
    key: "planner",
    number: "02",
    title: "Follow the evidence",
    size: "SUPER · 49B",
    icon: GitBranch,
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    description: "Trace ownership across silos. Test the sanctions hypothesis.",
  },
  {
    key: "synthesizer",
    number: "03",
    title: "Explain. Then verify.",
    size: "NEMOTRON · 70B",
    icon: Fingerprint,
    model: "nvidia/llama-3.1-nemotron-70b-instruct",
    description:
      "Build a cited narrative. Check every claim against its source.",
  },
];
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

async function readJSON(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "The request failed.");
  return data;
}

function CitationText({
  text,
  select,
}: {
  text: string;
  select: (id: string) => void;
}) {
  return (
    <>
      {text
        .split(/(\[CITE: [A-Za-z_][\w]*\.[A-Za-z0-9_-]+\])/g)
        .map((part, i) => {
          const match = part.match(/^\[CITE: (.+)\]$/);
          return match ? (
            <button
              className="citation"
              key={i}
              onClick={() => select(match[1])}
              title="Inspect the supporting database row"
            >
              {part}
            </button>
          ) : (
            <span key={i}>{part}</span>
          );
        })}
    </>
  );
}

function QueryCard({ event }: { event: TraceEvent }) {
  return (
    <details className="query-card">
      <summary>
        <span className="query-icon">
          <Terminal size={13} />
        </span>
        <span>{event.tool?.replaceAll("_", " ")}</span>
        <span className="query-count">{event.rows?.length ?? 0} rows</span>
        <ChevronDown size={12} />
      </summary>
      <div className="query-body">
        <div className="query-source">
          <span>{event.source}</span>
          <span>{event.duration_ms} ms</span>
        </div>
        {event.fallback_reason && (
          <p className="fallback-note">{event.fallback_reason}</p>
        )}
        <pre className="sql">{event.executed_sql}</pre>
        <p className="micro-label">RETURNED ROWS · UNTRUSTED SOURCE DATA</p>
        <pre className="raw-json">{JSON.stringify(event.rows, null, 2)}</pre>
      </div>
    </details>
  );
}

function RawRow({ row }: { row: Row }) {
  return (
    <dl className="raw-row">
      {Object.entries(row).map(([field, value]) => (
        <div key={field}>
          <dt>{field}</dt>
          <dd>{value === null ? <em>null</em> : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function InvestigationDesk() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState("TXN-9002");
  const [results, setResults] = useState<Record<string, Investigation>>({});
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCitation, setActiveCitation] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const result = results[selected];
  const active = alerts.find((alert) => alert.record_id === selected);
  const trace = busy ? events : result?.trace || events;
  const queryCount = trace.filter((event) => event.type === "query").length;

  const refresh = useCallback(async () => {
    try {
      const [queue, status] = await Promise.all([
        fetch("/api/alerts", { cache: "no-store" }).then(readJSON),
        fetch("/api/health", { cache: "no-store" }).then(readJSON),
      ]);
      setAlerts(queue.alerts);
      setHealth(status);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load the workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), 30_000);
    return () => {
      clearInterval(poll);
      controller.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setElapsed((time) => time + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  function choose(id: string) {
    if (!busy) {
      setSelected(id);
      setEvents([]);
      setActiveCitation("");
      setError("");
    }
  }
  function selectCitation(id: string) {
    setActiveCitation(id);
    requestAnimationFrame(() =>
      evidenceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      }),
    );
  }
  function exportEvidence() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `prooftrace-${selected}-${result.run_id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function investigate() {
    if (!active || busy) return;
    const txnId = selected;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setEvents([]);
    setError("");
    setActiveCitation("");
    setElapsed(0);
    setResults((previous) => {
      const next = { ...previous };
      delete next[txnId];
      return next;
    });
    let finished = false;
    try {
      const response = await fetch(
        `/api/investigate/${encodeURIComponent(txnId)}?stream=true`,
        { method: "POST", signal: abort.signal },
      );
      if (!response.ok) await readJSON(response);
      if (!response.body)
        throw new Error("The server did not return an investigation stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const packets = pending.split("\n\n");
        pending = packets.pop() || "";
        for (const packet of packets) {
          const data = packet
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .join("\n");
          if (!data) continue;
          const event = JSON.parse(data);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "result") {
            setResults((previous) => ({ ...previous, [txnId]: event.result }));
            finished = true;
          } else setEvents((previous) => [...previous, event]);
        }
      }
      if (!finished)
        throw new Error(
          "The stream ended before a verified verdict was returned. Run the investigation again.",
        );
      await refresh();
    } catch (err) {
      setError(
        abort.signal.aborted
          ? "Investigation stopped. No unverified verdict is displayed."
          : err instanceof Error
            ? err.message
            : "Investigation failed.",
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="ProofTrace home">
          <span className="brand-mark">
            <Waypoints size={25} strokeWidth={1.7} />
          </span>
          <span>
            proof<span className="brand-light">trace</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-divider" />
        <span className="workspace-label">INVESTIGATION WORKSPACE</span>
        <div className="provider-badges">
          <span
            className="provider-badge"
            title={
              health?.meterless.configured
                ? "Credentials configured; live connectivity is checked during investigation"
                : "Add METERLESS_API_KEY to connect"
            }
          >
            <span
              className={`status-dot ${health?.meterless.configured ? "green" : "amber"}`}
            />
            <span>
              Powered by <b>NVIDIA Nemotron</b> via Meterless
            </span>
          </span>
          <span
            className="provider-badge"
            title={
              health?.zetaris.configured
                ? "Cloud credentials configured"
                : "Using the local federated fallback"
            }
          >
            <Database size={12} />
            <span>
              Data Federated by <b>Zetaris</b>
            </span>
            <span className="badge-mode">
              {health?.zetaris.configured ? "CONFIGURED" : "LOCAL"}
            </span>
          </span>
        </div>
      </header>

      <main>
        <section className="workspace-heading">
          <div>
            <div className="eyebrow">
              <span className="tiny-line" /> THE AGENT THAT CAN EXPLAIN WHY
            </div>
            <h1>
              Every verdict has a <span>paper trail.</span>
            </h1>
            <p>Follow the models. Inspect the queries. Verify the evidence.</p>
          </div>
          <div className="hackathon-stamp">
            <span>GENAI.WORKS · 2026</span>
            <strong>
              Open Agent Hackathon <ArrowUpRight size={13} />
            </strong>
            <span>
              TRACK 02 <span className="stamp-dot">/</span> GLASS-BOX
              INTELLIGENCE
            </span>
          </div>
        </section>

        <div className="workspace-status">
          <span>
            <span className={`status-dot ${busy ? "green pulse" : "muted"}`} />
            {busy ? "Investigation in progress" : "Workspace ready"}
          </span>
          <span className="status-separator">/</span>
          <span>
            {health?.seed.live_rows_stored ?? "—"} live OpenSanctions records
          </span>
          <span className="status-separator">/</span>
          <span className="demo-label">FICTIONAL DEMO ALERTS</span>
          <span className="status-right">
            <Clock3 size={12} />{" "}
            {busy ? `${elapsed}s elapsed` : "Evidence before inference"}
          </span>
        </div>
        {error && (
          <div role="alert" className="error-banner">
            <ShieldAlert size={17} />
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="investigation-grid">
          <section className="panel queue-panel" aria-labelledby="queue-title">
            <div className="panel-heading">
              <div>
                <span className="panel-number">01</span>
                <h2 id="queue-title">Flagged wires</h2>
              </div>
              <span className="count-badge">
                {alerts.length.toString().padStart(2, "0")}
              </span>
            </div>
            <div className="queue-subheading">
              <span>
                <span className="status-dot amber" /> REVIEW QUEUE
              </span>
              <button
                onClick={() => void refresh()}
                disabled={busy}
                aria-label="Refresh alerts"
              >
                <RefreshCw size={13} />
              </button>
            </div>
            <div className="queue-list">
              {loading && (
                <div className="loading-state">
                  <Loader2 className="spin" size={18} /> Loading flagged wires…
                </div>
              )}
              {!loading && !alerts.length && (
                <div className="empty-queue">
                  <Database size={24} />
                  <p>No wires loaded.</p>
                  <small>Run the data seeder to open the demo workspace.</small>
                </div>
              )}
              {alerts.map((alert, i) => (
                <button
                  key={alert.record_id}
                  className={`wire-card ${selected === alert.record_id ? "selected" : ""}`}
                  onClick={() => choose(alert.record_id)}
                  disabled={busy}
                  aria-pressed={selected === alert.record_id}
                >
                  <div className="wire-top">
                    <span>{alert.record_id}</span>
                    <span
                      className={`risk-chip ${i === 0 ? "neutral" : i === 2 ? "purple" : "orange"}`}
                    >
                      {i === 0
                        ? "THRESHOLD"
                        : i === 2
                          ? "ADVERSARIAL"
                          : "OWNERSHIP"}
                    </span>
                  </div>
                  <div className="wire-amount">
                    {money(alert.amount_cents)}
                    <span>{alert.currency}</span>
                  </div>
                  <h3>{alert.beneficiary_name}</h3>
                  <div className="wire-route">
                    {alert.sender_country} <ArrowRight size={11} />{" "}
                    {alert.beneficiary_country}
                    <span className="wire-verdict">
                      {results[alert.record_id]?.verdict ||
                        alert.last_verdict ||
                        "Awaiting review"}
                    </span>
                  </div>
                  {selected === alert.record_id && (
                    <div className="selected-marker" />
                  )}
                </button>
              ))}
            </div>
            <div className="memory-card">
              <div>
                <Layers3 size={16} />
                <strong>Episodic memory</strong>
                <span className="memory-count">
                  {active?.memory_episodes ?? 0}
                </span>
              </div>
              <p>
                {active?.memory_episodes
                  ? `${active.memory_episodes} prior episodes for this beneficiary. Evidence is always checked again.`
                  : "A clean slate for this beneficiary. Verified investigations become future context."}
              </p>
              <span className="micro-label">CONTEXT, NEVER A SHORTCUT</span>
            </div>
            <div className="queue-footer">
              <ShieldCheck size={14} />
              <p>
                Three fictional scenarios.
                <br />
                Real evidence mechanics.
              </p>
            </div>
          </section>

          <section className="panel trace-panel" aria-labelledby="trace-title">
            <div className="panel-heading">
              <div>
                <span className="panel-number">02</span>
                <h2 id="trace-title">Inside the investigation</h2>
              </div>
              <Activity size={17} className={busy ? "lime" : "dim"} />
            </div>
            <div className="trace-summary">
              <span className="micro-label">NEMOTRON MODEL ROUTER</span>
              <span>
                {queryCount.toString().padStart(2, "0")} queries{" "}
                <span className="dim">·</span>{" "}
                {result ? Object.keys(result.evidence).length : "—"} evidence
                rows
              </span>
            </div>
            <div className="stage-list">
              {stages.map((stage) => {
                const transitions = trace.filter(
                  (event) =>
                    event.type === "stage" && event.stage === stage.key,
                );
                const status = transitions.at(-1)?.status;
                const guardBlocked =
                  stage.key === "guard" &&
                  (transitions.at(-1)?.result?.injection_detected ||
                    result?.guard.injection_detected);
                return (
                  <div
                    className={`stage ${status || "waiting"}`}
                    key={stage.key}
                  >
                    <div className="stage-rail">
                      <span className="stage-icon">
                        {status === "completed" ? (
                          <Check size={16} />
                        ) : status === "running" && busy ? (
                          <Loader2 className="spin" size={17} />
                        ) : (
                          <stage.icon size={16} />
                        )}
                      </span>
                      <span className="rail-line" />
                    </div>
                    <div className="stage-content">
                      <div className="stage-head">
                        <h3>{stage.title}</h3>
                        <span className="model-size">{stage.size}</span>
                      </div>
                      <code className="model-id">{stage.model}</code>
                      <p className="stage-description">{stage.description}</p>
                      {guardBlocked && (
                        <div className="guard-block">
                          <ShieldAlert size={14} />
                          <span>Injection detected. Memo quarantined.</span>
                        </div>
                      )}
                      {trace
                        .filter(
                          (event) =>
                            event.type === "query" && event.stage === stage.key,
                        )
                        .map((event) => (
                          <QueryCard key={event.id} event={event} />
                        ))}
                      {stage.key === "synthesizer" &&
                        status === "completed" && (
                          <div className="verification-pass">
                            <CheckCheck size={14} /> Source fields matched.
                            Narrative verified.
                          </div>
                        )}
                      {status === "running" && busy && (
                        <div className="stage-working">
                          <span className="status-dot green pulse" /> Nemotron
                          is working <span className="working-dots">···</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="trace-bottom">
              <div className="memo-preview">
                <span className="micro-label">UNTRUSTED PAYMENT MEMO</span>
                <p>
                  {active?.payment_memo || "Select a wire to inspect its memo."}
                </p>
                <span>
                  <ShieldCheck size={11} /> Quarantined before planning
                </span>
              </div>
              {!health?.meterless.configured && (
                <p className="setup-note">
                  Connect NVIDIA Nemotron with <code>METERLESS_API_KEY</code> in
                  the backend environment to investigate.
                </p>
              )}
              <button
                className={`run-button ${busy ? "cancel-button" : ""}`}
                onClick={
                  busy
                    ? () => controller.current?.abort()
                    : () => void investigate()
                }
                disabled={!active || (!busy && !health?.meterless.configured)}
              >
                {busy ? (
                  <>
                    <Square size={13} /> Stop investigation{" "}
                    <span>{elapsed}s</span>
                  </>
                ) : (
                  <>
                    <Play size={14} fill="currentColor" />{" "}
                    {result ? "Investigate again" : "Run investigation"}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              <p className="run-caption">
                3 specialized models. One traceable decision.
              </p>
            </div>
          </section>

          <section
            className="panel verdict-panel"
            aria-labelledby="verdict-title"
          >
            <div className="panel-heading">
              <div>
                <span className="panel-number">03</span>
                <h2 id="verdict-title">Explain why</h2>
              </div>
              <button
                className="icon-button"
                onClick={exportEvidence}
                disabled={!result}
                aria-label="Export investigation evidence"
              >
                <Download size={16} />
              </button>
            </div>
            {!result ? (
              <div className="verdict-empty">
                <div className={`evidence-orbit ${busy ? "is-running" : ""}`}>
                  <span className="orbit-node node-one" />
                  <span className="orbit-node node-two" />
                  <span className="orbit-node node-three" />
                  <Fingerprint size={38} strokeWidth={1.1} />
                </div>
                <span className="micro-label">PROOF BEFORE A VERDICT</span>
                <h3>
                  {busy
                    ? "The trail is taking shape."
                    : "An answer is only as good\nas its evidence."}
                </h3>
                <p>
                  {busy
                    ? "Follow the live model trace. A recommendation appears only after citation and evidence verification."
                    : "Run an investigation to see a cited recommendation and inspect the records behind every claim."}
                </p>
                <div className="evidence-checklist">
                  <span>
                    <CircleDot size={13} /> Every claim linked to a source
                  </span>
                  <span>
                    <Braces size={13} /> Every database row inspectable
                  </span>
                  <span>
                    <ShieldCheck size={13} /> Every narrative checked twice
                  </span>
                </div>
              </div>
            ) : (
              <div className="verdict-content">
                <div
                  className={`verdict-banner ${result.verdict.toLowerCase()}`}
                >
                  <span>
                    {result.verdict === "CLEARED" ? (
                      <ShieldCheck size={23} />
                    ) : (
                      <ShieldAlert size={23} />
                    )}
                  </span>
                  <div>
                    <span className="micro-label">
                      VERIFIED DEMO RECOMMENDATION
                    </span>
                    <h3>
                      {result.verdict === "CLEARED"
                        ? "Clear with proof"
                        : result.verdict === "ESCALATED"
                          ? "Escalate for review"
                          : "Further review required"}
                    </h3>
                  </div>
                </div>
                <div className="verdict-meta">
                  <span>
                    <CheckCheck size={12} /> Citations verified
                  </span>
                  <span>{result.data_source}</span>
                </div>
                <div className="narrative-label">
                  <span className="micro-label">
                    FORENSIC NARRATIVE · SAR DRAFT
                  </span>
                  <span>{result.claims.length} claims</span>
                </div>
                <div className="claims">
                  {result.claims.map((claim, index) => (
                    <div className="claim" key={index}>
                      <span className="claim-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <p>
                        <CitationText
                          text={claim.text}
                          select={selectCitation}
                        />
                      </p>
                    </div>
                  ))}
                </div>
                {result.policy.chain.length > 1 && (
                  <div className="ownership-chain">
                    <span className="micro-label">OBSERVED OWNERSHIP PATH</span>
                    {result.policy.chain.map((id, i) => {
                      const row = result.evidence[`icij_kyc_entities.${id}`];
                      return (
                        <div key={id}>
                          {i > 0 && (
                            <span className="chain-arrow">
                              <ArrowDown size={12} /> owner
                            </span>
                          )}
                          <button
                            onClick={() =>
                              selectCitation(`icij_kyc_entities.${id}`)
                            }
                          >
                            <GitBranch size={12} />
                            <span>{String(row?.entity_name || id)}</span>
                            {row?.ownership_percent != null && (
                              <small>{String(row.ownership_percent)}%</small>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="evidence-inspector" ref={evidenceRef}>
                  <div className="inspector-title">
                    <Search size={14} />
                    <strong>Source evidence</strong>
                    <span>{Object.keys(result.evidence).length} rows</span>
                  </div>
                  <label className="sr-only" htmlFor="evidence-row">
                    Select a source row
                  </label>
                  <select
                    id="evidence-row"
                    value={activeCitation}
                    onChange={(event) => setActiveCitation(event.target.value)}
                  >
                    <option value="">Select a citation to inspect</option>
                    {Object.keys(result.evidence).map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  {activeCitation && result.evidence[activeCitation] ? (
                    <div className="selected-evidence" key={activeCitation}>
                      <div className="evidence-table-label">
                        <Database size={11} /> {activeCitation}
                      </div>
                      <RawRow row={result.evidence[activeCitation]} />
                    </div>
                  ) : (
                    <p className="inspector-empty">
                      Click any <span>[CITE: …]</span> pill to highlight the
                      original row here.
                    </p>
                  )}
                </div>
                <p className="scope-note">{result.scope}</p>
              </div>
            )}
            <div className="verdict-footer">
              <Fingerprint size={13} />
              <span>
                {result
                  ? `EVIDENCE SHA-256 · ${result.evidence_digest.slice(0, 16)}…`
                  : "NO UNSUPPORTED CONCLUSIONS"}
              </span>
            </div>
          </section>
        </div>
        <footer className="page-footer">
          <span>
            PROOFTRACE <span className="dim">/</span> FOLLOW THE EVIDENCE
          </span>
          <span>
            IBM AML typologies <span>·</span> ICIJ-style ownership{" "}
            <span>·</span> Live OpenSanctions sample
          </span>
          <span className="footer-note">
            Synthetic scenarios. No real-world clearance.
          </span>
        </footer>
      </main>
    </div>
  );
}
