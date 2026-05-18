export const ADMIN_PANEL_EMAILS = [
  "jakub.rauscher@bohemika.eu",
  "vojtech.mahr@bohemika.eu",
] as const;

export const ADMIN_PANEL_EMAILS_LABEL = ADMIN_PANEL_EMAILS.join(", ");

const ADMIN_PANEL_EMAIL_SET = new Set<string>(ADMIN_PANEL_EMAILS);

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

export const isAdminPanelEmail = (value: string | null | undefined): boolean =>
  ADMIN_PANEL_EMAIL_SET.has(normalizeEmail(value));
