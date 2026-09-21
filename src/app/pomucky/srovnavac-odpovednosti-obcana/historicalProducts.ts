import type { LiabilityInsurer, LiabilityProduct } from "./products";

// Historické verze ze screenshotů dodaných 21. 9. 2026. Srovnávací údaje doplníme samostatně.
export const HISTORICAL_LIABILITY_INSURERS: LiabilityInsurer[] = [
  {
    id: "allianz", name: "Allianz", logoPath: "/icons/allianz.png",
    products: [
      { id: "mujdomov-2019-01-01", name: "MůjDomov", date: "1. 1. 2019" },
      { id: "mujdomov-2021-11-26", name: "MŮJDOMOV", date: "26. 11. 2021" },
      { id: "mujdomov-2022-11-01", name: "MůjDomov", date: "1. 11. 2022" },
      { id: "mujdomov-2023-06-01", name: "MŮJDOMOV", date: "1. 6. 2023" },
      { id: "mujdomov-2025-05-16", name: "MůjDomov", date: "16. 5. 2025" },
    ],
  },
  {
    id: "axa", name: "AXA", logoPath: "/icons/axalogo.png",
    products: [
      { id: "domov-in-standard-2019-01-01", name: "Domov IN Standard", date: "1. 1. 2019" },
      { id: "domov-in-plus-2019-01-01", name: "Domov IN Plus", date: "1. 1. 2019" },
      { id: "domov-in-extra-2019-01-01", name: "Domov IN Extra", date: "1. 1. 2019" },
    ],
  },
  {
    id: "cpp", name: "ČPP", logoPath: "/icons/cpp.png",
    products: [
      { id: "domex-plus-2019-01-01", name: "DOMEX+", date: "1. 1. 2019" },
      { id: "domex-plus-2022-08-01", name: "DOMEX+", date: "1. 8. 2022" },
    ],
  },
  {
    id: "csob", name: "ČSOB", logoPath: "/icons/csb.png",
    products: [
      { id: "nase-odpovednost-2018-04-01", name: "Naše odpovědnost", date: "1. 4. 2018" },
      { id: "nase-odpovednost-2020-03-01", name: "Naše odpovědnost", date: "1. 3. 2020" },
      { id: "nase-odpovednost-2022-10-01", name: "Naše odpovědnost", date: "1. 10. 2022" },
    ],
  },
  {
    id: "direct", name: "Direct", logoPath: "/icons/direct.png",
    products: [
      { id: "pojisteni-odpovednosti-2019-01-01", name: "Pojištění odpovědnosti", date: "1. 1. 2019" },
      { id: "majetkove-pojisteni-2021-08-06", name: "Majetkové pojištění", date: "6. 8. 2021" },
      { id: "majetkove-pojisteni-2021-10-01", name: "Majetkové pojištění", date: "1. 10. 2021" },
      { id: "majetkove-pojisteni-2024-08-01", name: "Majetkové pojištění", date: "1. 8. 2024" },
    ],
  },
  {
    id: "generali", name: "Generali Česká", logoPath: "/icons/generali.png",
    products: [
      { id: "muj-majetek-2020-01-01", name: "Můj majetek", date: "1. 1. 2020" },
      { id: "muj-majetek-2020-11-23", name: "Můj Majetek", date: "23. 11. 2020" },
      { id: "muj-majetek-2-0-2021-11-20", name: "Můj Majetek 2.0", date: "20. 11. 2021" },
      { id: "muj-majetek-2-0-2022-09-17", name: "Můj majetek 2.0", date: "17. 9. 2022" },
      { id: "muj-majetek-2-0-2022-11-12", name: "Můj majetek 2.0", date: "12. 11. 2022" },
      { id: "muj-majetek-2-0-2024-05-27", name: "Můj majetek 2.0", date: "27. 5. 2024" },
    ],
  },
  {
    id: "komercni-pojistovna", name: "Komerční pojišťovna", logoPath: "/icons/kblogo.png",
    products: [
      { id: "majetek-2018-09-01", name: "Majetek", date: "1. 9. 2018" },
      { id: "majetek-2020-08-27", name: "Majetek", date: "27. 8. 2020" },
      { id: "pojisteni-majetek-2021-12-06", name: "POJIŠTĚNÍ MAJETEK", date: "6. 12. 2021" },
    ],
  },
  {
    id: "kooperativa", name: "Kooperativa", logoPath: "/icons/koop-v2.png",
    products: [
      { id: "pojisteni-odpovednosti-2019-01-01", name: "Pojištění odpovědnosti", date: "1. 1. 2019" },
      { id: "pojisteni-odpovednosti-2021-05-01", name: "Pojištění odpovědnosti", date: "1. 5. 2021" },
    ],
  },
  {
    id: "maxima", name: "Maxima", logoPath: "/icons/maxima.png",
    products: [
      { id: "maxdomov-3-2021-10-18", name: "MaxDomov3", date: "18. 10. 2021" },
      { id: "maxdomov-3-1-2023-01-16", name: "MaxDomov 3.1", date: "16. 1. 2023" },
    ],
  },
  {
    id: "pillow", name: "Pillow", logoPath: "/icons/pillow.png",
    products: [
      { id: "zakladni-2021-10-01", name: "Základní varianta", date: "1. 10. 2021" },
      { id: "rozsirena-2021-10-01", name: "Rozšířená varianta", date: "1. 10. 2021" },
      { id: "kompletni-2021-10-01", name: "Kompletní varianta", date: "1. 10. 2021" },
      { id: "zakladni-2022-09-15", name: "Základní varianta", date: "15. 9. 2022" },
      { id: "rozsirena-2022-09-15", name: "Rozšířená varianta", date: "15. 9. 2022" },
      { id: "kompletni-2022-09-15", name: "Kompletní varianta", date: "15. 9. 2022" },
      { id: "zakladni-2023-05-12", name: "Základní varianta", date: "12. 5. 2023" },
      { id: "rozsirena-2023-05-12", name: "Rozšířená varianta", date: "12. 5. 2023" },
      { id: "kompletni-2023-05-12", name: "Kompletní varianta", date: "12. 5. 2023" },
      { id: "rozsirena-2024-04-01", name: "Rozšířená varianta", date: "1. 4. 2024" },
      { id: "zakladni-2024-04-01", name: "Základní varianta", date: "1. 4. 2024" },
      { id: "kompletni-2024-04-01", name: "Kompletní varianta", date: "1. 4. 2024" },
    ],
  },
  {
    id: "slavia", name: "Slavia", logoPath: "/icons/slavialogo.png",
    products: [
      { id: "stastny-domov-zaklad-2022-02-01", name: "Šťastný domov Základ", date: "1. 2. 2022" },
      { id: "stastny-domov-jistota-2022-02-01", name: "Šťastný domov Jistota", date: "1. 2. 2022" },
      { id: "stastny-domov-jubileum-2022-02-01", name: "Šťastný domov Jubileum", date: "1. 2. 2022" },
      { id: "stastny-domov-zaklad-2023-05-01", name: "Šťastný domov Základ", date: "1. 5. 2023" },
      { id: "stastny-domov-jistota-2023-05-01", name: "Šťastný domov Jistota", date: "1. 5. 2023" },
      { id: "stastny-domov-jubileum-2023-05-01", name: "Šťastný domov Jubileum", date: "1. 5. 2023" },
    ],
  },
  {
    id: "uniqa", name: "UNIQA", logoPath: "/icons/uniqa.png",
    products: [
      { id: "pojisteni-odpovednosti-2018-11-01", name: "Pojištění odpovědnosti", date: "1. 11. 2018" },
      { id: "domov-bezpeci-plus-2022-11-01", name: "Domov & bezpečí PLUS", date: "1. 11. 2022" },
      { id: "domov-bezpeci-extra-2022-11-01", name: "Domov & bezpečí EXTRA", date: "1. 11. 2022" },
      { id: "domov-bezpeci-plus-2024-10-01", name: "Domov & bezpečí PLUS", date: "1. 10. 2024" },
      { id: "domov-bezpeci-extra-2024-10-01", name: "Domov & bezpečí EXTRA", date: "1. 10. 2024" },
    ],
  },
  {
    id: "pvzp", name: "Pojišťovna VZP", logoPath: "/icons/pvzp.webp",
    products: [
      { id: "pojisteni-odpovednosti-2022-08-11", name: "Pojištění odpovědnosti", date: "11. 8. 2022" },
    ],
  },
];

export const HISTORICAL_LIABILITY_PRODUCTS: LiabilityProduct[] = HISTORICAL_LIABILITY_INSURERS.flatMap((insurer) =>
  insurer.products.map((product) => ({
    id: `${insurer.id}:${product.id}`,
    productName: product.name,
    date: product.date,
    insurerName: insurer.name,
    logoPath: insurer.logoPath,
  })),
);
