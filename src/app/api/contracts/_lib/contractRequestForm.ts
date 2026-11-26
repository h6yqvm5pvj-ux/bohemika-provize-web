export function isContractOwnerEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s/@\x00-\x1f\x7f]+@[^\s/@\x00-\x1f\x7f]+\.[^\s/@\x00-\x1f\x7f]+$/.test(value);
}

export async function readContractFormBody(req: Request, maxBytes: number): Promise<URLSearchParams | 400 | 413 | 415> {
  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return 415;
  const reader = req.body?.getReader();
  if (!reader) return 400;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let raw = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return 413;
      }
      raw += decoder.decode(value, { stream: true });
    }
    return new URLSearchParams(raw + decoder.decode());
  } catch {
    return 400;
  } finally {
    reader.releaseLock();
  }
}
