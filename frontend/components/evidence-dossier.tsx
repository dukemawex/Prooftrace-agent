"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Braces,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Download,
  FileCheck2,
  Fingerprint,
  Link2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { Investigation, Row, TraceEvent } from "@/lib/types";
import { LoadingDots, PanelHeading } from "./console-ui";

function CitationText({
  text,
  select,
  active,
}: {
  text: string;
  select: (id: string) => void;
  active: string;
}) {
  return (
    <>
      {text
        .split(/(\[CITE: [A-Za-z_][\w]*\.[A-Za-z0-9_-]+\])/g)
        .map((part, index) => {
          const match = part.match(/^\[CITE: (.+)\]$/);
          return match ? (
            <button
              key={index}
              className={`citation ${active === match[1] ? "!border-cyan-400/70 !bg-cyan-900/40" : ""}`}
              onClick={() => select(match[1])}
              aria-pressed={active === match[1]}
              title="Inspect the source record"
            >
              <Link2 size={9} className="shrink-0" />
              <span>{part}</span>
            </button>
          ) : (
            <span key={index}>{part}</span>
          );
        })}
    </>
  );
}

function RowInspector({ citation, row }: { citation: string; row: Row }) {
  const [json, setJson] = useState(false);
  return (
    <div className="selected-evidence overflow-hidden rounded-xl border border-cyan-700/60 bg-[#0a1720] shadow-[0_0_28px_-14px_#22d3ee40]">
      <div className="flex items-center gap-2 border-b border-cyan-900/60 px-3 py-3">
        <Braces size={13} className="shrink-0 text-cyan-300" />
        <span className="eyebrow !text-cyan-300">Source record</span>
        <button
          className="ml-auto rounded px-2 py-1 font-mono text-[9px] text-cyan-200 hover:bg-cyan-950"
          onClick={() => setJson(!json)}
          aria-pressed={json}
        >
          {json ? "FIELDS" : "JSON"}
        </button>
      </div>
      <div className="border-b border-cyan-900/40 p-3">
        <p className="break-all font-mono text-[9px] leading-relaxed text-cyan-200">
          {citation}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-[9px] text-slate-400">
          <CheckCheck size={10} className="text-cyan-400" />
          Exact cited row
          {Boolean(row.is_demo) && (
            <span className="ml-auto text-amber-300/80">Fictional fixture</span>
          )}
        </div>
      </div>
      {json ? (
        <pre
          className="max-h-72 overflow-auto p-3 font-mono text-[10px] leading-relaxed text-slate-300"
          tabIndex={0}
        >
          {JSON.stringify(row, null, 2)}
        </pre>
      ) : (
        <dl className="max-h-72 overflow-y-auto px-3">
          {Object.entries(row).map(([field, value]) => (
            <div
              key={field}
              className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-3 border-b border-slate-800/80 py-2.5 font-mono text-[9px] last:border-0"
            >
              <dt className="break-words text-slate-500">{field}</dt>
              <dd className="break-words text-slate-200 [overflow-wrap:anywhere]">
                {value === null ? (
                  <span className="text-slate-500">null</span>
                ) : (
                  String(value)
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function SafetyShield({
  trace,
  result,
  busy,
  demo,
}: {
  trace: TraceEvent[];
  result?: Investigation;
  busy: boolean;
  demo: boolean;
}) {
  const guardEvent = trace.find(
    (event) =>
      event.type === "stage" &&
      event.stage === "guard" &&
      event.status === "completed",
  );
  const guard = result?.guard ?? guardEvent?.result;
  const blocked = Boolean(guard?.injection_detected);
  const waiting = !guard;
  const provider =
    guardEvent?.provider === "openrouter"
      ? "OpenRouter · NVIDIA Nemotron"
      : "Meterless / NVIDIA Nemotron";
  return (
    <section
      className={`rounded-xl border p-4 ${blocked ? "border-red-900/50 bg-red-950/10" : "border-slate-800/80 bg-[#0a1019]/80"}`}
      aria-label="Memo screening status"
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg border ${blocked ? "border-red-800/50 bg-red-950/30 text-red-400" : "border-cyan-900/60 bg-cyan-950/30 text-cyan-400"}`}
        >
          {blocked ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
        </span>
        <h3 className="text-[11px] font-medium text-slate-200">
          Memo screening
        </h3>
        <span
          className={`ml-auto h-1.5 w-1.5 rounded-full ${waiting ? "bg-slate-600" : blocked ? "bg-red-400" : "bg-cyan-300"}`}
        />
      </div>
      <p
        className={`text-[11px] font-medium ${blocked ? "text-red-300" : waiting ? "text-slate-400" : "text-cyan-300"}`}
      >
        {waiting
          ? busy
            ? "Inspecting untrusted input…"
            : "Awaiting memo check"
          : blocked
            ? "Injection detected. Memo quarantined."
            : "No injection detected. Memo quarantined."}
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        {waiting
          ? "The payment memo is checked before ownership and sanctions screening."
          : blocked
            ? "The memo was quarantined. Sanctions screening continued."
            : "The memo was excluded from subsequent model instructions."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-3 font-mono text-[8px] text-slate-500">
        <LockKeyhole size={10} />
        {demo ? "SIMULATED AUDIT · NO MODEL CALLS" : provider}
        <span className="ml-auto">
          {waiting ? "PENDING" : demo ? "REPLAY" : "AUDITED"}
        </span>
      </div>
    </section>
  );
}

function EmptyDossier({ busy, loading }: { busy: boolean; loading: boolean }) {
  return (
    <div className="grid-texture relative flex min-h-[350px] flex-col items-center justify-center px-7 pb-8 pt-7 text-center">
      <div className="relative mb-6 flex h-28 w-28 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-slate-800/80" />
        <div className="absolute inset-3 rounded-full border border-dashed border-slate-700/70" />
        <div className="absolute inset-6 rounded-full bg-cyan-400/5 blur-lg" />
        <Fingerprint
          size={36}
          strokeWidth={1}
          className="relative text-cyan-400/65"
        />
        {busy && (
          <span className="scan-line absolute h-px w-20 bg-cyan-300/50 shadow-[0_0_10px_#22d3ee]" />
        )}
        <span className="absolute bottom-2 right-2 rounded-full border border-slate-800 bg-[#0e1622] p-1.5">
          <LockKeyhole size={11} className="text-slate-500" />
        </span>
      </div>
      <h3 className="text-sm font-medium text-slate-200">
        {busy ? "Investigation in progress" : "No findings yet"}
      </h3>
      <p className="mb-5 mt-2 max-w-[240px] text-[11px] leading-relaxed text-slate-500">
        {busy
          ? "The report and its citations must pass verification before results appear."
          : "Select a wire, then run an investigation."}
      </p>
      {busy || loading ? (
        <div
          className="w-full max-w-[235px] space-y-3"
          aria-label="Loading evidence dossier"
        >
          <div className="skeleton h-2 w-full" />
          <div className="skeleton h-2 w-5/6" />
          <div className="skeleton h-2 w-3/4" />
          <div className="flex justify-center pt-3">
            <LoadingDots />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EvidenceDossier({
  result,
  trace,
  busy,
  loading,
  demo,
}: {
  result?: Investigation;
  trace: TraceEvent[];
  busy: boolean;
  loading: boolean;
  demo: boolean;
}) {
  const [tab, setTab] = useState<"narrative" | "evidence">("narrative");
  const [activeCitation, setActiveCitation] = useState("");
  const evidenceRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const evidenceCount = Object.keys(result?.evidence ?? {}).length;
  const cleared = result?.verdict === "CLEARED";
  const review = result?.verdict === "REVIEW";
  function revealEvidence() {
    evidenceRef.current?.scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "nearest",
    });
    evidenceRef.current?.focus({ preventScroll: true });
  }
  function selectCitation(id: string) {
    if (activeCitation === id) revealEvidence();
    else setActiveCitation(id);
  }

  function exportEvidence() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `teger-trace-agent-${demo ? "SIMULATED-" : ""}${result.txn_id}-${result.run_id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section
      id="evidence-dossier"
      className="glass-panel flex min-h-0 flex-col overflow-hidden [&>div]:shrink-0"
      aria-label="Verdict and evidence dossier"
    >
      <PanelHeading
        icon={<FileCheck2 size={15} />}
        title="Findings and evidence"
        aside={
          result ? (
            <button
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-cyan-300"
              onClick={exportEvidence}
              aria-label="Export investigation evidence"
            >
              <Download size={14} />
            </button>
          ) : (
            <LockKeyhole size={13} className="shrink-0 text-slate-600" />
          )
        }
      />
      <div className="min-h-0 overflow-y-auto xl:flex-1 xl:!shrink">
        {!result ? (
          <EmptyDossier busy={busy} loading={loading} />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4"
          >
            <div
              className={`relative overflow-hidden rounded-xl border p-4 ${cleared ? "border-cyan-800/60 bg-gradient-to-br from-cyan-950/50 to-transparent" : review ? "border-amber-800/60 bg-gradient-to-br from-amber-950/40 to-transparent" : "border-red-800/60 bg-gradient-to-br from-red-950/40 to-transparent"}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={`badge ${cleared ? "badge-cyan" : review ? "badge-amber" : "badge-red"}`}
                >
                  {cleared ? (
                    <CircleCheck size={11} />
                  ) : (
                    <ShieldAlert size={11} />
                  )}
                  {result.verdict}
                </span>
                <span className="font-mono text-[8px] text-slate-500">
                  {demo ? "SIMULATED VERDICT" : "VERIFIED RESULT"}
                </span>
              </div>
              <h3
                className={`text-xl font-medium tracking-[-0.04em] ${cleared ? "text-cyan-200" : review ? "text-amber-200" : "text-red-200"}`}
              >
                {cleared
                  ? "Cleared"
                  : review
                    ? "Manual review required"
                    : "Escalate for review"}
              </h3>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                {result.policy.reason}
              </p>
              <div className="mt-4 flex gap-4 border-t border-slate-700/40 pt-3 font-mono text-[9px] text-slate-400">
                <span>
                  <span className="text-slate-200">{result.claims.length}</span>{" "}
                  cited claims
                </span>
                <span>
                  <span className="text-slate-200">{evidenceCount}</span> source
                  records
                </span>
              </div>
            </div>
            <div
              className="mb-4 mt-5 flex border-b border-slate-800"
              role="tablist"
              aria-label="Dossier view"
            >
              {(["narrative", "evidence"] as const).map((item) => (
                <button
                  key={item}
                  id={`tab-${item}`}
                  role="tab"
                  aria-selected={tab === item}
                  aria-controls={`panel-${item}`}
                  tabIndex={tab === item ? 0 : -1}
                  onClick={() => setTab(item)}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? "narrative"
                          : event.key === "End"
                            ? "evidence"
                            : item === "narrative"
                              ? "evidence"
                              : "narrative";
                      setTab(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }
                  }}
                  className={`relative flex-1 px-2 pb-3 text-[10px] font-medium ${tab === item ? "text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {item === "narrative"
                    ? "SAR draft"
                    : `Evidence (${evidenceCount})`}
                  {tab === item && (
                    <motion.span
                      layoutId="dossier-tab"
                      className="absolute inset-x-0 bottom-0 h-px bg-cyan-400"
                    />
                  )}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                id={`panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`tab-${tab}`}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.14 }}
              >
                {tab === "narrative" ? (
                  <div className="space-y-4">
                    {result.claims.map((claim, index) => (
                      <div key={index} className="flex gap-2.5">
                        <span className="mt-1 font-mono text-[9px] text-slate-600">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <p className="min-w-0 text-[11px] leading-[1.85] text-slate-300">
                          <CitationText
                            text={claim.text}
                            select={selectCitation}
                            active={activeCitation}
                          />
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(result.evidence).map(([id, row]) => (
                      <button
                        className={`flex w-full items-center gap-2 rounded-lg border p-3 text-left transition-colors ${activeCitation === id ? "border-cyan-800 bg-cyan-950/30" : "border-slate-800 bg-[#0a111c] hover:border-slate-600"}`}
                        key={id}
                        onClick={() => selectCitation(id)}
                        aria-pressed={activeCitation === id}
                      >
                        <Braces size={13} className="shrink-0 text-cyan-400" />
                        <span className="min-w-0">
                          <span className="block text-[11px] text-slate-200">
                            {String(
                              row.entity_name ?? row.name ?? row.record_id,
                            )}
                          </span>
                          <span className="mt-1 block break-all font-mono text-[8px] text-slate-500">
                            {id}
                          </span>
                        </span>
                        <ChevronRight
                          size={12}
                          className="ml-auto shrink-0 text-slate-500"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              {activeCitation && result.evidence[activeCitation] ? (
                <motion.div
                  key={activeCitation}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onAnimationComplete={revealEvidence}
                  className="mt-5"
                >
                  <div
                    ref={evidenceRef}
                    tabIndex={-1}
                    aria-label={`Source record ${activeCitation}`}
                    className="rounded-xl outline-none"
                  >
                    <RowInspector
                      citation={activeCitation}
                      row={result.evidence[activeCitation]}
                    />
                  </div>
                </motion.div>
              ) : (
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-dashed border-slate-700/80 px-3 py-3 text-[10px] text-slate-500">
                  <Link2 size={13} className="shrink-0" />
                  Click any citation to inspect the source record.
                </div>
              )}
            </AnimatePresence>
            <div className="mt-4 flex items-center gap-1.5 text-[9px] text-cyan-400/80">
              <CheckCheck size={12} />
              {demo
                ? "Demo citations checked"
                : result.citations_verified
                  ? "Citations checked against source records"
                  : "Citation verification unavailable"}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-slate-500">
              {result.scope}
            </p>
          </motion.div>
        )}
      </div>
      <div className="mt-auto p-4 pt-3">
        <SafetyShield trace={trace} result={result} busy={busy} demo={demo} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 px-4 py-3 font-mono text-[8px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Fingerprint size={11} />
          {result
            ? `SHA-256 ${result.evidence_digest.slice(0, 12)}…`
            : "EVIDENCE INTEGRITY"}
        </span>
        <span className="text-slate-400">
          {demo ? "SIMULATED" : (result?.data_source ?? "AWAITING RUN")}
        </span>
      </div>
    </section>
  );
}
