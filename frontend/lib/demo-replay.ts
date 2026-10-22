import fixtures from "./replay-fixtures.json";
import type { Alert, Investigation } from "./types";

// Static, fictional snapshots. This path never calls a model, SQL API, or memory store.
const replays = fixtures as unknown as Record<string, Investigation>;
export const DEMO_ALERTS: Alert[] = Object.values(replays).map((run) => ({
  ...(run.evidence[`aml_transactions.${run.txn_id}`] as unknown as Alert),
  memory_episodes: 0,
  last_verdict: null,
}));

export function createReplay(txnId: string): Investigation {
  const fixture = replays[txnId] ?? replays["TXN-9002"];
  return {
    ...structuredClone(fixture),
    run_id: `demo-${fixture.txn_id}-${Date.now()}`,
  };
}

export function replayDelay(type: string, status?: string): number {
  if (type === "stage") return status === "running" ? 850 : 350;
  return type === "query" ? 340 : 220;
}
