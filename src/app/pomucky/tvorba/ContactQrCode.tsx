import { useEffect, useState } from "react";
import { createQrSymbol, type QrSymbol } from "./contactQr";

export function ContactQrCode({ payload }: { payload: string }) {
  const [result, setResult] = useState<{ payload: string; symbol?: QrSymbol; failed?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    createQrSymbol(payload).then(
      symbol => { if (!cancelled) setResult({ payload, symbol }); },
      () => { if (!cancelled) setResult({ payload, failed: true }); },
    );
    return () => { cancelled = true; };
  }, [payload]);
  const symbol = result?.payload === payload ? result.symbol : undefined;
  if (!symbol) return <span role="status">{result?.payload === payload && result.failed ? "QR se nepodařilo načíst" : "Připravuji QR…"}</span>;
  return <svg viewBox={`0 0 ${symbol.size} ${symbol.size}`} role="img" aria-label="QR kód vizitky" shapeRendering="crispEdges">
    <rect width={symbol.size} height={symbol.size} fill="#ffffff" />
    <path fill="#102d40" d={symbol.runs.map(run => `M${run.x} ${run.y}h${run.width}v1h-${run.width}z`).join("")} />
  </svg>;
}
