import type { AccountSetupTimelineItem } from "./useAccountSetupFlow";

const key = (uid: string) => `bohemka:career-draft:${uid}`;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Ignore row IDs: older profiles may receive new generated IDs on each read.
export function careerSignature(rows: AccountSetupTimelineItem[]) {
  return JSON.stringify(rows.map(({ position, validFrom, validTo }) => ({ position, validFrom, validTo })));
}

export function clearCareerDraft(uid: string) {
  try { sessionStorage.removeItem(key(uid)); } catch { /* Storage may be unavailable. */ }
}

export function saveCareerDraft(uid: string, baseline: string, rows: AccountSetupTimelineItem[]): boolean {
  if (!uid) return false;
  try {
    sessionStorage.setItem(key(uid), JSON.stringify({ baseline, rows, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}

export function restoreCareerDraft(uid: string, baseline: string, positions: Set<string>): AccountSetupTimelineItem[] | null {
  if (!uid) return null;
  try {
    const raw = sessionStorage.getItem(key(uid));
    if (!raw) return null;
    if (raw.length > 100_000) throw new Error("oversized draft");
    const draft = JSON.parse(raw);
    if (draft.baseline !== baseline || !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > MAX_AGE_MS ||
      !Array.isArray(draft.rows) || draft.rows.length > 100 || !draft.rows.every((row: AccountSetupTimelineItem) =>
        row && typeof row.id === "string" && row.id.length <= 100 && (row.position === "" || positions.has(row.position)) &&
        typeof row.validFrom === "string" && /^(\d{4}-\d{2}-\d{2})?$/.test(row.validFrom) &&
        (row.ongoing === undefined || typeof row.ongoing === "boolean") && typeof row.validTo === "string" && /^(\d{4}-\d{2}-\d{2})?$/.test(row.validTo))) throw new Error("stale or invalid draft");
    return draft.rows.map(({ id, position, validFrom, validTo, ongoing }: AccountSetupTimelineItem) => ({ id, position, validFrom, validTo, ongoing }));
  } catch {
    clearCareerDraft(uid);
    return null;
  }
}
