export const WALL_POST_PREVIEW_MAX_CHARACTERS = 700;
export const WALL_POST_PREVIEW_MAX_LINES = 10;

const visibleWallPostText = (value: string): string =>
  value.replace(/\*\*/g, "").trim();

export const shouldCollapseWallPostText = (value: string): boolean => {
  const visibleText = visibleWallPostText(value);
  if (visibleText.length > WALL_POST_PREVIEW_MAX_CHARACTERS) return true;
  return visibleText.split(/\r?\n/).length > WALL_POST_PREVIEW_MAX_LINES;
};

export const wallPostReadingMinutes = (value: string): number => {
  const words = visibleWallPostText(value).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
};
