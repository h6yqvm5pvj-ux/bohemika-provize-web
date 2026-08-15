export type OnlineCardHeroArtwork = {
  src: string;
  alt: string;
};

type OnlineCardHeroArtworkMatch = {
  slugs: readonly string[];
  emails: readonly string[];
  fullNames: readonly string[];
  artwork: OnlineCardHeroArtwork;
};

const ONLINE_CARD_HERO_ARTWORKS: readonly OnlineCardHeroArtworkMatch[] = [
  {
    slugs: ["jakub-rauscher"],
    emails: ["jakub.rauscher@bohemika.eu"],
    fullNames: ["jakub rauscher"],
    artwork: {
      src: "/images/jakub-rauscher-signature.png",
      alt: "Kovová osobní značka Jakuba Rauschera",
    },
  },
  {
    slugs: ["jakub-pokorny"],
    emails: ["jakub.pokorny@bohemika.eu"],
    fullNames: ["jakub pokorny"],
    artwork: {
      src: "/images/jakub-pokorny-signature.png",
      alt: "Kovová osobní značka Jakuba Pokorného",
    },
  },
];

const normalizeIdentity = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function getOnlineCardHeroArtwork({
  slug = "",
  email = "",
  fullName = "",
}: {
  slug?: string;
  email?: string;
  fullName?: string;
}): OnlineCardHeroArtwork | null {
  const normalizedSlug = normalizeIdentity(slug);
  const normalizedEmail = normalizeIdentity(email);
  const normalizedFullName = normalizeIdentity(fullName);

  return (
    ONLINE_CARD_HERO_ARTWORKS.find(
      (entry) =>
        entry.slugs.includes(normalizedSlug) ||
        entry.emails.includes(normalizedEmail) ||
        entry.fullNames.includes(normalizedFullName)
    )?.artwork ?? null
  );
}
