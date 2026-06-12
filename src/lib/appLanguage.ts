export type AppLanguage = "cs";

export const DEFAULT_APP_LANGUAGE: AppLanguage = "cs";
export const APP_LANGUAGE_LOCAL_STORAGE_KEY = "settings.language";
export const APP_LANGUAGE_EVENT = "app:language-change";

export const APP_LANGUAGE_OPTIONS: ReadonlyArray<{
  id: AppLanguage;
  label: string;
  flag: string;
  htmlLang: string;
}> = [
  {
    id: "cs",
    label: "Čeština",
    flag: "🇨🇿",
    htmlLang: "cs",
  },
];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "cs";
}

export function resolveAppLanguage(value: unknown): AppLanguage {
  void value;
  return DEFAULT_APP_LANGUAGE;
}

export function getAppLanguageMeta(language: AppLanguage) {
  return (
    APP_LANGUAGE_OPTIONS.find((option) => option.id === language) ??
    APP_LANGUAGE_OPTIONS[0]!
  );
}
