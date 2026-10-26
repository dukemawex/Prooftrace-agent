"use client";

import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Check,
  ChevronDown,
  Database,
  FileCheck2,
  Inbox,
  Layers3,
  ShieldAlert,
} from "lucide-react";
import type { Alert, Health, Investigation } from "@/lib/types";
import { money, PanelHeading, StatusDot } from "./console-ui";

export function WireQueue({
  alerts,
  active,
  selected,
  choose,
  busy,
  loading,
  health,
  results,
  demo,
  offline,
}: {
  alerts: Alert[];
  active?: Alert;
  selected: string;
  choose: (id: string) => void;
  busy: boolean;
  loading: boolean;
  health: Health | null;
  results: Record<string, Investigation>;
  demo: boolean;
  offline: boolean;
}) {
  return (
    <section
      id="wire-queue"
      className="glass-panel flex min-h-0 flex-col overflow-hidden"
      aria-label="Flagged wire queue"
    >
      <PanelHeading
        icon={<Layers3 size={14} />}
        title="Flagged wire queue"
        aside={
          <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-2 py-0.5 font-mono text-[9px] text-slate-300">
            <StatusDot active={!offline || demo} />
            {demo ? "DEMO" : offline ? "OFFLINE" : "LIVE"}
          </span>
        }
      />
      <div className="flex items-center justify-between px-5 pb-2.5 pt-3.5">
        <span className="eyebrow">Priority triage queue</span>
        <span className="rounded border border-slate-700/70 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
          {loading ? "—" : String(alerts.length).padStart(2, "0")}
        </span>
      </div>
      <div
        className="min-h-0 space-y-2.5 overflow-y-auto px-3.5 pb-2"
        aria-busy={loading}
      >
        {loading ? (
          Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-800 p-4"
              aria-label="Loading wire"
            >
              <div className="flex justify-between">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-4 w-12" />
              </div>
              <div className="skeleton my-5 h-6 w-32" />
              <div className="skeleton mb-2 h-3 w-40" />
              <div className="skeleton h-3 w-28" />
            </div>
          ))
        ) : alerts.length ? (
          alerts.map((alert) => {
            const verdict = results[alert.record_id]?.verdict ?? alert.last_verdict;
            const injection = alert.typology
              .toLowerCase()
              .includes("injection");
            const high = alert.typology.toLowerCase().includes("sanctions");
            const severity =
              verdict === "CLEARED"
                ? "CLEARED"
                : verdict === "ESCALATED"
                  ? "ESCALATED"
                  : injection
                    ? "CRITICAL"
                    : high
                      ? "HIGH RISK"
                      : "REVIEW";
            const color =
              verdict === "CLEARED"
                ? "badge-cyan"
                : verdict === "ESCALATED" || injection
                  ? "badge-red"
                  : "badge-amber";
            return (
              <button
                key={alert.record_id}
                className="wire-card group"
                aria-pressed={selected === alert.record_id}
                disabled={busy}
                onClick={() => choose(alert.record_id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold tracking-tight text-slate-300 group-hover:text-cyan-200">
                    {alert.record_id}
                  </span>
                  <span className={`badge !py-0.5 ${color}`}>
                    {verdict === "CLEARED" ? (
                      <Check size={9} />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                    {severity}
                  </span>
                </div>
                <div className="mb-2.5 mt-2 flex items-baseline gap-2">
                  <span className="text-[24px] font-semibold leading-none tracking-[-0.05em] text-slate-50">
                    {money(alert.amount_cents, alert.currency)}
                  </span>
                  <span className="font-mono text-[9px] text-slate-500">
                    {alert.currency}
                  </span>
                  {selected === alert.record_id && (
                    <ArrowUpRight size={14} className="ml-auto text-cyan-300" />
                  )}
                </div>
                <div className="space-y-1 rounded-lg border border-slate-800/70 bg-[#070b13]/65 px-2.5 py-2 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-400">
                    <ArrowUpRight size={11} className="shrink-0 text-slate-500" />
                    <span className="truncate">
                      {alert.sender_name || "Originating account"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-100">
                    <ArrowDownLeft size={11} className="shrink-0 text-cyan-400" />
                    <span className="truncate">{alert.beneficiary_name}</span>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 pt-1">
                  <span className="flex items-center gap-1.5 rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                    {alert.sender_country}
                    <ArrowRight size={9} className="text-cyan-400" />
                    {alert.beneficiary_country}
                  </span>
                  <span className="flex items-center gap-1 truncate font-mono text-[9px] text-slate-400">
                    {alert.invoice_verified ? (
                      <>
                        <FileCheck2 size={10} className="shrink-0 text-cyan-400" />
                        <span>Invoice verified</span>
                      </>
                    ) : (
                      <span>
                        {injection
                          ? "Adversarial memo"
                          : high
                            ? "Ownership exposure"
                            : "Cross-border transfer"}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-700 px-5 py-10 text-center">
            <Inbox size={24} className="mb-3 text-slate-500" />
            <p className="text-xs text-slate-300">
              {offline ? "Queue unavailable" : "No flagged wires"}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {offline
                ? "Reconnect to the API or replay a demo case."
                : "New flagged transfers will appear here."}
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 shrink-0 border-t border-slate-800/80 bg-[#070b14]/50 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
          <BrainCircuit size={14} className="text-violet-400" />
          <span>Episodic memory</span>
          <span className="ml-auto rounded border border-violet-500/30 bg-violet-950/40 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-violet-300">
            {demo ? "ISOLATED" : "CONTEXT"}
          </span>
        </div>
        <div className="my-1.5 flex items-baseline gap-2">
          <motion.span
            key={active?.memory_episodes}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-xl font-medium text-slate-100"
          >
            {demo
              ? "00"
              : String(active?.memory_episodes ?? 0).padStart(2, "0")}
          </motion.span>
          <span className="text-[11px] text-slate-400">
            prior beneficiary episodes
          </span>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          {demo
            ? "Replay isolated. Live risk memory unchanged."
            : "Previous results are context, not evidence."}
        </p>
      </div>
      <details className="group mx-3.5 mb-3.5 mt-auto shrink-0 rounded-xl border border-slate-800/80 bg-[#070b14]/80 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <Database size={12} className="text-cyan-400/80" />
          <span className="eyebrow">Evidence sources</span>
          <ChevronDown
            size={12}
            className="ml-auto text-slate-500 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-3 space-y-2 text-[10px] text-slate-400">
          <div className="flex items-center justify-between">
            <span>AML transaction ledger</span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300">
              SQL
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Beneficial ownership</span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-violet-300">
              KYC
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>OpenSanctions watchlist</span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">
              {demo ? "FIXTURE" : (health?.seed.live_rows_stored ?? "—")}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-1.5 border-t border-slate-800/80 pt-2.5 text-[9px] leading-relaxed text-slate-500">
          <ShieldAlert size={11} className="mt-0.5 shrink-0 text-amber-400/80" />
          {demo || alerts.some((a) => a.is_demo)
            ? "Fictional case data. Watchlist sample does not establish real-world clearance."
            : "Coverage is limited to the connected data sources."}
        </div>
      </details>
    </section>
  );
}
