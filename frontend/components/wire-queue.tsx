"use client";

import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Database,
  History,
  Inbox,
  Info,
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
        step="01"
        title="Flagged wire queue"
        subtitle="Select a transfer to inspect"
        aside={
          <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-0.5 font-mono text-[9px] text-slate-300">
            <StatusDot active={!offline || demo} />
            {demo ? "DEMO" : offline ? "OFFLINE" : "LIVE"}
          </span>
        }
      />
      <div className="flex items-center justify-between px-5 pb-2.5 pt-3.5">
        <span className="eyebrow">3 test scenarios</span>
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
            const verdict =
              results[alert.record_id]?.verdict ?? alert.last_verdict;
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
                  <span className="font-mono text-xs font-semibold text-slate-200 group-hover:text-cyan-200">
                    {alert.record_id}
                  </span>
                  <span className={`badge ${color}`}>
                    {verdict === "CLEARED" ? (
                      <Check size={9} />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                    {severity}
                  </span>
                </div>
                <div className="mb-2 mt-1.5 flex items-baseline gap-2">
                  <span className="text-[23px] font-semibold leading-none tracking-[-0.04em] text-slate-50">
                    {money(alert.amount_cents, alert.currency)}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {alert.currency}
                  </span>
                </div>
                <p className="mb-2 text-[11px] font-medium text-cyan-300/90">
                  {alert.typology}
                </p>
                <div className="space-y-1 rounded-lg border border-slate-800/80 bg-[#080c15] px-2.5 py-2 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-400">
                    <ArrowUpRight size={11} className="shrink-0" />
                    <span className="truncate">
                      From: {alert.sender_name || "Originating account"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-medium text-slate-100">
                    <ArrowDownLeft
                      size={11}
                      className="shrink-0 text-cyan-300"
                    />
                    <span className="truncate">
                      To: {alert.beneficiary_name}
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 pt-1 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1.5 font-mono">
                    {alert.sender_country}
                    <ArrowRight size={10} className="text-cyan-400" />
                    {alert.beneficiary_country}
                  </span>
                  <span className="truncate">
                    {injection
                      ? "Prompt injection in memo"
                      : high
                        ? "2-hop shell ownership"
                        : "Verified invoice match"}
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
      <div className="mt-3 shrink-0 border-t border-slate-800/85 bg-[#080c15] px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
          <History size={14} className="text-cyan-300" />
          <span>Episodic memory</span>
          <span className="ml-auto rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
            {demo ? "ISOLATED" : "CONTEXT ONLY"}
          </span>
        </div>
        <div className="my-1.5 flex items-baseline gap-2">
          <motion.span
            key={active?.memory_episodes}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-xl font-semibold text-slate-100"
          >
            {demo
              ? "00"
              : String(active?.memory_episodes ?? 0).padStart(2, "0")}
          </motion.span>
          <span className="text-[11px] text-slate-400">
            prior beneficiary investigations
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          {demo
            ? "Replay isolated. Live risk memory unchanged."
            : "Past verdicts inform planning but never replace fresh SQL proof."}
        </p>
      </div>
      <details className="group mx-3.5 mb-3.5 mt-auto shrink-0 rounded-xl border border-slate-800/85 bg-[#080c15] p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <Database size={12} className="text-cyan-300" />
          <span className="eyebrow">Connected data tables</span>
          <ChevronDown
            size={12}
            className="ml-auto text-slate-500 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-3 space-y-2 text-[11px] text-slate-300">
          <div className="flex items-center justify-between">
            <span>1. Wire transfers (`aml_transactions`)</span>
            <span className="font-mono text-[10px] text-slate-400">SQL</span>
          </div>
          <div className="flex items-center justify-between">
            <span>2. Corporate ownership (`icij_kyc_entities`)</span>
            <span className="font-mono text-[10px] text-slate-400">KYC</span>
          </div>
          <div className="flex items-center justify-between">
            <span>3. Sanctions (`opensanctions_watchlist`)</span>
            <span className="font-mono text-[10px] text-cyan-300">
              {demo
                ? "FIXTURE"
                : `${health?.seed.live_rows_stored ?? "—"} rows`}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 border-t border-slate-800 pt-2.5 text-[10px] leading-relaxed text-slate-400">
          <Info size={12} className="mt-0.5 shrink-0 text-slate-400" />
          {demo || alerts.some((a) => a.is_demo)
            ? "Fictional case data inspired by IBM AMLSim & ICIJ structures, paired with 300 real OpenSanctions rows."
            : "Coverage is limited to the connected data sources."}
        </div>
      </details>
    </section>
  );
}
