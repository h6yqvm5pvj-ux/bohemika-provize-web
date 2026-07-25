"use client";

import {
  Building2,
  CarFront,
  ChartNoAxesCombined,
  Gem,
  Handshake,
  HeartHandshake,
  HousePlus,
  Landmark,
  Languages,
  PlaneTakeoff,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { LogoLoop, type LogoLoopItem } from "@/components/LogoLoop";

type PartnerInsurer = {
  label: string;
  logoPath: string;
};

type AdvisorProfileSectionsProps = {
  onScheduleMeeting?: (() => void) | null;
  className?: string;
};

const PARTNER_INSURERS: PartnerInsurer[] = [
  { label: "ČPP", logoPath: "/icons/cpp.png" },
  { label: "Kooperativa", logoPath: "/icons/koop-v2.png" },
  { label: "Allianz", logoPath: "/icons/allianz.png" },
  { label: "UNIQA", logoPath: "/icons/uniqa.png" },
  { label: "ČSOB", logoPath: "/icons/csb.png" },
  { label: "Pillow", logoPath: "/icons/pillow.png" },
  { label: "iNVESTiKA", logoPath: "/icons/invstk.png" },
  { label: "Comfort Commodity", logoPath: "/icons/cclogo1.png" },
  { label: "MAXIMA", logoPath: "/icons/maxima.png" },
  { label: "SLAVIA", logoPath: "/icons/slavialogo.png" },
  { label: "AXA", logoPath: "/icons/axalogo.png" },
  { label: "Conseq", logoPath: "/icons/conseq.png" },
];

const PARTNER_LOGO_ITEMS: LogoLoopItem[] = PARTNER_INSURERS.map((insurer) => {
  const mediumHighlightedLogos = ["ČSOB", "SLAVIA", "AXA", "Kooperativa", "Pillow", "iNVESTiKA"];
  const logoClassName =
    insurer.label === "ČPP"
      ? "object-contain p-1 scale-[1.3]"
      : insurer.label === "iNVESTiKA"
        ? "object-contain p-1 scale-[1.4]"
      : mediumHighlightedLogos.includes(insurer.label)
        ? "object-contain p-1.5 scale-[1.24]"
        : "object-contain p-2.5";

  return {
    id: insurer.label.toLowerCase(),
    title: insurer.label,
    node: (
      <div className="relative flex h-14 w-32 items-center justify-center rounded-2xl border border-slate-200/75 bg-white/95 shadow-[0_10px_28px_rgba(8,10,36,0.34)] sm:h-16 sm:w-36">
        <Image
          src={insurer.logoPath}
          alt={`${insurer.label} logo`}
          fill
          className={logoClassName}
          sizes="144px"
        />
      </div>
    ),
  };
});

const ADVISOR_SERVICES = [
  {
    label: "Životní pojištění a zajištění příjmu",
    icon: HeartHandshake,
    iconClass: "text-fuchsia-200",
    accentClass: "bg-fuchsia-300/80",
  },
  {
    label: "Pojištění majetku a odpovědnosti",
    icon: HousePlus,
    iconClass: "text-emerald-200",
    accentClass: "bg-emerald-300/80",
  },
  {
    label: "Pojištění vozidel a flotil",
    icon: CarFront,
    iconClass: "text-sky-200",
    accentClass: "bg-sky-300/80",
  },
  {
    label: "Cestovní pojištění a péče o smlouvy",
    icon: PlaneTakeoff,
    iconClass: "text-indigo-200",
    accentClass: "bg-indigo-300/80",
  },
  {
    label: "Pojištění cizinců",
    icon: Languages,
    iconClass: "text-rose-200",
    accentClass: "bg-rose-300/80",
  },
  {
    label: "Investice",
    icon: ChartNoAxesCombined,
    iconClass: "text-cyan-200",
    accentClass: "bg-cyan-300/80",
  },
  {
    label: "Úvěry a hypotéky",
    icon: Landmark,
    iconClass: "text-lime-200",
    accentClass: "bg-lime-300/80",
  },
  {
    label: "Investiční drahé kovy",
    icon: Gem,
    iconClass: "text-amber-200",
    accentClass: "bg-amber-300/80",
  },
];

const COMPANY_LEAD =
  "Využíváme více než dvacetileté zkušenosti z finančně-poradenského trhu. Díky tomu vždy vyhledáme účinné řešení vašich potřeb a požadavků.";

const COMPANY_PARAGRAPHS = [
  "Profesionální jednání poradců společnosti Bohemika je naprostou a nezbytnou samozřejmostí. Spokojenost klientů je pro nás na prvním místě a jednáme vždy pouze v jejich zájmu.",
  "Samozřejmostí je pro nás zvyšování odborné kvalifikace, dodržování důvěrnosti zpracovaných informací a dat našich klientů. Netolerujeme jakékoli porušení zákonů, legislativy či nečestné jednání.",
  "Vše pečlivě vysvětlíme, dbáme na vzájemné porozumění a klientům poskytujeme komplexní informace a služby v celé šíři finančního portfolia. Objektivní analýza aktuální individuální situace klienta a přesná definice realistického cíle jsou základem úspěšného splnění našeho úkolu.",
];

const COMPANY_PILLARS = [
  {
    title: "Klient na prvním místě",
    detail: "Jednáme v zájmu klienta a nasloucháme připomínkám.",
    icon: HeartHandshake,
    iconClass: "text-fuchsia-100",
    accentClass: "bg-fuchsia-300/80",
  },
  {
    title: "Profesionální standard",
    detail: "Dbáme na kvalitu, legislativu a transparentní postup.",
    icon: ShieldCheck,
    iconClass: "text-emerald-100",
    accentClass: "bg-emerald-300/80",
  },
  {
    title: "Odborný růst",
    detail: "Průběžně zvyšujeme kvalifikaci našich poradců.",
    icon: ChartNoAxesCombined,
    iconClass: "text-cyan-100",
    accentClass: "bg-cyan-300/80",
  },
  {
    title: "Srozumitelné řešení",
    detail: "Vysvětlujeme varianty jasně a bez zbytečných složitostí.",
    icon: Sparkles,
    iconClass: "text-violet-100",
    accentClass: "bg-violet-300/80",
  },
];

export function AdvisorProfileSections({
  onScheduleMeeting,
  className,
}: AdvisorProfileSectionsProps) {
  return (
    <div
      className={`relative isolate mx-auto w-full max-w-[1160px] overflow-hidden bg-[linear-gradient(180deg,rgba(16,10,32,0.98)_0%,rgba(13,10,29,0.99)_50%,rgba(8,7,18,0.99)_100%)] text-white ${className ?? ""}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(196,181,253,0.38),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(124,58,237,0.18),transparent_30%),radial-gradient(circle_at_12%_52%,rgba(59,130,246,0.1),transparent_36%)]" />

      <section className="relative overflow-hidden px-6 py-12 sm:px-10 sm:py-16 vizitka-anim-up [animation-delay:220ms]">
        <div className="relative z-10 space-y-7 text-center sm:space-y-8">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/40 bg-white/[0.06] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100">
            <ShieldCheck className="h-3.5 w-3.5" />
            Co pro vás zajistím
          </p>
          <h2 className="text-3xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            Poradenství, které nekončí sjednáním
          </h2>
          <p className="mx-auto max-w-3xl text-base leading-relaxed text-violet-100/80 sm:text-lg">
            Cílem není pouze uzavřít smlouvu, ale budovat dlouhodobý vztah založený na důvěře.
            Každému klientovi věnuji individuální péči a čas, abych opravdu porozuměl jeho
            situaci, plánům i obavám. Hledám řešení, které je optimální nejen cenou, ale především
            kvalitou, stabilitou a skutečným přínosem pro klienta v každodenním životě. Společně
            nastavíme pojištění, investice i finanční plán tak, aby dávaly smysl dnes a obstály i
            v budoucnu při změně zaměstnání, podnikání, rodinné situace nebo bydlení. Pravidelně
            smlouvy reviduji, vysvětluji možné varianty a doporučuji konkrétní kroky, které klienta
            chrání před zbytečnými riziky. Neřeším jen podpis smlouvy, ale dlouhodobý servis,
            dostupnost a aktivní péči, na kterou se můžete spolehnout, když ji opravdu potřebujete.
            Protože dobré poradenství nezačíná ani nekončí podpisem - začíná důvěrou a pokračuje
            dlouhodobou péčí.
          </p>

          <div className="mx-auto grid w-full max-w-5xl gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
            {ADVISOR_SERVICES.map((service, index) => (
              <div
                key={service.label}
                className="group inline-flex items-center gap-3 px-1 py-2 text-left text-sm font-semibold text-violet-50 sm:text-[15px] vizitka-anim-up"
                style={{ animationDelay: `${300 + index * 75}ms` }}
              >
                <span className="relative inline-flex h-10 w-9 shrink-0 items-center justify-center">
                  <service.icon
                    className={`h-6 w-6 ${service.iconClass} drop-shadow-[0_8px_18px_rgba(196,181,253,0.20)] transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-110`}
                    strokeWidth={1.85}
                  />
                  <span
                    className={`absolute bottom-0 left-1 right-1 h-0.5 rounded-full ${service.accentClass} opacity-70 shadow-[0_0_14px_currentColor] transition duration-300 group-hover:left-0 group-hover:right-0 group-hover:opacity-100`}
                    aria-hidden="true"
                  />
                </span>
                <span>{service.label}</span>
              </div>
            ))}
          </div>

          {onScheduleMeeting ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={onScheduleMeeting}
                className="inline-flex items-center gap-2 rounded-[20px] border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_56%,#c084fc_100%)] px-7 py-3 text-base font-bold text-white shadow-[0_22px_44px_rgba(124,58,237,0.42)] transition hover:brightness-110 vizitka-cta-glow"
              >
                <Sparkles className="h-4 w-4" />
                Sjednat schůzku
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-violet-300/12 px-6 py-12 sm:px-10 sm:py-16 vizitka-anim-up [animation-delay:430ms]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(124,58,237,0.12),transparent_46%)]" />
        <div className="relative z-10 space-y-6">
          <div className="text-center">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-sky-300/35 bg-white/[0.05] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-100">
              <Building2 className="h-3.5 w-3.5" />
              O firmě
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-white sm:text-5xl">Bohemika a.s.</h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)]">
            <div className="space-y-5">
              <p className="text-lg leading-relaxed text-violet-50 sm:text-2xl sm:leading-tight">
                {COMPANY_LEAD}
              </p>

              <div className="space-y-4">
                {COMPANY_PARAGRAPHS.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="max-w-3xl text-sm leading-relaxed text-violet-100/78 sm:text-base"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>

            <aside className="space-y-5 lg:border-l lg:border-violet-300/16 lg:pl-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/90">
                Na čem stavíme spolupráci
              </p>
              <div className="space-y-3">
                {COMPANY_PILLARS.map((pillar) => (
                  <div key={pillar.title} className="group flex items-start gap-3">
                    <span className="relative mt-0.5 inline-flex h-9 w-8 shrink-0 items-center justify-center">
                      <pillar.icon
                        className={`h-5 w-5 ${pillar.iconClass} drop-shadow-[0_8px_18px_rgba(196,181,253,0.22)] transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-110`}
                        strokeWidth={1.9}
                      />
                      <span
                        className={`absolute bottom-0 left-1 right-1 h-0.5 rounded-full ${pillar.accentClass} opacity-70 shadow-[0_0_14px_currentColor] transition duration-300 group-hover:left-0 group-hover:right-0 group-hover:opacity-100`}
                        aria-hidden="true"
                      />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white sm:text-[15px]">{pillar.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-violet-100/72 sm:text-sm">
                        {pillar.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-l border-cyan-300/45 pl-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/90">
                  Vienna Insurance Group
                </p>
                <p className="mt-1 text-sm leading-relaxed text-violet-50">
                  Bohemika je součástí koncernu VIG, který patří mezi největší evropské pojišťovací
                  skupiny.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-violet-300/12 px-6 py-12 sm:px-10 sm:py-16 vizitka-anim-up [animation-delay:560ms]">
        <div className="relative z-10 space-y-5 text-center">
          <div>
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.05] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100">
              <Handshake className="h-3.5 w-3.5" />
              Partnerské pojišťovny
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
              Spolupracujeme s předními značkami
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-violet-100/75 sm:text-base">
              Výběr řešení stavíme podle klienta, ne podle jedné pojišťovny.
            </p>
          </div>

          <LogoLoop
            items={PARTNER_LOGO_ITEMS}
            speed={24}
            className="mx-auto max-w-5xl py-4 vizitka-anim-up [animation-delay:660ms]"
            itemClassName="min-h-[96px] min-w-[152px]"
          />
        </div>
      </section>
    </div>
  );
}
