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
  {
    slugs: ["vojtech-mahr"],
    emails: ["vojtech.mahr@bohemika.eu"],
    fullNames: ["vojtech mahr"],
    artwork: {
      src: "/images/vojtech-mahr-signature.png",
      alt: "Kovová osobní značka Vojtěcha Mahra",
    },
  },
  {
    slugs: ["michaela-kotabova"],
    emails: ["michaela.kotabova@bohemika.eu"],
    fullNames: ["michaela kotabova"],
    artwork: {
      src: "/images/michaela-kotabova-signature.png",
      alt: "Kovová osobní značka Michaely Kotábové",
    },
  },
  {
    slugs: ["manfred-totzauer"],
    emails: ["manfred.totzauer@bohemika.eu"],
    fullNames: ["manfred totzauer"],
    artwork: {
      src: "/images/manfred-totzauer-signature.png",
      alt: "Kovová osobní značka Manfreda Totzauera",
    },
  },
  {
    slugs: ["jindra-hajek", "jindrich-hajek"],
    emails: ["jindra.hajek@bohemika.eu", "jindrich.hajek@bohemika.eu"],
    fullNames: ["jindra hajek", "jindrich hajek"],
    artwork: {
      src: "/images/hajek-signature.png",
      alt: "Kovová osobní značka Jindřicha Hájka",
    },
  },
  {
    slugs: ["jiri-kopica"],
    emails: ["jiri.kopica@bohemika.eu"],
    fullNames: ["jiri kopica"],
    artwork: {
      src: "/images/jiri-kopica-signature.png",
      alt: "Kovová osobní značka Jiřího Kopici",
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
