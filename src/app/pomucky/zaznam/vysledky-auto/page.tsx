// src/app/pomucky/zaznam/vysledky-auto/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";

type Insurer =
  | "cpp"
  | "kooperativa"
  | "allianz"
  | "pillow"
  | "slavia"
  | "csob"
  | "uniqa";

interface CarResultsInput {
  hasLiability: boolean;
  liabilityLimit: string | null;

  hasCasco?: boolean;
  cascoDeductible?: string | null;

  assistance: boolean;
  assistanceLevel: string | null;
  annualMileage: string | null;

  glass: boolean;
  collisionAnimal: boolean;
  naturalHazard: boolean;
  vandalism: boolean;
  animalDamage: boolean;
  theft: boolean;

  discountCppProfi: boolean;
  discountUniqaNonOemGlass: boolean;
}

const INSURER_OPTIONS: { id: Insurer; label: string }[] = [
  { id: "cpp", label: "ČPP" },
  { id: "kooperativa", label: "Kooperativa" },
  { id: "allianz", label: "Allianz" },
  { id: "pillow", label: "Pillow" },
  { id: "slavia", label: "Slavia" },
  { id: "csob", label: "ČSOB" },
  { id: "uniqa", label: "UNIQA" },
];

function buildRecommendations(
  data: CarResultsInput | null,
  currentInsurer: Insurer | null
): string[] {
  if (!data) return [];

  const recs: string[] = [];

  // 1) Limity POV < 100/100
  if (data.hasLiability && data.liabilityLimit) {
    const match = data.liabilityLimit.match(/(\d+)/);
    if (match) {
      const first = parseInt(match[1], 10);
      if (first < 100) {
        recs.push(
          "Klient byl upozorněn že jím zvolené limity na POV mohou být nízké a to zejména v zahraničí."
        );
      }
    }
  }

  // 2) Asistence – základní
  if (data.assistance && data.assistanceLevel === "Základní") {
    recs.push(
      "Klient byl upozorněn že zvolil pouze základní asistenci a byla mu doporučena vyšší."
    );
  }

  // 3) Nevybraná doplňková krytí
  const someCoverMissing =
    !data.glass ||
    !data.collisionAnimal ||
    !data.naturalHazard ||
    !data.vandalism ||
    !data.animalDamage ||
    !data.theft;

  if (someCoverMissing) {
    recs.push(
      "Klientovi byly doporučeny doplňková připojištění přesto je nepožaduje."
    );
  }

  // 4) Roční nájezd – jen Allianz & Pillow
  if (
    data.annualMileage &&
    (currentInsurer === "allianz" || currentInsurer === "pillow")
  ) {
    recs.push(
      `Klient si zvolil roční nájezd ${data.annualMileage} a byl upozorněn, že musí vyfotit tachometr a v případě překročení mu bude pojistné dopočítáno dle tabulky ve smlouvě.`
    );
  }

  // 5) Extrabenefit Profi – POUZE pokud nahoře zvolena ČPP
  if (data.discountCppProfi && currentInsurer === "cpp") {
    recs.push(
      "Klient byl upozorněn, že pokud dojde v následujícím tříletém období k pojistné události, pojistník se zavazuje pojistiteli vrátit slevu za poskytnutý EBP na pojistném za všechna pojistná období, v nichž byla sleva od počátku pojištění poskytnuta."
    );
  }

  // 6) Sleva za neoriginální sklo
  if (data.discountUniqaNonOemGlass) {
    recs.push("Klient si přeje využít slevu na neoriginální sklo.");
  }

  return recs;
}

function buildProductRecommendations(
  data: CarResultsInput | null,
  recommendedInsurer: Insurer | null
): string[] {
  if (!data || !recommendedInsurer) return [];

  const recs: string[] = [];

  switch (recommendedInsurer) {
    case "cpp": {
      const limitStr = data.liabilityLimit ?? "";
      const has100 =
        limitStr.includes("100/100") || limitStr.includes("100 / 100");
      const has200 =
        limitStr.includes("200/200") || limitStr.includes("200 / 200");

      // Připojištění SmartGAP, ServisPRO, Asistence – jen u 200/200
      if (has200) {
        recs.push(
          "Připojištění SmartGAP, ServisPRO a Asistence v ČR a zahraničí součástí POV."
        );
      }

      // Extrabenefit Profi – info v produktovém doporučení
      if (data.discountCppProfi) {
        recs.push("Možnost slevy Extrabenefit Profi.");
      }

      // Vozík zdarma – 100/100 nebo 200/200
      if (has100 || has200) {
        recs.push("Lze sjednat vozík do 750 kg zdarma.");
      }

      // ESO – pokud je havarijko a určitá spoluúčast
      if (data.hasCasco && data.cascoDeductible) {
        const d = data.cascoDeductible;
        const matchesEso =
          d === "3% min. 3.000 Kč" ||
          d === "5% min. 5.000 Kč" ||
          d === "5.000 Kč";
        if (matchesEso) {
          recs.push("Připojištění ESO.");
        }
      }

      break;
    }

    case "allianz": {
      recs.push("Málo jezdím, málo platím.");

      const covers: string[] = [];
      if (data.glass) covers.push("Skla");
      if (data.collisionAnimal) covers.push("Střet se zvěří");
      if (data.naturalHazard) covers.push("Živel");
      if (data.animalDamage) covers.push("Poškození zvířetem");
      if (data.theft) covers.push("Odcizení");

      if (covers.length > 0) {
        const joined = covers.join(", ");
        recs.push(
          `Připojištění: ${joined} – limit plnění na obvyklou cenu.`
        );
      }

      break;
    }

    case "pillow": {
      // základní benefit Pillow
      recs.push("Cena pojistného dle ujetých kilometrů.");

      // připojištění s limitem na OBYVKLOU CENU
      const covers: string[] = [];
      if (data.glass) covers.push("Skla");
      if (data.collisionAnimal) covers.push("Střet se zvěří");
      if (data.naturalHazard) covers.push("Živel");
      if (data.animalDamage) covers.push("Poškození zvířetem");
      if (data.theft) covers.push("Odcizení");

      if (covers.length > 0) {
        const joined = covers.join(", ");
        recs.push(
          `Připojištění: ${joined} – limit plnění na OBYVKLOU CENU.`
        );
      }

      break;
    }

    case "uniqa": {
      recs.push(
        "Zdarma součástí pojištění je neomezené odtažení vozidla při nehodě v rámci ČR a SR a pojištění pneumatik."
      );
      break;
    }

    case "kooperativa": {
      recs.push("Koopilot – odměna za bezpečnou jízdu formou cashbacku.");
      break;
    }

    case "csob": {
      recs.push("Pojištění osobních věcí v ceně.");
      break;
    }

    case "slavia": {
      const limitStr = data.liabilityLimit ?? "";

      const has100 =
        limitStr.includes("100/100") || limitStr.includes("100 / 100");
      const has150 =
        limitStr.includes("150/150") || limitStr.includes("150 / 150");
      const has200 =
        limitStr.includes("200/200") || limitStr.includes("200 / 200");

      // Garance ceny na 3 roky – 150/150 nebo 200/200
      if (has150 || has200) {
        recs.push("Garance ceny na 3 roky.");
      }

      // Ztráta/odcizení klíčů v ceně – 100/100 nebo 150/150 nebo 200/200
      if (has100 || has150 || has200) {
        recs.push("Ztráta nebo odcizení klíčů v ceně.");
      }

      // Připojištění pneumatik v ceně – 200/200
      if (has200) {
        recs.push("Připojištění pneumatik v ceně.");
      }

      break;
    }

    // ostatní doplníme později
    default:
      break;
  }

  return recs;
}

export default function CarResultsPage() {
  const [data, setData] = useState<CarResultsInput | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [currentInsurer, setCurrentInsurer] = useState<Insurer | null>(null);
  const [recommendedInsurer, setRecommendedInsurer] =
    useState<Insurer | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("carRecord.resultsInput");
      if (!raw) {
        setLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw) as CarResultsInput;
      setData(parsed);
    } catch (e) {
      console.error("Chyba při načítání výsledků vozidel:", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  const recs = buildRecommendations(data, currentInsurer);
  const productRecs = buildProductRecommendations(
    data,
    recommendedInsurer
  );

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-4xl space-y-6">
        {/* Přepínač pojišťovny – nahoře */}
        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-4 sm:px-8 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-3">
          <h2 className="text-sm font-semibold text-slate-50">
            Jakou pojišťovnu sjednáváš?
          </h2>
          <div className="flex flex-wrap gap-2">
            {INSURER_OPTIONS.map((opt) => {
              const active = currentInsurer === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setCurrentInsurer(
                      currentInsurer === opt.id ? null : opt.id
                    )
                  }
                  className={`px-3.5 py-1.5 rounded-2xl text-xs sm:text-sm border transition ${
                    active
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                      : "bg-white/5 border-white/20 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50">
            Doporučení do dopadů – Vozidla
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl">
            Texty, které můžeš zapsat do dopadů / záznamu z jednání podle toho,
            jak má klient nastavené pojištění vozidla.
          </p>
        </header>

        {/* Výsledky – hlavní doporučení */}
        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
          {!loaded ? (
            <p className="text-sm text-slate-200">Načítám výsledky…</p>
          ) : !data ? (
            <div className="space-y-2 text-sm text-slate-200">
              <p>
                Nenašel jsem žádná data k pojištění vozidel. Pravděpodobně jsi
                ještě nevyplnil formulář nebo jsi jej neuložil pomocí tlačítka{" "}
                <span className="font-semibold">Výsledky</span>.
              </p>
              <Link
                href="/pomucky/zaznam"
                className="inline-flex items-center justify-center rounded-2xl bg-white text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-100"
              >
                Zpět na záznam z jednání
              </Link>
            </div>
          ) : recs.length === 0 ? (
            <div className="space-y-2 text-sm text-slate-200">
              <p>
                Z aktuálně zadaných údajů nevyplývají žádná speciální upozornění
                pro dopady.
              </p>
              <p className="text-xs text-slate-400">
                Pokud očekáváš nějaké doporučení, zkontroluj prosím nastavení
                limitů, asistencí a doplňkových krytí v sekci Pojištění vozidel.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-200">
                Níže máš hotové věty, které můžeš použít v dopadech nebo v
                záznamu z jednání:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-slate-100">
                {recs.map((text, idx) => (
                  <li key={idx}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Doporučení produktu */}
        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-6 py-5 sm:px-8 sm:py-6 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-50">
              Doporučení produktu
            </h2>
          </div>

          <p className="text-xs sm:text-sm text-slate-300">
            Měl by jsi vždy doporučit klientovi alespoň 2 pojišťovny.
          </p>

          <div className="flex flex-wrap gap-2">
            {INSURER_OPTIONS.map((opt) => {
              const active = recommendedInsurer === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setRecommendedInsurer(
                      recommendedInsurer === opt.id ? null : opt.id
                    )
                  }
                  className={`px-3.5 py-1.5 rounded-2xl text-xs sm:text-sm border transition ${
                    active
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                      : "bg-white/5 border-white/20 text-slate-100 hover:bg-white/10"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {productRecs.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-slate-200">
                Shrnutí výhod / poznámek pro zvolenou pojišťovnu:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-100">
                {productRecs.map((text, idx) => (
                  <li key={idx}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Odkaz zpět */}
        <div className="flex justify-end">
          <Link
            href="/pomucky/zaznam"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-100 hover:bg-white/10"
          >
            Zpět na záznam z jednání
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}