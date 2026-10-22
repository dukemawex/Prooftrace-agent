import type { ReactNode } from "react";
import { CircleDot, Loader2 } from "lucide-react";

export function PanelHeading({
  icon,
  title,
  aside,
}: {
  icon: ReactNode;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-slate-500">{icon}</span>
        <h2 className="panel-title">{title}</h2>
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
