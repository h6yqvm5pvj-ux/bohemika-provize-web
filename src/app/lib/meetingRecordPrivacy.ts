const LEGACY_KEYS = ["lifeRecordFormDraft", "lifeRecordResultInput", "carRecord.resultsInput"];
const PREFIX = "bohemika:meeting-record:";
const MAX_AGE_MS = 20 * 60 * 1000;
export type MeetingRecordKind = "lifeDraft" | "lifeResults" | "carResults";
export type MeetingRecordContext = Readonly<{ uid: string; impersonatedEmail: string; generation: number }>;

let generation = 0;
let context: MeetingRecordContext | null = null;
// Keep navigation usable when the browser blocks storage.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export const getMeetingRecordContext = () => context;
export function subscribeMeetingRecordContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const isLegacyMeetingRecordKey = (key: string | null) => key !== null && LEGACY_KEYS.includes(key);

export function clearLegacyMeetingRecords(): void {
  if (typeof window === "undefined") return;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      for (const key of LEGACY_KEYS) window[name].removeItem(key);
    } catch { /* Storage may be disabled. Never adopt records with an unknown owner. */ }
  }
}

function decode<T>(raw: string | null, owner: MeetingRecordContext): T | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (entry?.uid !== owner.uid || entry?.impersonatedEmail !== owner.impersonatedEmail ||
      typeof entry.savedAt !== "number" || !Number.isFinite(entry.savedAt) ||
      entry.savedAt > Date.now() || Date.now() - entry.savedAt >= MAX_AGE_MS ||
      !entry.payload || typeof entry.payload !== "object" || Array.isArray(entry.payload)) return null;
    return entry.payload as T;
  } catch { return null; }
}

function discardRecords(keepOwner: MeetingRecordContext | null = null): void {
  memory.clear();
  if (typeof window === "undefined") return;
  try {
    const storage = window.sessionStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(PREFIX) && (!keepOwner || !decode(storage.getItem(key), keepOwner))) storage.removeItem(key);
    }
  } catch { /* The in-memory copy has already been removed. */ }
}

export function clearMeetingRecords(): void {
  clearLegacyMeetingRecords();
  discardRecords();
  // Invalidate delayed callbacks and reset mounted forms even if logout is offline.
  context = context ? Object.freeze({ ...context, generation: ++generation }) : null;
  listeners.forEach((listener) => listener());
}

export function setMeetingRecordIdentity(uid: string | null, impersonatedEmail = ""): void {
  clearLegacyMeetingRecords();
  if (typeof window === "undefined") return;
  const email = impersonatedEmail.trim().toLowerCase();
  if (uid && context?.uid === uid && context.impersonatedEmail === email) return;
  const previous = context;
  context = uid ? Object.freeze({ uid, impersonatedEmail: email, generation: ++generation }) : null;
  // A reload may restore this account's tab; changing an active account always clears it.
  discardRecords(previous ? null : context);
  listeners.forEach((listener) => listener());
}

export function suspendMeetingRecordSession(): void {
  // Remove rendered fields before a browser-history snapshot. A reload must verify
  // Firebase identity again before it can read this tab's saved data.
  memory.clear();
  context = null;
  listeners.forEach((listener) => listener());
}

export function writeMeetingRecord(kind: MeetingRecordKind, payload: object, owner: MeetingRecordContext): boolean {
  if (typeof window === "undefined" || context !== owner) return false;
  const key = `${PREFIX}${kind}`;
  const raw = JSON.stringify({ uid: owner.uid, impersonatedEmail: owner.impersonatedEmail, savedAt: Date.now(), payload });
  memory.set(key, raw);
  try { window.sessionStorage.setItem(key, raw); } catch { /* Navigation uses the memory copy. */ }
  return true;
}

export function readMeetingRecord<T>(kind: MeetingRecordKind, owner: MeetingRecordContext): T | null {
  if (typeof window === "undefined" || context !== owner) return null;
  const key = `${PREFIX}${kind}`;
  let raw = memory.get(key) ?? null;
  try { raw ??= window.sessionStorage.getItem(key); } catch { /* Use memory when storage is blocked. */ }
  const payload = decode<T>(raw, owner);
  if (!payload) {
    memory.delete(key);
    try { window.sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
  }
  return payload;
}
