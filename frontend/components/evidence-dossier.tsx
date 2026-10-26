"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Braces,
  Building2,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Download,
  FileCheck2,
  Fingerprint,
  GitBranch,
  Link2,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
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
              className={`citation ${active === match[1] ? "!border-cyan-400 !bg-cyan-900/60 !text-white" : ""}`}
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

function OwnershipChain({
  result,
  activeCitation,
  selectCitation,
}: {
  result: Investigation;
  activeCitation: string;
  selectCitation: (id: string) => void;
}) {
  const chain = result.policy.chain ?? [];
  const matches = result.policy.sanctions_matches ?? [];
  if (!chain.length) return null;

  return (
    <div className="mt-3.5 rounded-xl border border-slate-800/90 bg-[#070c16]/90 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-300">
          <GitBranch size={11} className="text-cyan-400" />
          Beneficial ownership & screening graph
        </span>
        <span className="font-mono text-[8px] text-slate-500">
          {chain.length} {chain.length === 1 ? "ENTITY" : "HOPS"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chain.map((entityId, index) => {
          const citationKey = `icij_kyc_entities.${entityId}`;
          const row = result.evidence[citationKey];
          const name = String(row?.entity_name ?? entityId);
          const jurisdiction = row?.jurisdiction
            ? String(row.jurisdiction)
            : "";
          const pct =
            row?.ownership_percent !== null &&
            row?.ownership_percent !== undefined
              ? `${Number(row.ownership_percent)}%`
              : null;
          const isPerson =
            String(row?.entity_type ?? "").toLowerCase() === "person";
          const isSelected = activeCitation === citationKey;

          return (
            <div key={entityId} className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => selectCitation(citationKey)}
                aria-label={`Inspect ownership entity ${name}`}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all ${
                  isSelected
                    ? "border-cyan-400/70 bg-cyan-950/60 text-white shadow-[0_0_16px_-6px_rgba(34,211,238,0.5)]"
                    : "border-slate-700/80 bg-[#0b1322] text-slate-200 hover:border-cyan-500/50 hover:bg-slate-800/80"
                }`}
              >
                {isPerson ? (
                  <UserCheck size={11} className="shrink-0 text-violet-300" />
                ) : (
                  <Building2 size={11} className="shrink-0 text-cyan-300" />
                )}
                <span className="text-[10px] font-medium">{name}</span>
                {jurisdiction && (
                  <span className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[8px] text-slate-400">
                    {jurisdiction}
                  </span>
                )}
              </button>
              {index < chain.length - 1 && (
                <span className="flex items-center gap-1 font-mono text-[8px] text-cyan-400/90">
                  {pct && (
                    <span className="rounded border border-cyan-800/60 bg-cyan-950/40 px-1 py-0.5">
                      {pct}
                    </span>
                  )}
                  <ArrowRight size={10} />
                </span>
              )}
            </div>
          );
        })}
        {matches.map((sanId) => {
          const citationKey = `opensanctions_watchlist.${sanId}`;
          const row = result.evidence[citationKey];
          const isSelected = activeCitation === citationKey;
          return (
            <div key={sanId} className="flex items-center gap-1.5">
              <ArrowRight size={10} className="text-red-400" />
              <button
                type="button"
                onClick={() => selectCitation(citationKey)}
                aria-label={`Inspect sanctions match ${sanId}`}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left font-mono text-[9px] font-semibold transition-all ${
                  isSelected
                    ? "border-red-400 bg-red-950/80 text-white shadow-[0_0_16px_-6px_rgba(248,113,113,0.6)]"
                    : "border-red-500/45 bg-red-950/45 text-red-200 hover:border-red-400"
                }`}
              >
                <ShieldAlert size={11} className="shrink-0 text-red-400" />
                <span>{String(row?.name ?? sanId)}</span>
                <span className="rounded bg-red-500/20 px-1 py-0.5 text-[8px] text-red-300">
                  WATCHLIST HIT
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowInspector({ citation, row }: { citation: string; row: Row }) {
  const [json, setJson] = useState(false);
  return (
    <div className="selected-evidence overflow-hidden rounded-xl border border-cyan-500/45 bg-gradient-to-b from-[#0a1824] to-[#071019] shadow-[0_0_32px_-12px_rgba(34,211,238,0.4)]">
      <div className="flex items-center gap-2 border-b border-cyan-900/60 bg-[#08131d] px-3.5 py-2.5">
        <Braces size={13} className="shrink-0 text-cyan-300" />
        <span className="eyebrow !text-cyan-200">Source record</span>
        <button
          className="ml-auto rounded border border-cyan-500/30 bg-cyan-950/60 px-2 py-1 font-mono text-[9px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/70"
          onClick={() => setJson(!json)}
          aria-pressed={json}
        >
          {json ? "FIELDS" : "JSON"}
        </button>
      </div>
      <div className="border-b border-cyan-900/40 px-3.5 py-2.5">
        <p className="break-all font-mono text-[10px] font-medium leading-relaxed text-cyan-200">
          {citation}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-slate-300">
          <CheckCheck size={11} className="text-cyan-400" />
          <span>Exact cited row</span>
          {Boolean(row.is_demo) && (
            <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[8px] text-amber-300">
              Fictional fixture
            </span>
          )}
        </div>
      </div>
      {json ? (
        <pre
          className="max-h-72 overflow-auto p-3.5 font-mono text-[10px] leading-relaxed text-slate-200"
          tabIndex={0}
        >
          {JSON.stringify(row, null, 2)}
        </pre>
      ) : (
        <dl className="max-h-72 overflow-y-auto px-3.5">
          {Object.entries(row).map(([field, value]) => (
            <div
              key={field}
              className="grid grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] gap-3 border-b border-slate-800/80 py-2 font-mono text-[9px] last:border-0"
            >
              <dt className="break-words text-slate-400">{field}</dt>
              <dd className="break-words font-medium text-slate-100 [overflow-wrap:anywhere]">
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
      className={`rounded-xl border p-3.5 transition-colors ${blocked ? "border-red-500/40 bg-gradient-to-br from-red-950/30 to-[#0a0f18]" : "border-slate-800/90 bg-[#080d17]/90"}`}
      aria-label="Memo screening status"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg border ${blocked ? "border-red-500/45 bg-red-950/50 text-red-300" : "border-cyan-500/35 bg-cyan-950/40 text-cyan-300"}`}
        >
          {blocked ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
        </span>
        <h3 className="text-[11px] font-semibold text-slate-100">
          Memo screening
        </h3>
        <span
          className={`ml-auto h-2 w-2 rounded-full ${waiting ? "bg-slate-600" : blocked ? "bg-red-400 shadow-[0_0_8px_#f87171]" : "bg-cyan-300 shadow-[0_0_8px_#67e8f9]"}`}
        />
      </div>
      <p
        className={`text-[11px] font-semibold ${blocked ? "text-red-200" : waiting ? "text-slate-400" : "text-cyan-200"}`}
      >
        {waiting
          ? busy
            ? "Inspecting untrusted input…"
            : "Awaiting memo check"
          : blocked
            ? "Injection detected. Memo quarantined."
            : "No injection detected. Memo quarantined."}
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
        {waiting
          ? "The payment memo is checked before ownership and sanctions screening."
          : blocked
            ? "The memo was quarantined. Sanctions screening continued."
            : "The memo was excluded from subsequent model instructions."}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-2.5 font-mono text-[8px] text-slate-400">
        <LockKeyhole size={10} className="text-cyan-400" />
        {demo ? "SIMULATED AUDIT · NO MODEL CALLS" : provider}
        <span className="ml-auto rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300">
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
        <div className="absolute inset-0 rounded-full border border-slate-800/90" />
        <div className="absolute inset-3 rounded-full border border-dashed border-cyan-500/30" />
        <div className="absolute inset-6 rounded-full bg-cyan-400/10 blur-xl" />
        <Fingerprint
          size={36}
          strokeWidth={1.2}
          className="relative text-cyan-300/80"
        />
        {busy && (
          <span className="scan-line absolute h-px w-20 bg-cyan-300/60 shadow-[0_0_12px_#22d3ee]" />
        )}
        <span className="absolute bottom-2 right-2 rounded-full border border-slate-700 bg-[#0e1622] p-1.5">
          <LockKeyhole size={11} className="text-cyan-300" />
        </span>
      </div>
      <h3 className="text-sm font-semibold text-slate-100">
        {busy ? "Investigation in progress" : "No findings yet"}
      </h3>
      <p className="mb-5 mt-2 max-w-[250px] text-[11px] leading-relaxed text-slate-400">
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
        icon={<FileCheck2 size={14} />}
        title="Findings and evidence"
        aside={
          result ? (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 font-mono text-[9px] text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-cyan-950/40 hover:text-cyan-200"
              onClick={exportEvidence}
              aria-label="Export investigation evidence"
            >
              <Download size={12} />
              <span className="hidden sm:inline">EXPORT JSON</span>
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
              className={`relative overflow-hidden rounded-xl border p-4 shadow-lg ${cleared ? "border-cyan-500/45 bg-gradient-to-br from-cyan-950/60 via-[#091824] to-[#070d17]" : review ? "border-amber-500/45 bg-gradient-to-br from-amber-950/50 via-[#191309] to-[#070d17]" : "border-red-500/45 bg-gradient-to-br from-red-950/55 via-[#1c0c12] to-[#070d17]"}`}
            >
              <div className="mb-2.5 flex items-center justify-between">
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
                <span className="rounded bg-slate-900/70 px-2 py-0.5 font-mono text-[8px] font-semibold tracking-wider text-slate-300">
                  {demo ? "SIMULATED VERDICT" : "VERIFIED RESULT"}
                </span>
              </div>
              <h3
                className={`text-xl font-semibold tracking-[-0.04em] ${cleared ? "text-cyan-100" : review ? "text-amber-100" : "text-red-100"}`}
              >
                {cleared
                  ? "Cleared"
                  : review
                    ? "Manual review required"
                    : "Escalate for review"}
              </h3>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                {result.policy.reason}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-3 border-t border-slate-700/40 pt-3 font-mono text-[9px] text-slate-300">
                <span>
                  <span className="font-semibold text-white">
                    {result.claims.length}
                  </span>{" "}
                  cited claims
                </span>
                <span>
                  <span className="font-semibold text-white">
                    {evidenceCount}
                  </span>{" "}
                  source records
                </span>
                {result.policy.cross_silo_checked && (
                  <span className="ml-auto flex items-center gap-1 text-cyan-300">
                    <CheckCheck size={11} />
                    Cross-silo verified
                  </span>
                )}
              </div>
            </div>

            <OwnershipChain
              result={result}
              activeCitation={activeCitation}
              selectCitation={selectCitation}
            />

            <div
              className="mb-4 mt-4 flex border-b border-slate-800"
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
                  className={`relative flex-1 px-2 pb-3 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${tab === item ? "text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {item === "narrative"
                    ? "SAR draft"
                    : `Evidence (${evidenceCount})`}
                  {tab === item && (
                    <motion.span
                      layoutId="dossier-tab"
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-cyan-400 to-teal-300"
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
                  <div className="space-y-3">
                    {result.claims.map((claim, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-slate-800/80 bg-[#080e19]/80 p-3"
                      >
                        <div className="flex gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-800/90 font-mono text-[9px] font-semibold text-cyan-300">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <p className="min-w-0 text-[11px] leading-[1.85] text-slate-200">
                            <CitationText
                              text={claim.text}
                              select={selectCitation}
                              active={activeCitation}
                            />
                          </p>
                        </div>
                        {claim.facts?.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-800/70 pt-2 pl-7">
                            {claim.facts.map((fact, fi) => (
                              <span
                                key={fi}
                                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#050911] px-1.5 py-0.5 font-mono text-[8px] text-slate-400"
                              >
                                <CheckCheck
                                  size={9}
                                  className="text-cyan-400"
                                />
                                <span className="text-slate-500">
                                  {fact.field}:
                                </span>
                                <span className="text-slate-200">
                                  {String(fact.value)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(result.evidence).map(([id, row]) => (
                      <button
                        className={`flex w-full items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${activeCitation === id ? "border-cyan-500/60 bg-cyan-950/35 shadow-sm" : "border-slate-800 bg-[#09101c] hover:border-slate-600"}`}
                        key={id}
                        onClick={() => selectCitation(id)}
                        aria-pressed={activeCitation === id}
                      >
                        <Braces size={13} className="shrink-0 text-cyan-400" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium text-slate-100">
                            {String(
                              row.entity_name ?? row.name ?? row.record_id,
                            )}
                          </span>
                          <span className="mt-1 block break-all font-mono text-[8px] text-slate-400">
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
                  className="mt-4"
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
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-700/80 bg-[#070c15]/50 px-3.5 py-3 text-[10px] text-slate-400">
                  <Link2 size={13} className="shrink-0 text-cyan-400" />
                  Click any citation or ownership node to inspect its raw source
                  record.
                </div>
              )}
            </AnimatePresence>
            <div className="mt-4 flex items-center gap-1.5 text-[9px] font-medium text-cyan-300">
              <CheckCheck size={12} />
              {demo
                ? "Demo citations checked"
                : result.citations_verified
                  ? "Citations checked against source records"
                  : "Citation verification unavailable"}
            </div>
            <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
              {result.scope}
            </p>
          </motion.div>
        )}
      </div>
      <div className="mt-auto p-4 pt-3">
        <SafetyShield trace={trace} result={result} busy={busy} demo={demo} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-800/80 bg-[#060a12]/80 px-4 py-3 font-mono text-[8px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Fingerprint size={11} className="text-cyan-400" />
          {result
            ? `SHA-256 ${result.evidence_digest.slice(0, 12)}…`
            : "EVIDENCE INTEGRITY"}
        </span>
        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300">
          {demo ? "SIMULATED" : (result?.data_source ?? "AWAITING RUN")}
        </span>
      </div>
    </section>
  );
}
