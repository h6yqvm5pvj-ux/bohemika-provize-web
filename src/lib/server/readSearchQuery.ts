export async function readSearchQuery(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const reader = contentType === "text/plain" ? request.body?.getReader() : undefined;
  if (!reader) return null;

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let query = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 512) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      query += decoder.decode(value, { stream: true });
    }
    query = (query + decoder.decode()).trim();
    return query.length >= 2 && query.length <= 120 ? query : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
