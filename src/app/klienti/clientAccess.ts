export const TEST_CLIENT_NAME = "Martin Březina";
export const TEST_CLIENT_SLUG = "martin-brezina";

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
