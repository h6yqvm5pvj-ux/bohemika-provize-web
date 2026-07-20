"use client";

import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  FileText,
  Home,
  ShieldCheck,
} from "lucide-react";

const LIABILITY_REQUIREMENT_VARIANTS = [
  "Klientka požaduje i pojištění čisté finanční újmy, klientka si přeje územní platnost EU u odpovědnosti, dále si přeje roční platbu.",
  "Klientka si přeje spol. 5.000,-Kč, územní platnost: ČR + sousedící státy; čistá finanční újma 1.000 000,-Kč, roční platba, produkt SIMPLEX od ČPP ve variantě MAXI.",
  "Klientka vyžaduje vysvětlit výluky pojištění dle pojistných podmínek k požadovanému typu pojištění.",
  "Klientka nemá jiné požadavky.",
];

const PROPERTY_REQUIREMENT_VARIANTS = [
  "Produkt SIMPLEX od ČPP včetně připojištění asistenční služby, varianta OPTI, územní platnost: ČR + sousedící státy, spoluúčast 3.000,-; u rizika povodeň a záplava spoluúčast 1%, minimálně 10.000,-; platba roční.",
  "Klientka nemá jiné požadavky.",
];

const PRODUCT_RECOMMENDATIONS = [
  {
    product: "SIMPLEX",
    focus: "Pojištění majetku",
    text: "Balíčkové pojištění, široký rozsah pojistné ochrany, možnost volby spoluúčastí.",
  },
  {
    product: "SIMPLEX",
    focus: "Pojištění odpovědnosti",
    text: "Balíčkové pojištění, široký rozsah pojistné ochrany, možnost volby spoluúčastí.",
  },
  {
    product: "KPX III",
    focus: "Jednotlivá volba rizik",
    text: "Možnost volby spoluúčasti.",
  },
  {
    product: "KOOP TREND",
    focus: "Jednotlivá volba rizik",
    text: "Možnost volby spoluúčasti.",
  },
];

const GENERAL_RECOMMENDATION_VARIANTS = [
  "All risk pojištění s vysokým krytím podnikatelské odpovědnosti i majetku, varianta OPTI (ČR + sousedící státy).",
  "All risk pojištění s vysokým krytím podnikatelské odpovědnosti i majetku, varianta MAXI (pro území ČR a celé EVROPY).",
  "Klient si u pojištění majetku/odpovědnosti zvolil variantu MAXI, kde mu vyhovují všechny limity stanovené pojistnými podmínkami produktu SIMPLEX.",
];

const IMPACT_PARAGRAPHS = [
  "Klientka si přeje pojištění majetku i odpovědnosti pro své podnikání v kadeřnictví. Klientce byly nabídnuté a vysvětlené všechny varianty a balíčky pojištění, klientce byly vysvětleny základní pojmy pojištění, rozsah pojistného krytí, limity pojistného plnění, vysvětlené spoluúčasti a byla seznámená s pojistnými podmínkami a výlukami.",
  "Klientka volí pojištění majetku ve variantě OPTI na limit plnění 2.000.000,-Kč se spol. 5.000,-Kč, další částky v balíčku s klientkou projednané a souhlasí.",
  "Pojištění odpovědnosti volí ve variantě OPTI, vysvětlená územní platnost ČR + okolní státy EU, požaduje limit plnění 2.000.000,-Kč se spol. 5.000,-Kč.",
  "Klientka byla upozorněná, že by pojistné částky nemusely být dostačující, byly doporučené vyšší, ty klientka odmítá a bere na vědomí a souhlasí s částkami, které si vybrala. Toto může být negativním dopadem - nevyužití vyšších pojistných částek, upozorněná na možná rizika spojená s tímto nedostatečným krytím.",
  "Klientka byla seznámená, kdyby v budoucnu požadovala vyšší pojistné částky, lze pojistnou smlouvu přepracovat a navýšit. Dále klientka seznámená kdyby se v průběhu roku zvedl výrazně obrat společnosti, je povinná tuto skutečnost nahlásit do pojištění.",
  "Klientka návrhu porozuměla, měla možnost klást dotazy a rozhodla se pro sjednání pojištění dle své volby. S prolongací klientka souhlasí a smlouva se sjednává platbou.",
  "Pojistná smlouva bude sjednána s akceptací platbou (vznikne připsáním pojistného na účet pojišťovny). Vzhledem k tomu, že je klientkou požadovaná platnost od druhého dne, je třeba uhradit pojistné obratem. Pojistnou smlouvu i veškerou další dokumentaci obdrží klientka e-mailem.",
];

function SectionShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-violet-200/75 bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_100%)] shadow-[0_18px_44px_rgba(42,20,72,0.12)]">
      <div className="border-b border-violet-100/80 px-4 py-4 sm:px-5">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function TopicCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-[22px] border border-violet-200/70 bg-white/95 p-4 shadow-[0_8px_22px_rgba(42,20,72,0.08)]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-900">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      </div>
      {children}
    </article>
  );
}

function VariantList({ items }: { items: string[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <article
          key={item}
          className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-3.5 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)]"
        >
          <div className="flex gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-[11px] font-black text-white shadow-[0_8px_16px_rgba(109,40,217,0.24)]">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
                Varianta
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-800">
                {item}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function BusinessRecordForm() {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)] shadow-[0_18px_44px_rgba(146,64,14,0.10)]">
        <div className="border-b border-amber-100 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
              <Briefcase className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                Podnikatelé
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
                Tato sekce je v přípravě
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                ZZJ Podnikatelé - SIMPLEX, KOMPLEX III, KOOP TREND.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionShell
        eyebrow="Požadavky klienta"
        title="Další požadavky, potřeby a cíle zákazníka"
        description="Například výluky, čekací doby, klesající nebo neklesající pojistná částka, realokace investiční části a další specifika."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <TopicCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Odpovědnost"
          >
            <VariantList items={LIABILITY_REQUIREMENT_VARIANTS} />
          </TopicCard>
          <TopicCard icon={<Home className="h-4 w-4" />} title="Majetek">
            <VariantList items={PROPERTY_REQUIREMENT_VARIANTS} />
          </TopicCard>
        </div>
      </SectionShell>

      <SectionShell
        eyebrow="Doporučení produktu"
        title="Doporučení pojistného produktu - fyzická osoba podnikající"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {PRODUCT_RECOMMENDATIONS.map((item) => (
            <article
              key={`${item.product}-${item.focus}`}
              className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-violet-900">
                  {item.product}
                </span>
                <span className="text-sm font-semibold text-slate-950">
                  {item.focus}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {item.text}
              </p>
            </article>
          ))}
        </div>

        <TopicCard icon={<CheckCircle2 className="h-4 w-4" />} title="Všeobecné varianty">
          <VariantList items={GENERAL_RECOMMENDATION_VARIANTS} />
        </TopicCard>
      </SectionShell>

      <SectionShell
        eyebrow="Nesrovnalosti"
        title="Výčet případných nesrovnalostí mezi požadavky zákazníka a nabízeným pojištěním"
        description="Když je zaškrtnuto ANO, uveď důvod."
      >
        <div className="flex gap-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Např.: Klient se dotazoval i na připojištění finančních sankcí,
            sděleno, že toto připojištění je součástí výluk a nelze
            připojistit. Klient si tímto seznámen a souhlasí s pojištěním bez
            této výluky.
          </p>
        </div>
      </SectionShell>

      <SectionShell
        eyebrow="Dopady"
        title="Popis dopadů sjednání pojištění/změny pojištění"
        description="Vysvětlení dopadů sjednání nebo podstatné změny pojištění na zákazníka, včetně souvisejících rizik."
      >
        <div className="space-y-2">
          {IMPACT_PARAGRAPHS.map((paragraph, index) => (
            <article
              key={paragraph}
              className="grid gap-3 rounded-[22px] border border-violet-200/70 bg-white/95 p-3 shadow-[0_8px_22px_rgba(42,20,72,0.08)] sm:grid-cols-[auto_minmax(0,1fr)]"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[11px] font-black text-violet-900">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-sm leading-relaxed text-slate-800">
                {paragraph}
              </p>
            </article>
          ))}
        </div>

        <div className="flex gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p>
            Text uprav podle konkrétního oboru podnikání, zvolené varianty,
            limitů, spoluúčastí, územní platnosti a způsobu vzniku pojistné
            smlouvy.
          </p>
        </div>
      </SectionShell>
    </div>
  );
}
