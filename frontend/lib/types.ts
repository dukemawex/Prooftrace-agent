export type Row = Record<string, string | number | boolean | null>;
export type Alert = {
  record_id: string;
  beneficiary_id: string;
  beneficiary_name: string;
  sender_name: string;
  timestamp?: string;
  sender_country: string;
  beneficiary_country: string;
  amount_cents: number;
  currency: string;
  payment_memo: string;
  invoice_id?: string | null;
  invoice_amount_cents?: number | null;
  invoice_verified?: number;
  alert_reason: string;
  typology: string;
  memory_episodes: number;
  last_verdict: string | null;
  is_demo: number;
};
export type Health = {
  status: string;
  meterless: { configured: boolean };
  openrouter: { configured: boolean; model: string };
  model_runtime: { configured: boolean; preferred_provider: string | null };
  zetaris: {
    configured: boolean;
    fallback_enabled: boolean;
    fallback_database: string;
  };
  seed: { live_rows_stored?: number; seeded_at?: string; mode?: string };
  models: Record<string, string>;
};
export type TraceEvent = {
  id: number;
  type: string;
  at: string;
  stage?: string;
  status?: string;
  model?: string;
  provider?: string;
  reported_model?: string;
  fallback?: boolean;
  failure?: string;
  tool?: string;
  executed_sql?: string;
  rows?: Row[];
  source?: string;
  duration_ms?: number;
  fallback_reason?: string | null;
  result?: Record<string, unknown>;
  episodes?: number;
  message?: string;
};
export type Investigation = {
  run_id: string;
  txn_id: string;
  verdict: "CLEARED" | "ESCALATED" | "REVIEW";
  claims: {
    text: string;
    facts: { citation: string; field: string; value: unknown }[];
  }[];
  guard: {
    injection_detected: boolean;
    reason: string;
    memo_quarantined: boolean;
  };
  policy: {
    chain: string[];
    reason: string;
    sanctions_matches?: string[];
    ownership_complete?: boolean;
    cross_silo_checked?: boolean;
  };
  trace: TraceEvent[];
  evidence: Record<string, Row>;
  evidence_digest: string;
  data_source: string;
  citations_verified: boolean;
  memory_episodes_used: number;
  scope: string;
  models?: Record<string, string>;
  model_routes?: TraceEvent[];
  simulation?: {
    enabled: true;
    label: string;
    model_calls_made: false;
    memory_persisted: false;
  };
};
