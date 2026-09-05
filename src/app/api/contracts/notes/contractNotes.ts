const DAY_MS = 24 * 60 * 60 * 1000;
const TEN_YEARS_MS = 10 * 366 * DAY_MS;

export const CONTRACT_NOTE_MAX_LENGTH = 2_000;

export type ContractNoteMutationInput = {
  text: string;
  reminderEnabled: boolean;
  reminderAtMs: number | null;
};

export type ContractNoteDto = {
  id: string;
  text: string;
  reminderEnabled: boolean;
  reminderAtMs: number | null;
  reminderLastSentForAtMs: number | null;
  reminderSentAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  legacy: boolean;
};

type ValidationResult =
  | { ok: true; value: ContractNoteMutationInput }
  | { ok: false; error: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const normalizeContractNoteMutation = (
  value: unknown,
  nowMs = Date.now()
): ValidationResult => {
  if (!isPlainObject(value)) {
    return { ok: false, error: "Chybí údaje poznámky." };
  }

  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text) {
    return { ok: false, error: "Text poznámky nesmí být prázdný." };
  }
  if (text.length > CONTRACT_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Poznámka může mít nejvýše ${CONTRACT_NOTE_MAX_LENGTH} znaků.`,
    };
  }

  const reminderEnabled = value.reminderEnabled === true;
  if (!reminderEnabled) {
    return {
      ok: true,
      value: { text, reminderEnabled: false, reminderAtMs: null },
    };
  }

  const reminderAtMs = Number(value.reminderAtMs);
  if (!Number.isFinite(reminderAtMs) || reminderAtMs <= 0) {
    return { ok: false, error: "Vyber datum připomínky." };
  }
  const normalizedReminderAtMs = Math.round(reminderAtMs);
  if (normalizedReminderAtMs < nowMs - DAY_MS) {
    return { ok: false, error: "Datum připomínky nemůže být v minulosti." };
  }
  if (normalizedReminderAtMs > nowMs + TEN_YEARS_MS) {
    return { ok: false, error: "Datum připomínky je příliš vzdálené." };
  }

  return {
    ok: true,
    value: {
      text,
      reminderEnabled: true,
      reminderAtMs: normalizedReminderAtMs,
    },
  };
};

export const isSafeContractNoteId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 160 &&
  !value.includes("/") &&
  !value.includes("..");
