export type ComparisonPersonalization = {
  clientName: string;
  meetingDate: string;
  clientNeeds: string;
  advisorComment: string;
};

export const PERSONALIZATION_LIMITS = { clientName: 120, clientNeeds: 1000, advisorComment: 2000 } as const;
export const EMPTY_PERSONALIZATION: ComparisonPersonalization = {
  clientName: "", meetingDate: "", clientNeeds: "", advisorComment: "",
};

export function formatComparisonMeetingDate(value: string): string {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Zadejte platné datum schůzky.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Zadejte platné datum schůzky.");
  }
  return date.toLocaleDateString("cs-CZ", { timeZone: "UTC" });
}

export function normalizeComparisonPersonalization(value: Partial<ComparisonPersonalization> = {}): ComparisonPersonalization {
  const result = { ...EMPTY_PERSONALIZATION };
  for (const key of Object.keys(result) as Array<keyof ComparisonPersonalization>) {
    result[key] = (value[key] ?? "").replace(/\r\n?/g, "\n").trim();
  }
  result.clientName = result.clientName.replace(/\s+/g, " ");
  for (const key of Object.keys(PERSONALIZATION_LIMITS) as Array<keyof typeof PERSONALIZATION_LIMITS>) {
    if (result[key].length > PERSONALIZATION_LIMITS[key]) throw new Error("Zkraťte údaje pro klienta na uvedený počet znaků.");
  }
  formatComparisonMeetingDate(result.meetingDate);
  return result;
}

// Stable order within both groups keeps the contents and detailed comparison aligned.
export function prioritizeComparisonRows<T extends { id: string }>(rows: T[], pinnedIds: readonly string[]): T[] {
  const pinned = new Set(pinnedIds);
  return [...rows.filter(row => pinned.has(row.id)), ...rows.filter(row => !pinned.has(row.id))];
}
