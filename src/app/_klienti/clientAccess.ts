import { clientSlugForName } from "./clientIdentity";

// Keep the original pilot URL so its saved card remains reachable.
export const TEST_CLIENT_SLUG = "martin-brezina";

// Keep the original pilot account as a fixture/reference. Access is now for
// authenticated advisers; API guards validate the internal profile and role.
export const CLIENT_CARD_PILOT_OWNER_EMAIL = "jakub.rauscher@bohemika.eu";

export const canAccessClientCards = (email: string | null | undefined): boolean =>
  Boolean(email?.trim());

type ContractOrigin = {
  ownerEmail: string | null;
  entryId: string | null;
  fromList?: boolean;
};

export const clientCardHrefForName = (
  name: string | null | undefined,
  origin?: ContractOrigin,
): string | null => {
  const slug = clientSlugForName(name);
  if (!slug) return null;
  const href = `/klienti/${slug}`;
  if (!origin?.ownerEmail || !origin.entryId) return href;

  const query = new URLSearchParams({
    fromContract: `${origin.ownerEmail}___${origin.entryId}`,
  });
  if (origin.fromList) query.set("fromList", "1");
  return `${href}?${query}`;
};

export const contractReturnHrefFromClientCard = (
  params: Pick<URLSearchParams, "get">,
): string | null => {
  const slug = params.get("fromContract");
  if (!slug || /[/\\\u0000-\u001f]/.test(slug)) return null;
  const parts = slug.split("___");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) return null;

  // Rebuild a contract route from its identifier, never an arbitrary return URL.
  // Embedded details return as a full page, without their iframe-only flag.
  return `/smlouvy/${encodeURIComponent(slug)}${params.get("fromList") === "1" ? "?from=list" : ""}`;
};
