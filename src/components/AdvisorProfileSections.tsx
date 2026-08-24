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
import type { CSSProperties } from "react";
import { ONLINE_CARD_COPY, type OnlineCardLocale } from "@/lib/onlineCardI18n";

type PartnerInsurer = {
  label: string;
  logoPath: string;
  darkTile?: boolean;
};

type AdvisorProfileSectionsProps = {
  onScheduleMeeting?: (() => void) | null;
  className?: string;
  flush?: boolean;
  reveal?: boolean;
  theme?: "dark" | "light";
  locale?: OnlineCardLocale;
  connectToHero?: boolean;
  goldPageHref?: string;
  lifeInsurancePageHref?: string;
  vehicleInsurancePageHref?: string;
};

const PARTNER_INSURERS: PartnerInsurer[] = [
  { label: "ČPP", logoPath: "/icons/cpp.png" },
  { label: "Kooperativa", logoPath: "/icons/koop-v2.png" },
  { label: "Allianz", logoPath: "/icons/allianz.png" },
  { label: "UNIQA", logoPath: "/icons/uniqa.png" },
  { label: "ČSOB", logoPath: "/icons/csb.png" },
  { label: "Pillow", logoPath: "/icons/pillow.png" },
  { label: "iNVESTiKA", logoPath: "/icons/invstk.png" },
  { label: "Investona", logoPath: "/icons/investona.png" },
  { label: "Comfort Commodity", logoPath: "/icons/cclogo1.png" },
  { label: "Ekka Gold", logoPath: "/images/ekkagold.png", darkTile: true },
  { label: "MAXIMA", logoPath: "/icons/maxima.png" },
  { label: "SLAVIA", logoPath: "/icons/slavialogo.png" },
  { label: "AXA", logoPath: "/icons/axalogo.png" },
  { label: "Conseq", logoPath: "/icons/conseq.png" },
  { label: "PVZP", logoPath: "/icons/pvzp.webp" },
];

function getPartnerLogoClassName(insurer: PartnerInsurer) {
  const mediumHighlightedLogos = ["ČSOB", "SLAVIA", "AXA", "Kooperativa", "Pillow", "iNVESTiKA", "PVZP"];
  if (insurer.label === "ČPP") return "object-contain p-1 scale-[1.3]";
  if (insurer.label === "iNVESTiKA") return "object-contain p-1 scale-[1.4]";
  if (insurer.label === "Investona") return "object-contain p-1 scale-[1.16]";
  if (insurer.label === "Ekka Gold") return "object-contain p-2 scale-[1.08]";
  if (mediumHighlightedLogos.includes(insurer.label)) return "object-contain p-1.5 scale-[1.24]";
  return "object-contain p-2.5";
}

const ADVISOR_SERVICES = [
  {
    label: "Životní pojištění a zajištění příjmu",
    icon: HeartHandshake,
    iconClass: "text-blue-200",
    accentClass: "bg-blue-300/80",
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
    label: "Cestovní pojištění",
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
    label: "Investiční zlato a stříbro",
    icon: Gem,
    iconClass: "text-amber-200",
    accentClass: "bg-amber-300/80",
  },
];

const COMPANY_PILLARS = [
  {
    title: "Klient na prvním místě",
    detail: "Jednáme v zájmu klienta a nasloucháme připomínkám.",
    icon: HeartHandshake,
    iconClass: "text-blue-100",
    accentClass: "bg-blue-300/80",
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
    iconClass: "text-blue-100",
    accentClass: "bg-blue-300/80",
  },
];

export function AdvisorProfileSections({
  onScheduleMeeting,
  className,
  flush = false,
  reveal = false,
  theme = "dark",
  locale = "cs",
  connectToHero = false,
  goldPageHref,
  lifeInsurancePageHref,
  vehicleInsurancePageHref,
}: AdvisorProfileSectionsProps) {
  const copy = ONLINE_CARD_COPY[locale];
  const light = theme === "light";
  const connectedHero = connectToHero && flush;
  const revealAttrs = reveal
    ? {
        "data-vizitka-reveal": true,
      }
    : {};
  const revealClass = reveal ? "online-card-scroll-reveal" : "";
  const panelClass = light
    ? "border-slate-200/90 bg-white/90 shadow-[0_24px_64px_rgba(71,85,105,0.12)]"
    : "border-white/[0.1] bg-[#07162f]/72 shadow-[0_28px_80px_rgba(2,8,23,0.36)]";
  const titleClass = light ? "text-slate-950" : "text-white";
  const bodyClass = light ? "text-slate-600" : "text-blue-100/72";
  const labelClass = light ? "text-blue-700" : "text-blue-200/90";
  const dividerClass = light ? "border-slate-200" : "border-blue-200/[0.14]";

  return (
    <div
      className={`online-card-flow-surface relative isolate w-full overflow-hidden ${
        flush ? "" : "mx-auto max-w-[1160px]"
      } ${connectedHero ? "-mt-14 sm:-mt-24" : ""} ${
        connectedHero
          ? light
            ? "bg-transparent text-slate-950"
            : "bg-transparent text-white"
          : light
            ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.94)_54%,rgba(255,255,255,0.98)_100%)] text-slate-950"
            : "bg-[linear-gradient(180deg,rgba(7,21,44,0.98)_0%,rgba(8,26,51,0.99)_50%,rgba(5,13,30,0.99)_100%)] text-white"
      } ${
        className ?? ""
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          light
            ? "bg-[radial-gradient(circle_at_82%_8%,rgba(37,99,235,0.1),transparent_30%),radial-gradient(circle_at_12%_52%,rgba(14,165,233,0.08),transparent_36%)]"
            : "bg-[radial-gradient(circle_at_82%_8%,rgba(37,99,235,0.2),transparent_30%),radial-gradient(circle_at_12%_52%,rgba(14,165,233,0.12),transparent_36%)]"
        }`}
      />

      <section
        {...revealAttrs}
        className={`relative overflow-hidden px-4 ${
          connectedHero ? "pb-10 pt-5 sm:px-10 sm:pb-16 sm:pt-9" : "py-10 sm:px-10 sm:py-16"
        } vizitka-anim-up [animation-delay:220ms] ${revealClass}`}
      >
        <div className="relative z-10 space-y-7 text-left sm:space-y-8 sm:text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-300/40 bg-white/[0.06] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100">
            <ShieldCheck className="h-3.5 w-3.5" />
            {copy.advisor.serviceKicker}
          </p>
          <h2 className="text-3xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            {copy.advisor.serviceTitle}
          </h2>
          <p className="mx-auto max-w-5xl text-base leading-relaxed text-blue-100/80 sm:text-lg">
            {copy.advisor.serviceLead}
          </p>

          <div className="mx-auto grid w-full max-w-5xl gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3">
            {ADVISOR_SERVICES.map((service, index) => {
              const servicePageHref = index === 0
                ? lifeInsurancePageHref
                : index === 2
                  ? vehicleInsurancePageHref
                : index === ADVISOR_SERVICES.length - 1
                  ? goldPageHref
                  : undefined;
              const isDetailService = Boolean(servicePageHref);

              return (
              <div
                key={copy.advisor.services[index]}
                role={isDetailService ? "button" : undefined}
                tabIndex={isDetailService ? 0 : undefined}
                onClick={isDetailService ? () => window.location.assign(servicePageHref!) : undefined}
                onKeyDown={isDetailService ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    window.location.assign(servicePageHref!);
                  }
                } : undefined}
                aria-label={
                  index === 0
                    ? "Zjistit více o životním a úrazovém pojištění"
                    : index === 2
                      ? "Zjistit více o pojištění vozidel"
                      : index === ADVISOR_SERVICES.length - 1
                        ? "Zjistit více o investičním zlatě a stříbru"
                        : undefined
                }
                className={`group inline-flex items-center gap-3 px-1 py-2 text-left text-sm font-semibold text-blue-50 sm:text-[15px] vizitka-anim-up ${
                  index >= ADVISOR_SERVICES.length - 2 ? "lg:translate-x-[calc(50%+0.375rem)]" : ""
                } ${isDetailService ? "cursor-pointer rounded-xl outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-blue-200/80" : ""}`}
                style={{ animationDelay: `${300 + index * 75}ms` }}
              >
                <span className="relative inline-flex h-10 w-9 shrink-0 items-center justify-center lg:h-14 lg:w-14">
                  <service.icon
                    className={`h-6 w-6 lg:h-10 lg:w-10 ${service.iconClass} drop-shadow-[0_8px_18px_rgba(147,197,253,0.22)] transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-110`}
                    strokeWidth={1.85}
                  />
                  <span
                    className={`absolute bottom-0 left-1 right-1 h-0.5 rounded-full ${service.accentClass} opacity-70 shadow-[0_0_14px_currentColor] transition duration-300 group-hover:left-0 group-hover:right-0 group-hover:opacity-100`}
                    aria-hidden="true"
                  />
                </span>
                <span>
                  {copy.advisor.services[index]}
                  {isDetailService ? <span className="mt-0.5 block text-[10px] font-medium text-blue-100/65">Zjistit více</span> : null}
                </span>
              </div>
              );
            })}
          </div>

          {onScheduleMeeting ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={onScheduleMeeting}
                className="online-card-action relative isolate inline-flex items-center gap-2 overflow-hidden rounded-[20px] border border-white/35 bg-[linear-gradient(120deg,rgba(29,78,216,0.9)_0%,rgba(37,99,235,0.84)_56%,rgba(56,189,248,0.82)_100%)] px-7 py-3 text-base font-bold text-white shadow-[0_22px_44px_rgba(37,99,235,0.42),inset_0_1px_0_rgba(255,255,255,0.42)] backdrop-blur-xl transition hover:brightness-110 hover:shadow-[0_24px_50px_rgba(37,99,235,0.52),inset_0_1px_0_rgba(255,255,255,0.56)] before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:h-px before:bg-white/85 before:opacity-70 vizitka-cta-glow"
              >
                <Sparkles className="h-4 w-4" />
                {copy.preview.scheduleMeeting}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section
        {...revealAttrs}
        className={`relative overflow-hidden px-4 py-16 sm:px-10 sm:py-28 vizitka-anim-up [animation-delay:430ms] ${revealClass}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-12%,rgba(59,130,246,0.3),transparent_38%),radial-gradient(circle_at_93%_27%,rgba(56,189,248,0.19),transparent_21%),radial-gradient(circle_at_4%_74%,rgba(37,99,235,0.24),transparent_31%)]" />
        <div className="pointer-events-none absolute inset-x-[11%] top-8 h-64 rounded-full bg-blue-500/[0.09] blur-[92px]" />
        <div className="pointer-events-none absolute -left-28 bottom-6 h-72 w-72 rounded-full border border-blue-200/[0.08]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.25] [background-image:linear-gradient(rgba(147,197,253,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(147,197,253,0.14)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.6),rgba(96,165,250,0.75),transparent)]" />

        <div className="relative z-10 mx-auto max-w-[1360px]">
          <div className={`relative flex items-center gap-4 border-b pb-6 sm:pb-8 ${dividerClass}`}>
            <span className="pointer-events-none absolute -left-5 bottom-0 h-px w-20 bg-[linear-gradient(90deg,transparent,#7dd3fc,transparent)] sm:-left-12 sm:w-32" aria-hidden="true" />
            <p className={`inline-flex w-fit items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.26em] ${labelClass}`}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-current/25 bg-current/[0.08] shadow-[0_0_28px_rgba(125,211,252,0.12)]">
                <Building2 className="h-3.5 w-3.5" />
              </span>
              {copy.advisor.aboutKicker}
            </p>
            <span className={`h-px flex-1 ${light ? "bg-slate-200" : "bg-blue-200/[0.12]"}`} />
          </div>

          <div className="relative grid gap-8 pt-9 sm:pt-11 lg:grid-cols-12 lg:gap-12">
            <div className="pointer-events-none absolute bottom-0 left-[55%] top-32 hidden w-px bg-[linear-gradient(180deg,transparent,rgba(125,211,252,0.34),transparent)] lg:block" />
            <div className="lg:col-span-7">
              <div className="relative mb-7 flex justify-center text-center sm:mb-9">
                <span className="pointer-events-none absolute inset-x-[16%] bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.68),rgba(96,165,250,0.58),transparent)]" aria-hidden="true" />
                <h2 className={`pb-5 text-5xl font-bold leading-[0.84] tracking-[-0.07em] drop-shadow-[0_18px_48px_rgba(7,6,25,0.38)] sm:text-6xl xl:text-7xl ${titleClass}`}>
                  Bohemika <span className="bg-[linear-gradient(110deg,#c4b5fd_5%,#7dd3fc_56%,#c4b5fd_96%)] bg-clip-text text-transparent">a.s.</span>
                </h2>
              </div>
              <div className={`relative h-full overflow-hidden rounded-[38px_38px_12px_38px] border p-6 shadow-[0_34px_100px_rgba(3,2,14,0.3)] sm:p-10 ${panelClass}`}>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_102%_2%,rgba(125,211,252,0.12),transparent_31%),linear-gradient(135deg,rgba(37,99,235,0.11),transparent_55%)]" />
                <div
                  className={`pointer-events-none absolute -right-10 -top-14 h-[400px] w-[276px] [mask-image:radial-gradient(ellipse_at_center,black_36%,transparent_73%)] sm:-right-14 sm:-top-20 sm:h-[490px] sm:w-[340px] ${
                    light ? "opacity-[0.09] mix-blend-multiply" : "opacity-[0.16] mix-blend-screen"
                  }`}
                  aria-hidden="true"
                >
                  <Image
                    src="/images/bohemika-ghost-logo.png"
                    alt=""
                    fill
                    sizes="340px"
                    className="object-contain brightness-125 contrast-125 saturate-0"
                  />
                </div>
                <div className="relative">
                  <div className="mb-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="h-px w-12 bg-gradient-to-r from-cyan-300 to-blue-300" />
                    </div>
                    <span className="flex gap-1.5" aria-hidden="true">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(125,211,252,0.9)]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-300/80" />
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-300/35" />
                    </span>
                  </div>
                  <p className={`max-w-3xl text-2xl leading-[1.2] tracking-[-0.035em] sm:text-[2.15rem] ${titleClass}`}>
                    {copy.advisor.companyLead}
                  </p>
                  <div className={`mt-9 space-y-4 border-t pt-7 sm:mt-11 sm:pt-8 ${dividerClass}`}>
                    {copy.advisor.companyParagraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className={`max-w-3xl text-sm leading-relaxed sm:text-[15px] ${bodyClass}`}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="relative lg:col-span-5 lg:pt-[7.75rem] lg:pl-2">
              <div className="mb-5 flex items-center justify-between gap-4 sm:mb-6">
                <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${labelClass}`}>
                  {copy.advisor.pillarsKicker}
                </p>
                <span className={`h-px flex-1 ${light ? "bg-slate-200" : "bg-blue-200/[0.16]"}`} />
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute bottom-3 left-[17px] top-3 w-px bg-[linear-gradient(180deg,transparent,rgba(125,211,252,0.65),rgba(96,165,250,0.15),transparent)]" aria-hidden="true" />
                {COMPANY_PILLARS.map((pillar, index) => (
                  <div
                    key={copy.advisor.pillars[index]?.[0]}
                    className={`group relative flex gap-4 py-4 first:pt-0 last:pb-0 ${
                      index > 0 ? `border-t ${dividerClass}` : ""
                    }`}
                  >
                    <span className={`absolute right-0 top-4 text-[10px] font-bold tracking-[0.16em] ${bodyClass}`} aria-hidden="true">
                      0{index + 1}
                    </span>
                    <span className={`relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${light ? "bg-white" : "bg-[#07162f]"}`}>
                      <pillar.icon
                        className={`h-5 w-5 ${pillar.iconClass} drop-shadow-[0_8px_18px_rgba(147,197,253,0.22)] transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-110`}
                        strokeWidth={1.9}
                      />
                      <span className={`absolute inset-x-1 bottom-0 h-px rounded-full ${pillar.accentClass} opacity-80 shadow-[0_0_14px_currentColor]`} aria-hidden="true" />
                    </span>
                    <div className="pr-8">
                      <p className={`text-sm font-semibold sm:text-[15px] ${titleClass}`}>{copy.advisor.pillars[index]?.[0]}</p>
                      <p className={`mt-1 text-xs leading-relaxed sm:text-sm ${bodyClass}`}>
                        {copy.advisor.pillars[index]?.[1]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className={`relative mt-6 border-t pt-5 ${dividerClass}`}>
                <span className="absolute left-0 top-0 h-px w-20 bg-[linear-gradient(90deg,#e3000f,rgba(227,0,15,0.08))]" aria-hidden="true" />
                <div className="pointer-events-none absolute -left-10 top-1/2 h-20 w-52 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-[48px]" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5 lg:flex-col lg:items-start lg:gap-3 xl:flex-row xl:items-center xl:gap-5">
                  <Image
                    src="/icons/vienna-insurance-group.svg"
                    alt="Vienna Insurance Group"
                    width={236}
                    height={108}
                    className="h-auto w-[148px] shrink-0 brightness-150 contrast-125 drop-shadow-[0_8px_18px_rgba(8,10,36,0.28)] sm:w-[170px]"
                  />
                  <span className={`hidden h-9 w-px shrink-0 sm:block lg:hidden xl:block ${light ? "bg-slate-200" : "bg-blue-200/[0.22]"}`} aria-hidden="true" />
                  <p className={`max-w-xl text-[13px] leading-relaxed tracking-[-0.01em] sm:text-sm ${light ? "text-slate-700" : "text-blue-50"}`}>
                    {copy.advisor.vig}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section
        {...revealAttrs}
        className={`relative overflow-hidden px-4 py-16 sm:px-10 sm:py-24 vizitka-anim-up [animation-delay:560ms] ${revealClass}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.3),transparent)]" />
        <div className="pointer-events-none absolute left-[12%] top-10 h-52 w-52 rounded-full bg-blue-500/[0.12] blur-[84px]" />
        <div className="pointer-events-none absolute right-[10%] top-20 h-40 w-64 rounded-full bg-cyan-500/[0.08] blur-[76px]" />
        <div className="relative z-10 mx-auto max-w-[1360px]">
          <div className={`grid gap-5 border-b pb-8 sm:pb-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center ${light ? "border-slate-200" : "border-blue-200/[0.12]"}`}>
            <p className={`inline-flex w-fit items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] ${labelClass}`}>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/25 bg-current/[0.08]">
                <Handshake className="h-3.5 w-3.5" />
              </span>
              {copy.advisor.partnersKicker}
            </p>
            <h2 className={`text-4xl font-bold leading-[0.92] tracking-[-0.06em] sm:text-5xl lg:text-4xl lg:whitespace-nowrap xl:text-5xl 2xl:text-6xl ${titleClass}`}>
              {copy.advisor.partnersTitle}
            </h2>
          </div>

          <div className="relative mt-8 sm:mt-10">
            <div className="pointer-events-none absolute left-[30%] top-1/2 h-28 w-2/5 -translate-y-1/2 rounded-full bg-blue-500/[0.1] blur-[62px]" />
            <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8">
              {PARTNER_INSURERS.map((insurer, index) => (
                <div
                  key={insurer.label}
                  className={`group relative flex aspect-[2.12/1] items-center justify-center overflow-hidden rounded-[18px] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_10px_24px_rgba(3,2,14,0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_18px_34px_rgba(3,2,14,0.28)] ${
                    insurer.darkTile
                      ? "border-amber-200/25 bg-[#110a1d]/[0.88]"
                      : light
                      ? "border-slate-200/80 bg-white/[0.78]"
                      : "border-white/65 bg-white/[0.86]"
                  } partner-logo-tile vizitka-anim-up`}
                  style={{
                    animationDelay: `${660 + index * 45}ms`,
                    "--partner-logo-delay": `${index * 0.44}s`,
                  } as CSSProperties}
                >
                  <span className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.7),rgba(96,165,250,0.58),transparent)] opacity-0 transition duration-300 group-hover:opacity-100" />
                  <Image
                    src={insurer.logoPath}
                    alt={`${insurer.label} logo`}
                    fill
                    sizes="(min-width: 1280px) 160px, (min-width: 768px) 150px, 42vw"
                    className={`${getPartnerLogoClassName(insurer)} relative drop-shadow-[0_6px_12px_rgba(8,10,36,0.16)] transition duration-300 group-hover:scale-110`}
                  />
                  <span className="partner-logo-tile__sheen" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
