import { NextResponse, type NextRequest } from "next/server";

export function cashflowShadowAllowedEmails(): Set<string> {
  return new Set((process.env.CASHFLOW_SHADOW_EMAILS ?? "")
    .split(/[,\s]+/).map(email => email.trim().toLowerCase()).filter(Boolean));
}

export async function readCashflowDiagnosticJson(req: NextRequest): Promise<unknown> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

type Phase = "auth" | "inputs" | "compute" | "hash" | "storage";

/** Monotonic, aggregate timing only. No request values or database identifiers. */
export function createCashflowDiagnosticTiming() {
  const start = performance.now();
  const phases = new Map<Phase, number>();
  const elapsed = (since: number) => Math.max(0, performance.now() - since);
  return {
    async measure<T>(phase: Phase, work: () => T | Promise<T>): Promise<T> {
      const since = performance.now();
      try { return await work(); }
      finally { phases.set(phase, (phases.get(phase) ?? 0) + elapsed(since)); }
    },
    json(body: unknown, status = 200): NextResponse {
      const metrics = [...phases].map(([phase, ms]) => `cashflow_${phase};dur=${ms.toFixed(2)}`);
      metrics.push(`cashflow_total;dur=${elapsed(start).toFixed(2)}`);
      return NextResponse.json(body, { status, headers: {
        "Cache-Control": "private, no-store", "Server-Timing": metrics.join(", "),
      } });
    },
  };
}
