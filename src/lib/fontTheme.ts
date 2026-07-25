export type FontTheme = "system";

export type FontThemeOption = {
  id: FontTheme;
  label: string;
  description: string;
  previewFamily: string;
  previewText: string;
};

export const DEFAULT_FONT_THEME: FontTheme = "system";
export const FONT_THEME_LOCAL_STORAGE_KEY = "settings.fontTheme";
export const FONT_THEME_EVENT = "settings:updateFontTheme";

const FONT_THEME_OPTIONS_MAP: Record<FontTheme, FontThemeOption> = {
  system: {
    id: "system",
    label: "Systémové UI",
    description: "Písmo podle zařízení",
    previewFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    previewText: "Rychlá liška 123",
  },
};

export const FONT_THEME_OPTIONS: FontThemeOption[] = Object.values(
  FONT_THEME_OPTIONS_MAP
);

export const isFontTheme = (value: unknown): value is FontTheme =>
  typeof value === "string" && value in FONT_THEME_OPTIONS_MAP;

export const resolveFontTheme = (value: unknown): FontTheme =>
  isFontTheme(value) ? value : DEFAULT_FONT_THEME;

export const getFontThemeOption = (value: unknown): FontThemeOption =>
  FONT_THEME_OPTIONS_MAP[resolveFontTheme(value)];

export const applyFontThemeToRoot = (value: unknown): FontTheme => {
  const theme = resolveFontTheme(value);
  if (typeof document === "undefined") return theme;
  document.documentElement.setAttribute("data-font-theme", theme);
  return theme;
};
