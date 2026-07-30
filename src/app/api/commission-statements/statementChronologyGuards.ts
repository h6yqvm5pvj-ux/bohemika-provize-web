const finiteChronologyMs = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const statementChronologyCanOverwrite = (
  incomingChronologyMs: number | null | undefined,
  existingChronologyMs: number | null | undefined
): boolean => {
  const incoming = finiteChronologyMs(incomingChronologyMs);
  const existing = finiteChronologyMs(existingChronologyMs);
  if (incoming == null || existing == null) return true;
  return incoming >= existing;
};
