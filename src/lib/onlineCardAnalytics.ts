export const ONLINE_CARD_ANALYTICS_EVENTS = [
  "visit",
  "phone_click",
  "email_click",
  "website_click",
  "map_click",
  "vcard_download",
  "meeting_open",
  "meeting_submitted",
  "travel_visit",
  "travel_plan",
  "travel_submitted",
] as const;

export type OnlineCardAnalyticsEvent = (typeof ONLINE_CARD_ANALYTICS_EVENTS)[number];

export type OnlineCardAnalyticsEventCounts = Record<OnlineCardAnalyticsEvent, number>;

export type OnlineCardAnalyticsDay = {
  day: string;
  events: OnlineCardAnalyticsEventCounts;
};

export const EMPTY_ONLINE_CARD_ANALYTICS_EVENTS = (): OnlineCardAnalyticsEventCounts => ({
  visit: 0,
  phone_click: 0,
  email_click: 0,
  website_click: 0,
  map_click: 0,
  vcard_download: 0,
  meeting_open: 0,
  meeting_submitted: 0,
  travel_visit: 0,
  travel_plan: 0,
  travel_submitted: 0,
});

export const isOnlineCardAnalyticsEvent = (value: unknown): value is OnlineCardAnalyticsEvent =>
  typeof value === "string" &&
  (ONLINE_CARD_ANALYTICS_EVENTS as readonly string[]).includes(value);

/** Older set(..., { merge: true }) writes created literal "events.visit" keys. */
export function readOnlineCardAnalyticsCounts(value: unknown): OnlineCardAnalyticsEventCounts {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nested = row.events && typeof row.events === "object" ? row.events as Record<string, unknown> : {};
  const count = (value: unknown) => {
    const n = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const events = EMPTY_ONLINE_CARD_ANALYTICS_EVENTS();
  for (const event of ONLINE_CARD_ANALYTICS_EVENTS) {
    events[event] = count(nested[event]) + count(row[`events.${event}`]);
  }
  return events;
}
