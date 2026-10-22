import type { Investigation, TraceEvent } from "./types";

export async function readJSON<T>(response: Response): Promise<T> {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `The API returned an unreadable response (${response.status}).`,
    );
  }
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "The API is unavailable. Please retry.",
    );
  }
  return data as T;
}

export async function streamInvestigation(
  txnId: string,
  signal: AbortSignal,
  onEvent: (event: TraceEvent) => void,
): Promise<Investigation> {
  const response = await fetch(
    `/api/investigate/${encodeURIComponent(txnId)}?stream=true`,
    {
      method: "POST",
      signal,
      cache: "no-store",
    },
  );
  if (!response.ok) await readJSON(response);
  if (!response.body)
    throw new Error("The investigation stream is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Investigation | undefined;
  function parse(packet: string) {
    const data = packet
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const event = JSON.parse(data);
    if (event.type === "error")
      throw new Error(
        event.message || "The investigation could not be verified.",
      );
    if (event.type === "result") result = event.result;
    else onEvent(event as TraceEvent);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      const packets = buffer.split("\n\n");
      buffer = packets.pop() || "";
      packets.forEach(parse);
      if (done) break;
    }
    if (buffer.trim()) parse(buffer);
    if (!result)
      throw new Error(
        "The stream ended before a verified verdict arrived. Please retry.",
      );
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
