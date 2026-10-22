import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const path = params.path.join("/");
  if (!/^(alerts|health|investigate\/[A-Za-z0-9_-]{1,80})$/.test(path)) {
    return Response.json({ detail: "Unknown API route" }, { status: 404 });
  }
  const base = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const response = await fetch(
      `${base}/api/${path}${request.nextUrl.search}`,
      {
        method: request.method,
        cache: "no-store",
        signal: request.signal,
        headers: process.env.PROOFTRACE_API_KEY
          ? { "X-ProofTrace-Key": process.env.PROOFTRACE_API_KEY }
          : {},
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json(
      {
        detail:
          "The investigation API is unavailable. Start the FastAPI backend and check BACKEND_URL.",
      },
      { status: 503 },
    );
  }
}

export { proxy as GET, proxy as POST };
