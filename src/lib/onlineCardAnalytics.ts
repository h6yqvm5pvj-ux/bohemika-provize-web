export const ONLINE_CARD_ANALYTICS_EVENTS = [
  "visit",
  "phone_click",
  "email_click",
  "website_click",
  "map_click",
  "vcard_download",
  "meeting_open",
  "meeting_submitted",
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
});

export const isOnlineCardAnalyticsEvent = (value: unknown): value is OnlineCardAnalyticsEvent =>
  typeof value === "string" &&
  (ONLINE_CARD_ANALYTICS_EVENTS as readonly string[]).includes(value);
