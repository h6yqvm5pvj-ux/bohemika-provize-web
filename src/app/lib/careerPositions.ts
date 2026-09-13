import type { Position } from "@/app/types/domain";
import { POSITION_LABELS } from "./formatters";

export const CAREER_POSITIONS = Object.keys(POSITION_LABELS) as Position[];

export function normalizeCareerPositions(value: unknown): Position[] {
  if (!Array.isArray(value)) return [];
  return CAREER_POSITIONS.filter(position => value.includes(position));
}

/** Only positions actually held; future timeline entries are not career history yet. */
export function heldCareerPositions(
  profile: { position?: unknown; positionTimeline?: unknown } | null | undefined,
  now = new Date(),
): Position[] {
  if (!profile) return [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const positions: unknown[] = [profile.position];
  const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  for (const row of Array.isArray(profile.positionTimeline) ? profile.positionTimeline : []) {
    if (!row || typeof row !== "object") continue;
    const from = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const to = typeof row.validTo === "string" ? row.validTo.trim() : "";
    if (!isDay(from) || from > today || (to && (!isDay(to) || to < from))) continue;
    positions.push(row.position);
  }
  return normalizeCareerPositions(positions);
}
