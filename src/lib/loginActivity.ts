export const LOGIN_ACTIVITY_RETENTION_DAYS = 90;
export type LoginActivityOutcome = "success" | "denied" | "reported_failure" | "provider_accepted" | "provider_unknown";
export type LoginActivitySource = "web" | "client_report" | "session_history" | "firebase";
export type LoginActivity = {
  id: string;
  occurredAtMs: number;
  email: string | null;
  identityVerified: boolean;
  outcome: LoginActivityOutcome;
  stage: "session" | "password" | "mfa" | "passkey" | "provider";
  source: LoginActivitySource;
  country: string;
  city: string;
  ipLabel: string;
  device: string;
  reason: string;
  locationObservedAtMs: number;
  environment: string;
};
export type LoginActivityResponse = {
  ok: true;
  events: LoginActivity[];
  nextCursor: string | null;
  fromMs: number;
  checkedAtMs: number;
  retentionDays: number;
  trackingStartedAtMs: number | null;
};
export type LoginActivityGeoFilter = "all" | "foreign" | "cz" | "unknown";
export type LoginActivityResultFilter = "all" | LoginActivityOutcome;

const countryNames = new Intl.DisplayNames(["cs"], { type: "region" });
export function loginCountryLabel(country: string): string {
  if (!/^[A-Z]{2}$/.test(country) || country === "XX") return "Neznámá země";
  return countryNames.of(country) || country;
}
export function loginOutcomeLabel(outcome: LoginActivityOutcome): string {
  return { success: "Přihlášení přijato", denied: "Odmítnuto", reported_failure: "Nahlášený neúspěch",
    provider_accepted: "Ověření přijato", provider_unknown: "Výsledek neuveden" }[outcome];
}
export function filterLoginActivity(events: LoginActivity[], geo: LoginActivityGeoFilter, result: LoginActivityResultFilter, search: string) {
  const term = search.trim().toLocaleLowerCase("cs");
  return events.filter(event => {
    const known = /^[A-Z]{2}$/.test(event.country) && event.country !== "XX";
    if (geo === "foreign" && (!known || event.country === "CZ")) return false;
    if (geo === "cz" && event.country !== "CZ") return false;
    if (geo === "unknown" && known) return false;
    if (result !== "all" && event.outcome !== result) return false;
    return !term || [event.email, event.country, loginCountryLabel(event.country), event.city, event.ipLabel, event.device]
      .some(value => value?.toLocaleLowerCase("cs").includes(term));
  });
}
