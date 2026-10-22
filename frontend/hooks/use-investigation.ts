"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abortableDelay, readJSON, streamInvestigation } from "@/lib/api";
import { createReplay, DEMO_ALERTS, replayDelay } from "@/lib/demo-replay";
import type { Alert, Health, Investigation, TraceEvent } from "@/lib/types";

export function useInvestigation() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState("TXN-9002");
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [results, setResults] = useState<Record<string, Investigation>>({});
  const [demoResults, setDemoResults] = useState<Record<string, Investigation>>(
    {},
  );
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const startedAt = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    refreshController.current?.abort();
    const abort = new AbortController();
    refreshController.current = abort;
    const timeout = setTimeout(() => abort.abort(), 12_000);
    try {
      const [queue, status] = await Promise.all([
        fetch("/api/alerts", { cache: "no-store", signal: abort.signal }).then(
          readJSON<{ alerts: Alert[] }>,
        ),
        fetch("/api/health", { cache: "no-store", signal: abort.signal }).then(
          readJSON<Health>,
        ),
      ]);
      if (!mounted.current || refreshController.current !== abort) return;
      setAlerts(queue.alerts);
      setHealth(status);
      setConnectionError("");
    } catch (err) {
      if (!mounted.current || refreshController.current !== abort) return;
      setHealth(null);
      setConnectionError(
        abort.signal.aborted
          ? "The API connection timed out. Please retry."
          : err instanceof Error
            ? err.message
            : "Unable to connect to the API.",
      );
    } finally {
      clearTimeout(timeout);
      if (mounted.current && refreshController.current === abort)
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poll = setInterval(() => void refresh(), 30_000);
    return () => {
      mounted.current = false;
      generation.current++;
      clearInterval(poll);
      controller.current?.abort();
      refreshController.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setElapsed((Date.now() - startedAt.current) / 1000),
      100,
    );
    return () => clearInterval(timer);
  }, [busy]);

  function cancel() {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setError(
      "Run cancelled. No completed verdict is available for this attempt.",
    );
  }

  function choose(id: string) {
    if (busy) return;
    setSelected(id);
    setEvents([]);
    setError("");
    setElapsed(0);
  }

  function exitDemo() {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setMode("live");
    setEvents([]);
    setError("");
    setElapsed(0);
    if (!alerts.some((alert) => alert.record_id === selected))
      setSelected(alerts[0]?.record_id ?? "TXN-9002");
  }

  async function run(replay = false) {
    if (busy && !replay) return;
    controller.current?.abort();
    const token = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    startedAt.current = Date.now();
    const txnId =
      replay && !DEMO_ALERTS.some((a) => a.record_id === selected)
        ? "TXN-9002"
        : selected;
    setSelected(txnId);
    setMode(replay ? "demo" : "live");
    setBusy(true);
    setEvents([]);
    setError("");
    setElapsed(0);
    const save = replay ? setDemoResults : setResults;
    save((previous) => {
      const next = { ...previous };
      delete next[txnId];
      return next;
    });
    const current = () =>
      mounted.current && generation.current === token && !abort.signal.aborted;
    try {
      let completed: Investigation;
      if (replay) {
        completed = createReplay(txnId);
        for (const event of completed.trace) {
          if (!current()) return;
          setEvents((previous) => [...previous, event]);
          await abortableDelay(
            replayDelay(event.type, event.status),
            abort.signal,
          );
        }
      } else {
        completed = await streamInvestigation(txnId, abort.signal, (event) => {
          if (current()) setEvents((previous) => [...previous, event]);
        });
      }
      if (!current()) return;
      save((previous) => ({ ...previous, [txnId]: completed }));
      if (!replay) void refresh();
    } catch (err) {
      if (current())
        setError(
          err instanceof Error
            ? err.message
            : "The investigation could not complete.",
        );
    } finally {
      if (mounted.current && generation.current === token) setBusy(false);
    }
  }

  const result = (mode === "demo" ? demoResults : results)[selected];
  const queue = mode === "demo" ? DEMO_ALERTS : alerts;
  return {
    alerts: queue,
    health,
    selected,
    mode,
    result,
    results: mode === "demo" ? demoResults : results,
    active: queue.find((alert) => alert.record_id === selected),
    trace: busy ? events : (result?.trace ?? events),
    busy,
    loading: loading && mode === "live",
    error,
    connectionError,
    elapsed,
    choose,
    run,
    cancel,
    exitDemo,
    refresh,
  };
}
