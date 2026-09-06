export type WallView = "all" | "saved" | "unread" | "following";
export type WallPersonalState = {
  saved: boolean;
  following: boolean;
  readAtMs: number | null;
};
export type WallPersonalAction = { field: "saved" | "following" | "read"; value: boolean };

export const isWallId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,180}$/.test(value);

export function normalizeWallPersonalState(value: unknown, defaultFollowing = false): WallPersonalState {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    saved: row.saved === true,
    following: typeof row.following === "boolean" ? row.following : defaultFollowing,
    readAtMs: typeof row.readAtMs === "number" && Number.isFinite(row.readAtMs) && row.readAtMs > 0
      ? row.readAtMs : null,
  };
}

export function parseWallPersonalAction(value: unknown): WallPersonalAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => key !== "field" && key !== "value")) return null;
  if ((row.field !== "saved" && row.field !== "following" && row.field !== "read") || typeof row.value !== "boolean") return null;
  return { field: row.field, value: row.value };
}

export function matchesWallView(state: WallPersonalState, view: WallView): boolean {
  return view === "saved" ? state.saved : view === "following" ? state.following : view === "unread" ? state.readAtMs === null : true;
}

export function wallPersonalPatch(state: WallPersonalState, action: WallPersonalAction, now: number): Partial<WallPersonalState> {
  return action.field === "read"
    ? { readAtMs: action.value ? state.readAtMs ?? now : null }
    : { [action.field]: action.value };
}
