"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ChevronRight,
  Cpu,
  Database,
  Fingerprint,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useInvestigation } from "@/hooks/use-investigation";
import { EvidenceDossier } from "./evidence-dossier";
import { ExecutionPipeline } from "./execution-pipeline";
import { money, StatusDot } from "./console-ui";
import { WireQueue } from "./wire-queue";

export default function InvestigationDesk() {
  const desk = useInvestigation();
  const demo = desk.mode === "demo";
  const connected = Boolean(desk.health);
  const complete = Object.keys(desk.results).length;
  const volume = desk.alerts.reduce(
    (total, alert) => total + alert.amount_cents,
    0,
  );
  const source = demo
    ? "Fictional replay fixtures"
    : desk.health?.zetaris.configured
      ? "Zetaris configured"
      : desk.health?.zetaris.fallback_enabled
        ? `${desk.health.zetaris.fallback_database.toUpperCase()} fallback enabled`
        : "Data connection unavailable";
  const runKey = `${desk.mode}-${desk.selected}-${desk.busy ? "running" : (desk.result?.run_id ?? "idle")}`;

  return (
    <MotionConfig reducedMotion="user">
      <div className="console-background min-h-screen">
        <a
          className="sr-only z-50 rounded bg-cyan-300 p-3 text-sm text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          href="#investigation-console"
        >
          Skip to investigation console
        </a>
        <header className="border-b border-slate-800/80 bg-[#090d14]/85 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[76px] max-w-[1760px] flex-wrap items-center gap-x-7 gap-y-4 px-4 py-4 sm:px-6 2xl:px-8">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-700/50 bg-gradient-to-br from-cyan-400/10 to-cyan-950/20 shadow-[0_0_20px_-12px_#22d3ee]">
                <Fingerprint
                  size={22}
                  strokeWidth={1.5}
                  className="text-cyan-300"
                />
              </span>
              <span className="text-[19px] font-semibold tracking-[-0.045em] text-slate-100">
                Proof<span className="text-cyan-300">Trace</span>
              </span>
              <span className="ml-1 hidden rounded border border-slate-700/80 px-1.5 py-0.5 font-mono text-[8px] tracking-widest text-slate-500 sm:inline">
                CONSOLE
              </span>
            </div>
            <div className="hidden h-5 w-px bg-slate-800 2xl:block" />
            <div className="order-3 flex w-full flex-wrap gap-2 xl:order-none xl:w-auto">
              <span
                className="flex items-center gap-2 rounded-md border border-slate-800 bg-[#0d141f] px-2.5 py-1.5 text-[9px] text-slate-400"
                title={
                  desk.health?.meterless.configured
                    ? "Meterless configured; connectivity is checked during a run"
                    : "Primary provider; API credentials required for a live run"
                }
              >
                <Cpu size={12} className="shrink-0 text-cyan-400" />
                Powered by{" "}
                <span className="text-slate-200">NVIDIA Nemotron</span> via
                Meterless
              </span>
              <span
                className="flex items-center gap-2 rounded-md border border-slate-800 bg-[#0d141f] px-2.5 py-1.5 text-[9px] text-slate-400"
                title={source}
              >
                <Database size={11} className="shrink-0 text-violet-400" />
                Data Federated by{" "}
                <span className="text-slate-200">Zetaris</span>
              </span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-1.5 font-mono text-[9px] text-slate-500 2xl:flex">
                <StatusDot active={connected} />
                {desk.loading
                  ? "CONNECTING"
                  : connected
                    ? "API CONNECTED"
                    : "API OFFLINE"}
              </span>
              <button
                className="button-quiet !border-cyan-800/50 !bg-cyan-950/25 !text-cyan-200 hover:!bg-cyan-950/60"
                disabled={desk.busy && !demo}
                onClick={() => void desk.run(true)}
              >
                <Play size={12} fill="currentColor" />
                <span className="hidden sm:inline">
                  {demo && desk.busy
                    ? "Restart demo replay"
                    : "1-Click Demo Replay"}
                </span>
                <span className="sm:hidden">Demo Replay</span>
              </button>
            </div>
          </div>
        </header>
        <main
          id="investigation-console"
          className="mx-auto max-w-[1760px] px-4 pb-6 pt-7 sm:px-6 2xl:px-8"
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mb-3 flex items-center gap-2 font-mono text-[9px] tracking-wider text-slate-500">
                <ShieldCheck size={11} />
                <span>INTELLIGENCE WORKSPACE</span>
                <ChevronRight size={10} />
                <span className="text-slate-400">AML OPERATIONS</span>
              </div>
              <h1 className="text-[28px] font-medium leading-none tracking-[-0.055em] text-slate-100 sm:text-[32px]">
                Forensic console<span className="text-cyan-300">.</span>
              </h1>
              <p className="mt-3 text-[11px] text-slate-500 sm:text-xs">
                Follow the money. Inspect the reasoning. Verify the proof.
              </p>
            </div>
            <div className="flex items-center gap-5 sm:gap-7">
              <div>
                <p className="eyebrow">Flagged wires</p>
                <p className="mt-2 font-mono text-xl font-light text-slate-200">
                  {desk.loading
                    ? "—"
                    : String(desk.alerts.length).padStart(2, "0")}
                  <span className="ml-2 text-[9px] text-amber-400">
                    IN QUEUE
                  </span>
                </p>
              </div>
              <div className="h-9 w-px bg-slate-800" />
              <div>
                <p className="eyebrow">Review volume</p>
                <p className="mt-2 font-mono text-xl font-light tracking-tight text-slate-200">
                  {desk.loading ? "—" : money(volume)}
                </p>
              </div>
              <div className="hidden h-9 w-px bg-slate-800 sm:block" />
              <div className="hidden sm:block">
                <p className="eyebrow">
                  {demo ? "Replays complete" : "Session verdicts"}
                </p>
                <p className="mt-2 font-mono text-xl font-light text-cyan-300">
                  {String(complete).padStart(2, "0")}
                </p>
              </div>
            </div>
          </div>
          <AnimatePresence>
            {demo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-violet-800/40 bg-violet-950/20 px-4 py-3">
                  <FlaskConical
                    size={15}
                    className="shrink-0 text-violet-300"
                  />
                  <span className="font-mono text-[10px] font-medium tracking-wider text-violet-300">
                    SIMULATED DEMO
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Fictional fixtures · No model calls · Live memory unchanged
                  </span>
                  <button
                    className="ml-auto flex min-h-7 items-center gap-1.5 rounded px-2 text-[10px] text-violet-200 hover:bg-violet-400/10"
                    onClick={desk.exitDemo}
                  >
                    Exit replay
                    <X size={12} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!demo && desk.connectionError && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200"
            >
              <TriangleAlert size={15} className="shrink-0" />
              <span className="min-w-0 flex-1">{desk.connectionError}</span>
              <button
                className="button-quiet !text-amber-200"
                onClick={() => void desk.refresh()}
              >
                <RefreshCw size={12} />
                Retry connection
              </button>
            </div>
          )}
          {desk.error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200"
            >
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              {desk.error}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 font-mono text-[9px] text-slate-500">
              <span className="h-1 w-1 rounded-full bg-slate-500" />
              <span>ACTIVE CASE</span>
              <span className="text-slate-300">
                {desk.active?.record_id ?? "—"}
              </span>
              <span className="mx-1 text-slate-700">/</span>
              <span>{demo ? "REPLAY SESSION" : "GLASS-BOX INVESTIGATION"}</span>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[8px] text-slate-500">
              <Database size={10} />
              {source}
            </span>
          </div>
          <nav
            aria-label="Console sections"
            className="mb-4 grid grid-cols-3 gap-2 xl:hidden"
          >
            <a className="button-quiet" href="#wire-queue">
              Wire queue
            </a>
            <a className="button-quiet" href="#execution-trace">
              Execution trace
            </a>
            <a className="button-quiet" href="#evidence-dossier">
              Evidence dossier
            </a>
          </nav>
          <div
            className={`grid items-stretch gap-4 md:grid-cols-[minmax(230px,.75fr)_minmax(0,1.25fr)] xl:min-h-[800px] xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.4fr)_minmax(0,1.1fr)] ${demo ? "xl:h-[calc(100svh-365px)]" : "xl:h-[calc(100svh-290px)]"}`}
          >
            <WireQueue
              alerts={desk.alerts}
              active={desk.active}
              selected={desk.selected}
              choose={desk.choose}
              busy={desk.busy}
              loading={desk.loading}
              health={desk.health}
              results={desk.results}
              demo={demo}
              offline={!connected}
            />
            <ExecutionPipeline
              key={runKey}
              active={desk.active}
              trace={desk.trace}
              busy={desk.busy}
              loading={desk.loading}
              result={desk.result}
              health={desk.health}
              demo={demo}
              elapsed={desk.elapsed}
              run={() => void desk.run(demo)}
              cancel={desk.cancel}
            />
            <div className="min-h-0 min-w-0 md:col-span-2 xl:col-span-1 [&>section]:h-full">
              <EvidenceDossier
                key={runKey}
                result={desk.result}
                trace={desk.trace}
                busy={desk.busy}
                loading={desk.loading}
                demo={demo}
              />
            </div>
          </div>
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-1 text-[9px] text-slate-600">
            <p className="flex items-center gap-1.5">
              <ShieldCheck size={11} />
              <span>
                ProofTrace Agent<span className="mx-2 text-slate-700">/</span>
                GenAI.works Open Agent Hackathon 2026
              </span>
            </p>
            <p className="font-mono text-[8px] tracking-wider">
              TRACK 02<span className="mx-2 text-slate-700">/</span>THE AGENT
              THAT CAN EXPLAIN WHY
            </p>
          </footer>
          <div className="sr-only" role="status" aria-live="polite">
            {desk.busy
              ? `${demo ? "Simulated replay" : "Investigation"} running for ${desk.selected}.`
              : desk.result
                ? `${demo ? "Simulated replay" : "Investigation"} complete. Verdict: ${desk.result.verdict}.`
                : "Ready to investigate."}
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
