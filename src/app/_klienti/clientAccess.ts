export const TEST_CLIENT_NAME = "Martin Březina";
export const TEST_CLIENT_SLUG = "martin-brezina";

// Client cards are still a private pilot. Check the full token email on the
// server as well as in the UI; a matching local part is not an authorization.
export const CLIENT_CARD_PILOT_OWNER_EMAIL = "jakub.rauscher@bohemika.eu";

export const canAccessClientCards = (email: string | null | undefined): boolean =>
  email?.trim().toLowerCase() === CLIENT_CARD_PILOT_OWNER_EMAIL;

export const normalizeClientIdentity = (value: string | null | undefined): string =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

export const isTestClientName = (value: string | null | undefined): boolean =>
  normalizeClientIdentity(value) === normalizeClientIdentity(TEST_CLIENT_NAME);

export const clientCardHrefForName = (name: string | null | undefined): string | null =>
  isTestClientName(name) ? `/klienti/${TEST_CLIENT_SLUG}` : null;
