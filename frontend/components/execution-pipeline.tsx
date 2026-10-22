"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  FileCode2,
  Fingerprint,
  GitBranch,
  Loader2,
  LockKeyhole,
  Play,
  ShieldCheck,
  Square,
  Terminal,
  Workflow,
} from "lucide-react";
import type { Alert, Health, Investigation, TraceEvent } from "@/lib/types";
import { LoadingDots, PanelHeading, RunStatus } from "./console-ui";

const STAGES = [
  {
    key: "guard",
    number: "01",
    title: "Guard & triage",
    size: "NANO · 8B",
    icon: ShieldCheck,
    model: "nvidia/llama-3.1-nemotron-nano-8b-v1",
    description: "Inspect the payment memo. Isolate untrusted instructions.",
  },
  {
    key: "planner",
    number: "02",
    title: "Federated investigation",
    size: "SUPER · 49B",
    icon: GitBranch,
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    description:
      "Follow ownership across silos. Test the sanctions hypothesis.",
  },
  {
    key: "synthesizer",
    number: "03",
    title: "Synthesize & verify",
    size: "NEMOTRON · 70B",
    icon: Fingerprint,
    model: "nvidia/llama-3.1-nemotron-70b-instruct",
    description:
      "Build the SAR narrative. Verify every claim against its source.",
  },
];

function SQL({ text }: { text: string }) {
  return (
    <pre
      className="sql code-block whitespace-pre"
      tabIndex={0}
      aria-label="Exact executed SQL"
    >
      <code>
        {text
          .split(
            /(\b(?:SELECT|FROM|LEFT JOIN|JOIN|ON|WHERE|AND|OR|AS|LIMIT|ORDER BY|WITH|RECURSIVE|UNION ALL|IS|NOT|NULL)\b|'[^']*')/gi,
          )
          .map((part, i) => (
            <span
              key={i}
              className={
                /^'/.test(part)
                  ? "text-amber-200"
                  : /^(SELECT|FROM|.*JOIN|ON|WHERE|AND|OR|AS|LIMIT|ORDER BY|WITH|RECURSIVE|UNION ALL|IS|NOT|NULL)$/i.test(
                        part,
                      )
                    ? "text-cyan-300"
                    : ""
              }
            >
              {part}
            </span>
          ))}
      </code>
    </pre>
  );
}

function QueryCard({ event }: { event: TraceEvent }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"sql" | "rows">("sql");
  const id = useId();
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800/80 bg-[#0a101b]/80">
      <button
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-800/35"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Terminal size={12} className="shrink-0 text-cyan-400/80" />
        <span className="min-w-0 flex-1 break-words text-[10px] text-slate-300">
          {event.tool?.replaceAll("_", " ")}
        </span>
        <span className="shrink-0 font-mono text-[9px] text-slate-500">
          {event.rows?.length ?? 0} rows
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-800 px-3 pb-3 pt-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label="Query view"
                >
                  <button
                    className={`rounded px-2 py-1 font-mono text-[9px] ${tab === "sql" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500"}`}
                    onClick={() => setTab("sql")}
                    aria-pressed={tab === "sql"}
                  >
                    SQL
                  </button>
                  <button
                    className={`rounded px-2 py-1 font-mono text-[9px] ${tab === "rows" ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500"}`}
                    onClick={() => setTab("rows")}
                    aria-pressed={tab === "rows"}
                  >
                    Returned rows ({event.rows?.length ?? 0})
                  </button>
                </div>
                <span className="font-mono text-[8px] text-slate-500">
                  {event.source}{" "}
                  {event.source !== "demo-replay" &&
                    `· ${event.duration_ms ?? 0} ms`}
                </span>
              </div>
              {event.fallback_reason && (
                <p className="mb-2 text-[10px] leading-relaxed text-amber-400/90">
                  {event.fallback_reason}
                </p>
              )}
              {tab === "sql" ? (
                <SQL text={event.executed_sql || ""} />
              ) : (
                <pre
                  className="code-block"
                  tabIndex={0}
                  aria-label="Returned database rows"
                >
                  {JSON.stringify(event.rows ?? [], null, 2)}
                </pre>
              )}
              <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-slate-500">
                {tab === "sql"
                  ? "Bounded read-only query"
                  : "Untrusted source data · rendered as text"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StageNode({
  stage,
  trace,
  busy,
  result,
  demo,
  fallbackConfigured,
}: {
  stage: (typeof STAGES)[number];
  trace: TraceEvent[];
  busy: boolean;
  result?: Investigation;
  demo: boolean;
  fallbackConfigured: boolean;
}) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [allQueries, setAllQueries] = useState(false);
  const id = useId();
  const events = trace.filter((event) => event.stage === stage.key);
  const latestStage = events.filter((event) => event.type === "stage").at(-1);
  const route = events
    .filter((event) => event.model && event.status !== "failed")
    .at(-1);
  const complete = latestStage?.status === "completed";
  const running = busy && latestStage?.status === "running";
  const interrupted = !busy && latestStage?.status === "running";
  const open =
    manualOpen ??
    (running ||
      (stage.key === "guard" && !trace.length) ||
      (stage.key === "planner" && Boolean(result)));
  const queries = events.filter((event) => event.type === "query");
  const fallback =
    route?.provider === "openrouter" || (!route && fallbackConfigured);
  const model =
    route?.model ??
    (fallback ? "nvidia/nemotron-3-super-120b-a12b:free" : stage.model);
  const guard = latestStage?.result;
  const Icon = stage.icon;
  return (
    <div className="relative pb-5 last:pb-0">
      {stage.key !== "synthesizer" && (
        <div
          className={`absolute bottom-0 left-[17px] top-9 w-px ${complete ? "bg-cyan-900/70" : "bg-slate-800"}`}
        />
      )}
      <div className="flex items-start gap-3">
        <div
          className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${running ? "border-cyan-400/60 bg-cyan-950/80 text-cyan-300 shadow-[0_0_22px_-8px_#22d3ee70]" : complete ? "border-cyan-900/80 bg-[#0b2029] text-cyan-400" : "border-slate-700/60 bg-[#121a26] text-slate-500"}`}
        >
          {running ? (
            <Loader2 size={15} className="animate-spin" />
          ) : complete ? (
            <Check size={15} />
          ) : (
            <Icon size={15} />
          )}
        </div>
        <div
          className={`min-w-0 flex-1 overflow-hidden rounded-xl border ${running ? "border-cyan-800/50 bg-cyan-950/10" : "border-slate-800/80 bg-[#0c121d]/55"}`}
        >
          <button
            className="w-full p-3.5 text-left"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setManualOpen(!open)}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[9px] text-slate-500">
                STEP {stage.number}
              </span>
              <span
                className={`model-size ml-auto font-mono text-[8px] tracking-wide ${fallback ? "text-amber-400" : "text-cyan-400/85"}`}
              >
                {fallback ? "OPENROUTER · FREE" : stage.size}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-medium text-slate-100">
                {stage.title}
              </h3>
              <ChevronDown
                size={12}
                className={`ml-auto text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5 font-mono text-[9px]">
              <span
                className={
                  running || complete
                    ? "text-cyan-400/80"
                    : interrupted
                      ? "text-amber-400"
                      : "text-slate-500"
                }
              >
                {running
                  ? "Processing"
                  : complete
                    ? demo
                      ? "Simulated · complete"
                      : "Complete"
                    : interrupted
                      ? "Interrupted"
                      : "Awaiting execution"}
              </span>
              {running && <LoadingDots />}
              {queries.length > 0 && (
                <span className="ml-auto text-slate-500">
                  {queries.length} queries
                </span>
              )}
            </div>
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                id={id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 border-t border-slate-800/70 p-3.5">
                  {!complete && (
                    <p className="text-[11px] leading-relaxed text-slate-400">
                      {stage.description}
                    </p>
                  )}
                  <div className="model-routes rounded-lg border border-slate-800/80 bg-[#070c14] px-2.5 py-2">
                    <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider text-slate-500">
                      <Code2 size={10} />
                      {demo
                        ? "Simulated model route"
                        : route
                          ? `Routed via ${route.provider}`
                          : "Configured model route"}
                    </div>
                    <p className="break-all font-mono text-[9px] leading-relaxed text-slate-400">
                      {model}
                    </p>
                  </div>
                  {events.some((event) => event.type === "model_call") && (
                    <details className="text-[9px] text-slate-400">
                      <summary className="cursor-pointer py-1">
                        Model routing audit
                      </summary>
                      <div className="mt-2 space-y-2">
                        {events
                          .filter((event) => event.type === "model_call")
                          .map((event) => (
                            <div
                              className="rounded border border-slate-800 p-2 font-mono"
                              key={event.id}
                            >
                              <p
                                className={
                                  event.status === "failed"
                                    ? "text-amber-300"
                                    : "text-cyan-300"
                                }
                              >
                                {event.provider} · {event.status}
                              </p>
                              <p className="mt-1 break-all">{event.model}</p>
                              {event.reported_model &&
                                event.reported_model !== event.model && (
                                  <p className="mt-1 break-all">
                                    Reported: {event.reported_model}
                                  </p>
                                )}
                              {(event.failure || event.fallback_reason) && (
                                <p className="mt-1 break-words text-amber-300/80">
                                  {event.failure || event.fallback_reason}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    </details>
                  )}
                  {stage.key === "guard" && complete && (
                    <div
                      className={`flex gap-2 rounded-lg border p-2.5 ${guard?.injection_detected ? "border-red-900/60 bg-red-950/20 text-red-300" : "border-cyan-900/50 bg-cyan-950/20 text-cyan-300"}`}
                    >
                      <LockKeyhole size={12} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[10px] font-medium">
                          {guard?.injection_detected
                            ? "Injection blocked · memo quarantined"
                            : "Guard complete · memo quarantined"}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                          Only isolated transaction data continues to the
                          planner.
                        </p>
                      </div>
                    </div>
                  )}
                  {queries.length > 0 && (
                    <div className="space-y-2">
                      {(allQueries ? queries : queries.slice(-1)).map(
                        (event) => (
                          <QueryCard event={event} key={event.id} />
                        ),
                      )}
                      {queries.length > 1 && (
                        <button
                          className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-[10px] text-slate-400 hover:text-cyan-300"
                          aria-expanded={allQueries}
                          onClick={() => setAllQueries(!allQueries)}
                        >
                          {allQueries
                            ? "Show latest query"
                            : `View all ${queries.length} tool calls`}
                          <ChevronRight
                            size={12}
                            className={allQueries ? "rotate-90" : ""}
                          />
                        </button>
                      )}
                    </div>
                  )}
                  {stage.key === "planner" && complete && (
                    <details className="rounded-lg border border-slate-800 p-2.5">
                      <summary className="cursor-pointer text-[10px] text-slate-400">
                        Observation · verdict policy
                      </summary>
                      <p className="mt-2 text-[10px] leading-relaxed text-slate-300">
                        {String(
                          (
                            latestStage?.result?.policy as
                              | { reason?: string }
                              | undefined
                          )?.reason ??
                            "Ownership and screening evidence collected.",
                        )}
                      </p>
                    </details>
                  )}
                  {stage.key === "synthesizer" && complete && (
                    <div className="flex items-center gap-2 text-[10px] text-cyan-300">
                      <CheckCheck size={13} />
                      {demo
                        ? "Fixture citations checked · simulated synthesis"
                        : "Citations and semantic support verified"}
                    </div>
                  )}
                  {running && (
                    <div
                      className="space-y-2 py-1"
                      aria-label="Waiting for model response"
                    >
                      <div className="skeleton h-1.5 w-4/5" />
                      <div className="skeleton h-1.5 w-3/5" />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export function ExecutionPipeline({
  active,
  trace,
  busy,
  loading,
  result,
  health,
  demo,
  elapsed,
  run,
  cancel,
}: {
  active?: Alert;
  trace: TraceEvent[];
  busy: boolean;
  loading: boolean;
  result?: Investigation;
  health: Health | null;
  demo: boolean;
  elapsed: number;
  run: () => void;
  cancel: () => void;
}) {
  const completed = trace.filter(
    (event) => event.type === "stage" && event.status === "completed",
  ).length;
  const queries = trace.filter((event) => event.type === "query");
  const rows = queries.reduce(
    (total, event) => total + (event.rows?.length ?? 0),
    0,
  );
  const fallback =
    !demo &&
    (health?.model_runtime.preferred_provider === "openrouter" ||
      trace.some((event) => event.provider === "openrouter"));
  return (
    <section
      id="execution-trace"
      className="glass-panel flex min-h-0 flex-col overflow-hidden [&>div]:shrink-0"
      aria-label="Execution pipeline"
    >
      <PanelHeading
        icon={<Workflow size={16} />}
        title="NVIDIA Nemotron + Zetaris execution pipeline"
        aside={
          <span className="hidden h-5 w-5 items-center justify-center rounded border border-slate-700/60 font-mono text-[9px] text-slate-500 sm:flex">
            02
          </span>
        }
      />
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <p className="text-sm font-medium text-slate-100">
            Live execution trace
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Every tool call. Every observation. Every source.
          </p>
        </div>
        <RunStatus busy={busy} complete={Boolean(result)} demo={demo} />
      </div>
      <div
        className="mx-5 mb-5 flex items-center gap-1.5"
        aria-label={`${completed} of 3 stages complete`}
      >
        {STAGES.map((stage, i) => (
          <div
            key={stage.key}
            className={`h-1 flex-1 rounded-full ${completed > i ? "bg-cyan-400/80" : busy && completed === i ? "animate-pulse bg-cyan-400/40" : "bg-slate-800"}`}
          />
        ))}
        <span className="ml-2 font-mono text-[9px] text-slate-500">
          {completed}/3
        </span>
      </div>
      {fallback && (
        <div className="mx-5 mb-4 flex items-center gap-2 rounded-lg border border-amber-800/40 bg-amber-950/15 px-3 py-2 text-[9px] text-amber-400">
          <span className="h-1 w-1 rounded-full bg-amber-400" />
          <span>FREE FALLBACK ACTIVE</span>
          <span className="ml-auto font-mono">NVIDIA ONLY</span>
        </div>
      )}
      <div
        className="min-h-[370px] space-y-0 overflow-y-auto px-5 pb-5 xl:min-h-0 xl:flex-1 xl:!shrink"
        aria-busy={busy || loading}
      >
        {loading
          ? Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="mb-5 flex gap-3">
                <div className="skeleton h-9 w-9 shrink-0 rounded-xl" />
                <div className="w-full rounded-xl border border-slate-800 p-4">
                  <div className="skeleton mb-4 h-2 w-1/3" />
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton mt-3 h-2 w-2/5" />
                </div>
              </div>
            ))
          : STAGES.map((stage) => (
              <StageNode
                key={stage.key}
                stage={stage}
                trace={trace}
                busy={busy}
                result={result}
                demo={demo}
                fallbackConfigured={
                  health?.model_runtime.preferred_provider === "openrouter"
                }
              />
            ))}
      </div>
      <div className="mx-5 mb-4 mt-auto rounded-xl border border-slate-800/80 bg-[#0a0f19]/70">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-[10px] text-slate-400">
            <FileCode2 size={13} />
            <span>Payment memo</span>
            <span className="ml-auto font-mono text-[8px] text-slate-500">
              UNTRUSTED INPUT
            </span>
            <ChevronDown
              size={12}
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="break-words border-t border-slate-800 px-3 py-3 font-mono text-[10px] leading-relaxed text-slate-400">
            {active?.payment_memo ??
              "Select a flagged wire to inspect its memo."}
          </p>
        </details>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800/80 px-5 py-3 font-mono text-[9px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Terminal size={11} />
          <span className="text-slate-300">{queries.length}</span> queries
        </span>
        <span className="flex items-center gap-1.5">
          <Database size={11} />
          <span className="text-slate-300">{rows}</span> rows
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Clock3 size={11} />
          {elapsed.toFixed(1)}s{demo ? " replay" : " elapsed"}
        </span>
      </div>
      <div className="border-t border-slate-800/80 p-4">
        {busy ? (
          <button className="button-quiet w-full" onClick={cancel}>
            <Square size={11} />
            Cancel {demo ? "replay" : "investigation"}
          </button>
        ) : (
          <button
            className="button-primary w-full"
            disabled={!active || (!demo && !health?.model_runtime.configured)}
            onClick={run}
          >
            <Play size={12} fill="currentColor" />
            {demo ? "Replay selected wire" : "Run investigation"}
            <ArrowRight size={13} className="ml-auto" />
          </button>
        )}
        {!demo && !health?.model_runtime.configured && !loading && (
          <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-500">
            Connect a Nemotron provider to run live, or try Demo Replay.
          </p>
        )}
      </div>
    </section>
  );
}
