export type LiabilityInsurer = {
  id: string;
  name: string;
  logoPath: string;
  products: {
    id: string;
    name: string;
    date: string;
  }[];
};

// Názvy a data verzí převzaty z podkladu dodaného 19. 9. 2026.
export const LIABILITY_INSURERS: LiabilityInsurer[] = [
  {
    id: "allianz",
    name: "Allianz",
    logoPath: "/icons/allianz.png",
    products: [
      { id: "mujdomov-2026-06-25", name: "MůjDomov", date: "25. 6. 2026" },
    ],
  },
  {
    id: "cpp",
    name: "ČPP",
    logoPath: "/icons/cpp.png",
    products: [
      { id: "domex-plus-2023-10-01", name: "DOMEX+", date: "1. 10. 2023" },
    ],
  },
  {
    id: "csob",
    name: "ČSOB",
    logoPath: "/icons/csb.png",
    products: [
      { id: "nase-odpovednost-2025-06-16", name: "Naše Odpovědnost", date: "16. 6. 2025" },
    ],
  },
  {
    id: "direct",
    name: "Direct",
    logoPath: "/icons/direct.png",
    products: [
      { id: "majetkove-pojisteni-2025-10-16", name: "Majetkové pojištění", date: "16. 10. 2025" },
    ],
  },
  {
    id: "generali",
    name: "Generali Česká",
    logoPath: "/icons/generali.png",
    products: [
      { id: "muj-majetek-2-0-2026-06-13", name: "Můj majetek 2.0", date: "13. 6. 2026" },
    ],
  },
  {
    id: "komercni-pojistovna",
    name: "Komerční pojišťovna",
    logoPath: "/icons/kblogo.png",
    products: [
      { id: "majetek-2024-2024-10-13", name: "MAJETEK 2024", date: "13. 10. 2024" },
    ],
  },
  {
    id: "kooperativa",
    name: "Kooperativa",
    logoPath: "/icons/koop-v2.png",
    products: [
      { id: "pojisteni-odpovednosti-2023-04-24", name: "Pojištění odpovědnosti", date: "24. 4. 2023" },
    ],
  },
  {
    id: "maxima",
    name: "Maxima",
    logoPath: "/icons/maxima.png",
    products: [
      { id: "maxdomov-4-0-2025-07-15", name: "MaxDomov 4.0", date: "15. 7. 2025" },
    ],
  },
  {
    id: "pillow",
    name: "Pillow",
    logoPath: "/icons/pillow.png",
    products: [
      { id: "zakladni-2025-09-10", name: "Základní varianta", date: "10. 9. 2025" },
      { id: "rozsirena-2025-09-10", name: "Rozšířená varianta", date: "10. 9. 2025" },
      { id: "kompletni-2025-09-10", name: "Kompletní varianta", date: "10. 9. 2025" },
    ],
  },
  {
    id: "slavia",
    name: "Slavia",
    logoPath: "/icons/slavialogo.png",
    products: [
      { id: "stastny-domov-zaklad-2026-02-01", name: "Šťastný domov Základ", date: "1. 2. 2026" },
      { id: "stastny-domov-jistota-2026-02-01", name: "Šťastný domov Jistota", date: "1. 2. 2026" },
      { id: "stastny-domov-jubileum-2026-02-01", name: "Šťastný domov Jubileum", date: "1. 2. 2026" },
    ],
  },
  {
    id: "uniqa",
    name: "UNIQA",
    logoPath: "/icons/uniqa.png",
    products: [
      { id: "domov-bezpeci-plus-2026-01-01", name: "Domov & bezpečí PLUS", date: "1. 1. 2026" },
      { id: "domov-bezpeci-extra-2026-01-01", name: "Domov & bezpečí EXTRA", date: "1. 1. 2026" },
    ],
  },
  {
    id: "pvzp",
    name: "Pojišťovna VZP",
    logoPath: "/icons/pvzp.webp",
    products: [
      { id: "pojisteni-odpovednosti-2025-02-28", name: "Pojištění odpovědnosti", date: "28. 2. 2025" },
    ],
  },
];

export const LIABILITY_PRODUCTS = LIABILITY_INSURERS.flatMap((insurer) =>
  insurer.products.map((product) => ({
    id: `${insurer.id}:${product.id}`,
    productName: product.name,
    date: product.date,
    insurerName: insurer.name,
    logoPath: insurer.logoPath,
  })),
);

export type LiabilityProduct = (typeof LIABILITY_PRODUCTS)[number];
