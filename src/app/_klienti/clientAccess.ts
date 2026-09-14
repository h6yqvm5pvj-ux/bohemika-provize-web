import { clientSlugForName } from "./clientIdentity";

// Keep the original pilot URL so its saved card remains reachable.
export const TEST_CLIENT_SLUG = "martin-brezina";

// Keep the original pilot account as a fixture/reference. Access is now for
// authenticated advisers; API guards validate the internal profile and role.
export const CLIENT_CARD_PILOT_OWNER_EMAIL = "jakub.rauscher@bohemika.eu";

export const canAccessClientCards = (email: string | null | undefined): boolean =>
  Boolean(email?.trim());

export const clientCardHrefForName = (name: string | null | undefined): string | null => {
  const slug = clientSlugForName(name);
  return slug ? `/klienti/${slug}` : null;
};
