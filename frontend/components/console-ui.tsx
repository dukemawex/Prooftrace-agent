import type { ReactNode } from "react";
import { CircleDot, Fingerprint, Loader2 } from "lucide-react";

export function FingerprintMark({
  size = "md",
  scanning = false,
}: {
  size?: "sm" | "md" | "lg";
  scanning?: boolean;
}) {
  const dims =
    size === "lg"
      ? "h-14 w-14 rounded-2xl"
      : size === "sm"
        ? "h-8 w-8 rounded-xl"
        : "h-12 w-12 rounded-2xl";
  const iconSize = size === "lg" ? 32 : size === "sm" ? 18 : 26;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center border border-cyan-400/45 bg-gradient-to-b from-cyan-400/15 via-[#091826] to-[#060c16] shadow-[0_0_28px_-6px_rgba(34,211,238,0.45)] ${dims}`}
    >
      <span className="pointer-events-none absolute inset-1 rounded-xl border border-cyan-300/20" />
      <Fingerprint
        size={iconSize}
        strokeWidth={1.75}
        className="relative text-cyan-300"
      />
      {scanning && (
        <span className="scan-line pointer-events-none absolute inset-x-1.5 h-px bg-cyan-300/80 shadow-[0_0_8px_#22d3ee]" />
      )}
    </span>
  );
}

export function PanelHeading({
  icon,
  step,
  title,
  subtitle,
  aside,
}: {
  icon?: ReactNode;
  step?: string;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div className="flex min-w-0 items-center gap-3">
        {step ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-500/35 bg-cyan-950/50 font-mono text-[11px] font-bold text-cyan-300">
            {step}
          </span>
        ) : (
          icon && <span className="shrink-0 text-cyan-300">{icon}</span>
        )}
        <div className="min-w-0">
          <h2 className="panel-title">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {aside}
    </div>
  );
}

export function StatusDot({ active = true }: { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "live-dot bg-cyan-300" : "bg-slate-500"}`}
    />
  );
}

export function LoadingDots() {
  return (
    <span aria-label="Processing" className="inline-flex gap-1">
      <i className="h-1 w-1 animate-pulse rounded-full bg-cyan-300" />
      <i className="h-1 w-1 animate-pulse rounded-full bg-cyan-300 [animation-delay:200ms]" />
      <i className="h-1 w-1 animate-pulse rounded-full bg-cyan-300 [animation-delay:400ms]" />
    </span>
  );
}

export function RunStatus({
  busy,
  complete,
  demo,
}: {
  busy: boolean;
  complete: boolean;
  demo: boolean;
}) {
  return (
    <span
      className={`badge ${busy || complete ? "badge-cyan" : "badge-neutral"}`}
    >
      {busy ? (
        <Loader2 size={10} className="animate-spin" />
      ) : (
        <CircleDot size={10} />
      )}
      {busy
        ? demo
          ? "REPLAYING"
          : "INVESTIGATING"
        : complete
          ? demo
            ? "REPLAY COMPLETE"
            : "COMPLETE"
          : "STANDBY"}
    </span>
  );
}

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
