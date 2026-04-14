export type BoxTheme = "slate" | "blue" | "sky" | "violet" | "emerald";

export type BoxThemeOption = {
  id: BoxTheme;
  label: string;
  surfaceStrong: string;
  focus: string;
  swatchFrom: string;
  swatchTo: string;
};

export const DEFAULT_BOX_THEME: BoxTheme = "slate";
export const BOX_THEME_LOCAL_STORAGE_KEY = "settings.boxTheme";
export const BOX_THEME_EVENT = "settings:updateBoxTheme";

const BOX_THEME_OPTIONS_MAP: Record<BoxTheme, BoxThemeOption> = {
  slate: {
    id: "slate",
    label: "Tmavá",
    surfaceStrong: "#0f172a",
    focus: "rgba(16, 185, 129, 0.35)",
    swatchFrom: "#1e293b",
    swatchTo: "#0f172a",
  },
  blue: {
    id: "blue",
    label: "Modrá",
    surfaceStrong: "#1d4ed8",
    focus: "rgba(37, 99, 235, 0.34)",
    swatchFrom: "#2563eb",
    swatchTo: "#1d4ed8",
  },
  sky: {
    id: "sky",
    label: "Světle modrá",
    surfaceStrong: "#0369a1",
    focus: "rgba(2, 132, 199, 0.35)",
    swatchFrom: "#0284c7",
    swatchTo: "#0369a1",
  },
  violet: {
    id: "violet",
    label: "Fialová",
    surfaceStrong: "#6d28d9",
    focus: "rgba(124, 58, 237, 0.35)",
    swatchFrom: "#7c3aed",
    swatchTo: "#6d28d9",
  },
  emerald: {
    id: "emerald",
    label: "Zelená",
    surfaceStrong: "#047857",
    focus: "rgba(5, 150, 105, 0.34)",
    swatchFrom: "#059669",
    swatchTo: "#047857",
  },
};

export const BOX_THEME_OPTIONS: BoxThemeOption[] = Object.values(
  BOX_THEME_OPTIONS_MAP
);

export const isBoxTheme = (value: unknown): value is BoxTheme =>
  typeof value === "string" && value in BOX_THEME_OPTIONS_MAP;

export const resolveBoxTheme = (value: unknown): BoxTheme =>
  isBoxTheme(value) ? value : DEFAULT_BOX_THEME;

export const getBoxThemeOption = (value: unknown): BoxThemeOption =>
  BOX_THEME_OPTIONS_MAP[resolveBoxTheme(value)];

export const applyBoxThemeToRoot = (value: unknown): BoxTheme => {
  const theme = resolveBoxTheme(value);
  if (typeof document === "undefined") return theme;

  const option = BOX_THEME_OPTIONS_MAP[theme];
  const root = document.documentElement;
  root.style.setProperty("--ui-surface-strong", option.surfaceStrong);
  root.style.setProperty("--ui-focus", option.focus);
  root.setAttribute("data-box-theme", theme);
  return theme;
};
