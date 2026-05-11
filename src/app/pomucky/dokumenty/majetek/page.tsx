// src/app/pomucky/dokumenty/majetek/page.tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import { ArrowUpRight, FileText, Search, Send, ShieldCheck, Sparkles, X } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromPath,
} from "@/app/lib/institutionLogoDisplay";
import SplitTitle from "../../plan-produkce/SplitTitle";

type PropertyInsurerKey = "cpp" | "kooperativa" | "maxima" | "allianz";
type PropertyModalKey = "cpp-domex-prima-sleva" | "cpp-bytex-prima-sleva";

type PropertyDocumentCard = {
  key: string;
  title: string;
  description: string;
};

type PropertyInsurerContent = {
  key: PropertyInsurerKey;
  title: string;
  logo: string;
  description: string;
  cards: PropertyDocumentCard[];
};

type AssignmentRule = {
  text: string;
  warning?: string;
};

const documentsFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const PROPERTY_INSURERS: readonly PropertyInsurerContent[] = [
  {
    key: "cpp",
    title: "ČPP",
    logo: "/icons/cpp.png",
    description: "Podklady pro majetkové pojištění ČPP.",
    cards: [
      {
        key: "cpp-domex-prima-sleva",
        title: "Přímá sleva DOMEX",
        description:
          "Podklady a interní postup pro práci s přímou slevou DOMEX u majetkového pojištění.",
      },
      {
        key: "cpp-bytex-prima-sleva",
        title: "Přímá sleva BYTEX",
        description:
          "Podklady a interní postup pro práci s přímou slevou BYTEX u majetkového pojištění.",
      },
    ],
  },
  {
    key: "kooperativa",
    title: "Kooperativa",
    logo: "/icons/koop-v2.png",
    description: "Dokumenty a workflow pro majetkové produkty Kooperativa.",
    cards: [
      {
        key: "kooperativa-priprava",
        title: "Obsah připravujeme",
        description: "Karty dokumentů pro Kooperativa doplníme sem.",
      },
    ],
  },
  {
    key: "maxima",
    title: "MAXIMA",
    logo: "/icons/maxima.png",
    description: "Podklady pro majetkové pojištění MAXIMA.",
    cards: [
      {
        key: "maxima-priprava",
        title: "Obsah připravujeme",
        description: "Karty dokumentů pro MAXIMA doplníme sem.",
      },
    ],
  },
  {
    key: "allianz",
    title: "Allianz",
    logo: "/icons/allianz.png",
    description: "Materiály pro pojištění domácnosti a nemovitosti Allianz.",
    cards: [
      {
        key: "allianz-priprava",
        title: "Obsah připravujeme",
        description: "Karty dokumentů pro Allianz doplníme sem.",
      },
    ],
  },
];

const INSURER_ACCENT: Record<
  PropertyInsurerKey,
  { line: string; cardLine: string; cardBorder: string; cardLabel: string; hoverBorder: string }
> = {
  cpp: {
    line: "from-cyan-400 via-blue-500 to-indigo-500",
    cardLine: "from-cyan-400 via-blue-500 to-indigo-500",
    cardBorder: "border-cyan-200/85",
    cardLabel: "text-cyan-700",
    hoverBorder: "hover:border-cyan-300",
  },
  kooperativa: {
    line: "from-emerald-400 via-emerald-500 to-teal-500",
    cardLine: "from-emerald-400 via-emerald-500 to-teal-500",
    cardBorder: "border-emerald-200/85",
    cardLabel: "text-emerald-700",
    hoverBorder: "hover:border-emerald-300",
  },
  maxima: {
    line: "from-amber-400 via-orange-500 to-amber-600",
    cardLine: "from-amber-400 via-orange-500 to-amber-600",
    cardBorder: "border-amber-200/85",
    cardLabel: "text-amber-700",
    hoverBorder: "hover:border-amber-300",
  },
  allianz: {
    line: "from-sky-400 via-blue-500 to-blue-700",
    cardLine: "from-sky-400 via-blue-500 to-blue-700",
    cardBorder: "border-sky-200/85",
    cardLabel: "text-sky-700",
    hoverBorder: "hover:border-sky-300",
  },
};

const GENERAL_PROPERTY_RESOURCES = [] as const;

const DOMEX_ASSIGNMENT_RULES: readonly AssignmentRule[] = [
  {
    text: "Dodržení daného minimálního celkového pojistného před slevami.",
  },
  {
    text: "Povolení marketingu (i toho ostatního).",
  },
  {
    text: "Nastavení automatické valorizace (neplatí u PS, kde je pojištění bytu na cenu obvyklou).",
  },
  {
    text: "V případě přesjednání smluv ČPP musí být navíc i navýšení skutečně placeného ročního pojistného po slevě nejméně o 2 000 Kč.",
  },
];

const BYTEX_ASSIGNMENT_RULES: readonly AssignmentRule[] = [
  {
    text: "Dodržení daného minimálního celkového pojistného před slevami.",
  },
  {
    text: "Povolení marketingu (i toho ostatního).",
    warning: "V případě sjednání na IČ není podmíněno.",
  },
  {
    text: "V případě přesjednání smluv ČPP musí být navíc i navýšení skutečně placeného ročního pojistného po slevě nejméně o 2 000 Kč.",
  },
];

const DOMEX_MIN_PREMIUM_RULES = [
  "12 000 Kč pro slevu ve výši 50 %.",
  "9 000 Kč pro slevu ve výši 45 %.",
  "8 000 Kč pro slevu ve výši 40 %.",
  "7 000 Kč pro slevu ve výši 35 %.",
  "5 000 Kč pro slevu ve výši 30 %.",
] as const;

const BYTEX_MIN_PREMIUM_RULES = [
  "10 000 Kč pro slevu ve výši 50 %.",
  "9 000 Kč pro slevu ve výši 45 %.",
  "8 000 Kč pro slevu ve výši 40 %.",
  "7 000 Kč pro slevu ve výši 35 %.",
] as const;

export default function DokumentyMajetekPage() {
  const [activeInsurer, setActiveInsurer] = useState<PropertyInsurerKey>("cpp");
  const [search, setSearch] = useState("");
  const [activeModal, setActiveModal] = useState<PropertyModalKey | null>(null);

  const insurer = useMemo(
    () => PROPERTY_INSURERS.find((item) => item.key === activeInsurer) ?? PROPERTY_INSURERS[0],
    [activeInsurer]
  );
  const logoKey = institutionLogoKeyFromPath(insurer.logo);
  const filteredCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return insurer.cards;
    return insurer.cards.filter((card) =>
      [card.title, card.description].join(" ").toLowerCase().includes(term)
    );
  }, [insurer.cards, search]);

  const modalTitle =
    activeModal === "cpp-bytex-prima-sleva" ? "Přímá sleva BYTEX" : "Přímá sleva DOMEX";
  const modalAssignmentRules =
    activeModal === "cpp-bytex-prima-sleva" ? BYTEX_ASSIGNMENT_RULES : DOMEX_ASSIGNMENT_RULES;
  const modalMinPremiumRules =
    activeModal === "cpp-bytex-prima-sleva" ? BYTEX_MIN_PREMIUM_RULES : DOMEX_MIN_PREMIUM_RULES;

  const accent = INSURER_ACCENT[activeInsurer];

  return (
    <AppLayout active="tools">
      <div className={`${documentsFont.className} w-full px-4 pb-10 pt-2 sm:px-5`}>
        <div
          className={`mx-auto max-w-[1040px] space-y-5 transition-[filter,opacity] duration-200 ${
            activeModal ? "pointer-events-none select-none blur-[2px] opacity-90" : ""
          }`}
        >
          <header className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f7fbff_55%,#eef6ff_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.1)] sm:px-8 sm:py-8">
            <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" aria-hidden="true" />
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Majetek • Dokumenty
                </span>
                <Link
                  href="/pomucky/dokumenty"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  ← Zpět na dokumenty
                </Link>
              </div>

              <SplitTitle text="Majetek" className="!text-4xl !text-slate-900 sm:!text-5xl" />
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Dokumenty podle pojišťovny pro pojištění majetku, včetně interních postupů a podkladů.
              </p>
            </div>
          </header>

          <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:px-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,340px)_1fr]">
              <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat dokument..."
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                />
              </label>

              <div className="min-w-0 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex min-w-max items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {PROPERTY_INSURERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveInsurer(item.key)}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        activeInsurer === item.key
                          ? "border border-slate-900 bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)]"
                          : "border border-transparent bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="relative rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent.line}`} aria-hidden="true" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`relative inline-flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white ${institutionLogoFrameClass(
                    logoKey,
                    "compact"
                  )}`}
                >
                  <Image
                    src={insurer.logo}
                    alt={`${insurer.title} logo`}
                    fill
                    sizes="64px"
                    className={institutionLogoImageClass(logoKey)}
                  />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{insurer.title}</h2>
                  <p className="text-sm text-slate-600">{insurer.description}</p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                <FileText className="h-3.5 w-3.5" />
                {filteredCards.length} dokument
                {filteredCards.length === 1 ? "" : filteredCards.length > 1 && filteredCards.length < 5 ? "y" : "ů"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {filteredCards.map((card) => {
                const isModalCard =
                  card.key === "cpp-domex-prima-sleva" || card.key === "cpp-bytex-prima-sleva";

                if (isModalCard) {
                  return (
                    <button
                      key={`${insurer.key}-${card.key}`}
                      type="button"
                      onClick={() => setActiveModal(card.key as PropertyModalKey)}
                      className={`group relative overflow-hidden rounded-2xl border ${accent.cardBorder} bg-[linear-gradient(135deg,#f8fafc_0%,#eff6ff_56%,#ffffff_100%)] px-4 py-4 text-left shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 ${accent.hoverBorder}`}
                    >
                      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent.cardLine}`} aria-hidden="true" />
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-semibold leading-tight text-slate-900">{card.title}</h3>
                        <ArrowUpRight className={`h-4 w-4 shrink-0 ${accent.cardLabel} transition`} />
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.description}</p>
                    </button>
                  );
                }

                return (
                  <article
                    key={`${insurer.key}-${card.key}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <h3 className="text-lg font-semibold leading-tight text-slate-900">{card.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.description}</p>
                  </article>
                );
              })}

              {filteredCards.length === 0 ? (
                <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-600">
                  Pro vyhledávání nic neodpovídá.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-cyan-700" />
              Obecné podklady (nezávislé na pojišťovně)
            </h3>
            {GENERAL_PROPERTY_RESOURCES.length > 0 ? (
              <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                {GENERAL_PROPERTY_RESOURCES.map((item) => (
                  <li key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Zatím bez obecných podkladů.</p>
            )}
          </section>
        </div>
      </div>

      {activeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-3 py-6 backdrop-blur-[2.5px] sm:px-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fafc_55%,#eff6ff_100%)] p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  ČPP Majetek
                </span>
                <h3 className="mt-2 bg-gradient-to-r from-slate-900 via-sky-800 to-emerald-700 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
                  {modalTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-5 text-sm leading-relaxed text-slate-800">
              <div className="rounded-2xl border border-sky-200 bg-sky-50/55 px-4 py-3">
                <p className="inline-flex items-center gap-2 font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-sky-700" />
                  Podmínky pro přidělení slevy:
                </p>
                <ol className="mt-3 space-y-2">
                  {modalAssignmentRules.map((rule, index) => (
                    <li key={rule.text} className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-300 bg-white text-xs font-semibold text-sky-700">
                        {index + 1}
                      </span>
                      <span>
                        {rule.text}{" "}
                        {rule.warning ? (
                          <span className="font-semibold text-rose-700">{rule.warning}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/55 px-4 py-3">
                <h4 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-emerald-700" />
                  Jaké musí být minimální pojistné před slevami?
                </h4>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {modalMinPremiumRules.map((rule) => (
                    <li
                      key={rule}
                      className="rounded-xl border border-emerald-200/90 bg-white px-3 py-2 text-sm text-slate-800"
                    >
                      {rule}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                  V případě náhrady smlouvy nutnost navýšení alespoň o 2 000 Kč oproti původní smlouvě!
                </p>
              </div>

              <div className="rounded-2xl border border-violet-200 bg-violet-50/55 px-4 py-3">
                <h4 className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                  <Send className="h-4 w-4 text-violet-700" />
                  Jak o slevu požádat?
                </h4>
                <ul className="mt-3 space-y-2">
                  <li className="flex items-start gap-2.5">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                    <span>Stáhni PDF návrhu smlouvy (nesmí být zaškrtnuta žádná sleva).</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Send className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                    <span>Odešli ji mailem na marcela.hofmanova@bohemika.eu.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
