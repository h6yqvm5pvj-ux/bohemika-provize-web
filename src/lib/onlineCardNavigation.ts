import type { OnlineCardLocale } from "./onlineCardI18n";

/** Keep the selected language across internal profile links, including return links. */
export function onlineCardHref(path: string, locale: OnlineCardLocale): string {
  const url = new URL(path, "https://online-card.invalid");
  if (locale === "cs") url.searchParams.delete("lang");
  else url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function replaceOnlineCardLocale(locale: OnlineCardLocale): void {
  window.history.replaceState(
    window.history.state,
    "",
    onlineCardHref(window.location.href, locale),
  );
}
