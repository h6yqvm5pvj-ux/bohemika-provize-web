"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Mail,
  MapPin,
  Phone,
  UserRound,
  X,
} from "lucide-react";

type ContactEmail = {
  value: string;
  label?: string;
  cc?: string;
};

type InstitutionContact = {
  key: string;
  institution: string;
  person?: string;
  role?: string;
  description?: string;
  logoPath: string;
  accentClass: string;
  phone?: {
    display: string;
    href: string;
  };
  emails?: ContactEmail[];
  notice?: string;
};

type CsobAlternative = {
  name: string;
  region: string;
  phone: {
    display: string;
    href: string;
  };
  email: string;
};

const CONTACTS: InstitutionContact[] = [
  {
    key: "bohemika-pavlina-bartkova",
    institution: "Bohemika",
    person: "Bc. Pavlína Bártková",
    description:
      "Správa sjednatelů, registrace, pohledávky a požadavky sjednatelů",
    logoPath: "/icons/bohemika_logo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(14,165,233,0.08),transparent_42%)]",
    phone: { display: "+420 603 458 845", href: "+420603458845" },
    emails: [
      { value: "pavlina.bartkova@bohemika.eu", label: "Pavlína Bártková" },
      { value: "pohledavky@bohemika.eu", label: "Pohledávky" },
    ],
  },
  {
    key: "bohemika-bela-kulhankova",
    institution: "Bohemika",
    person: "Běla Kulhánková",
    description:
      "Reklamace provizí vůči sjednatelům, zpracování žádostí, elektronizace smluv, bonusové akce a soutěže",
    logoPath: "/icons/bohemika_logo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(14,165,233,0.08),transparent_42%)]",
    phone: { display: "+420 734 353 363", href: "+420734353363" },
    emails: [{ value: "bela.kulhankova@bohemika.eu" }],
  },
  {
    key: "cpp",
    institution: "ČPP",
    person: "Vojtěch Vodička",
    role: "KAM",
    logoPath: "/icons/cpp.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(37,99,235,0.13),transparent_44%),radial-gradient(circle_at_8%_92%,rgba(239,68,68,0.09),transparent_42%)]",
    phone: { display: "+420 734 522 927", href: "+420734522927" },
    emails: [{ value: "vojtech.vodicka@cpp.cz" }],
  },
  {
    key: "allianz-storno",
    institution: "Allianz",
    description: "Storno smluv",
    logoPath: "/icons/allianz.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(0,102,178,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(0,70,140,0.07),transparent_42%)]",
    emails: [{ value: "BO_storno_auta@allianz.cz", label: "Storno smluv" }],
    notice: "Nesdělovat e-mail klientům, pouze pro interní účely!",
  },
  {
    key: "allianz-metodicka-podpora",
    institution: "Allianz",
    description: "Metodická podpora a informace o smlouvách",
    logoPath: "/icons/allianz.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(0,102,178,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(0,70,140,0.07),transparent_42%)]",
    phone: { display: "+420 241 170 000", href: "+420241170000" },
    emails: [{ value: "info@allianz.cz" }],
  },
  {
    key: "allianz-eliska-stastna",
    institution: "Allianz",
    person: "Eliška Šťastná",
    role: "KAM",
    logoPath: "/icons/allianz.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(0,102,178,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(0,70,140,0.07),transparent_42%)]",
    phone: { display: "+420 731 922 909", href: "+420731922909" },
    emails: [{ value: "eliska.stastna@allianz.cz" }],
  },
  {
    key: "uniqa",
    institution: "UNIQA",
    person: "Luboš Meruňka",
    role: "KAM",
    logoPath: "/icons/uniqa.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(168,85,247,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(236,72,153,0.08),transparent_42%)]",
    phone: { display: "+420 734 163 979", href: "+420734163979" },
    emails: [{ value: "lubos.merunka@uniqa.cz" }],
  },
  {
    key: "kooperativa",
    institution: "Kooperativa",
    person: "Jiří Kratochvíl",
    logoPath: "/icons/koop-v2.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(22,163,74,0.14),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(34,197,94,0.08),transparent_42%)]",
    emails: [
      { value: "jkratochvil@koop.cz", label: "Jiří Kratochvíl" },
      {
        value: "podporasever@koop.cz",
        label: "Podpora Sever",
        cc: "jkratochvil@koop.cz",
      },
    ],
    notice:
      "Při e-mailu na Podporu Sever musí být v kopii také Jiří Kratochvíl. Kliknutím na adresu se kopie doplní automaticky.",
  },
  {
    key: "investika",
    institution: "iNVESTiKA",
    person: "Tereza Bartůňková",
    logoPath: "/icons/invstk.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(250,204,21,0.17),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(71,85,105,0.08),transparent_42%)]",
    phone: { display: "+420 702 218 819", href: "+420702218819" },
    emails: [
      { value: "terezabartunkova@investika.cz", label: "Tereza Bartůňková" },
      { value: "administrace@investika.cz", label: "Administrace" },
    ],
  },
  {
    key: "comfort-commodity",
    institution: "Comfort Commodity",
    person: "Tereza Mičková",
    logoPath: "/icons/cclogo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(159,18,57,0.14),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(202,138,4,0.1),transparent_42%)]",
    phone: { display: "+420 734 232 022", href: "+420734232022" },
    emails: [{ value: "info@comfort-commodity.cz" }],
  },
  {
    key: "csob",
    institution: "ČSOB Pojišťovna",
    person: "Daniel Vlk",
    role: "KAM",
    logoPath: "/icons/csb.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(2,132,199,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(30,64,175,0.08),transparent_42%)]",
    phone: { display: "+420 604 293 177", href: "+420604293177" },
    emails: [{ value: "dvlk@csob.cz" }],
  },
  {
    key: "maxima",
    institution: "MAXIMA pojišťovna",
    person: "Alena Zikmundová",
    logoPath: "/icons/maxima.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(225,29,72,0.14),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(244,63,94,0.08),transparent_42%)]",
    phone: { display: "+420 736 777 434", href: "+420736777434" },
    emails: [{ value: "zikmundova@maxima-as.cz" }],
  },
  {
    key: "slavia",
    institution: "Slavia pojišťovna",
    logoPath: "/icons/slavialogo.png",
    accentClass:
      "bg-[radial-gradient(circle_at_92%_8%,rgba(234,88,12,0.15),transparent_45%),radial-gradient(circle_at_8%_92%,rgba(251,146,60,0.08),transparent_42%)]",
    phone: { display: "+420 731 011 598", href: "+420731011598" },
    emails: [{ value: "Katerina.Kubatova@slavia-pojistovna.cz" }],
  },
];

const INSTITUTION_FILTERS = Array.from(
  new Set(CONTACTS.map((contact) => contact.institution)),
);

const CSOB_ALTERNATIVES: CsobAlternative[] = [
  {
    name: "Milan Němec",
    region: "Praha a Středočeský kraj",
    phone: { display: "+420 731 143 499", href: "+420731143499" },
    email: "milan.nemec@csobpoj.cz",
  },
  {
    name: "Michaela Kitnerová",
    region: "Praha a Středočeský kraj",
    phone: { display: "+420 725 391 119", href: "+420725391119" },
    email: "mkitnerova@csob.cz",
  },
  {
    name: "Kateřina Hudec",
    region: "Praha a Středočeský kraj",
    phone: { display: "+420 724 413 674", href: "+420724413674" },
    email: "khudec@csob.cz",
  },
  {
    name: "Martin Jor",
    region: "Pardubický kraj",
    phone: { display: "+420 705 830 837", href: "+420705830837" },
    email: "martin.jor@csobpoj.cz",
  },
  {
    name: "Zuzana Horáčková",
    region: "Královéhradecký kraj",
    phone: { display: "+420 604 294 729", href: "+420604294729" },
    email: "zhorackova@csob.cz",
  },
  {
    name: "Kateřina Kolková",
    region: "Moravskoslezský kraj",
    phone: { display: "+420 704 648 368", href: "+420704648368" },
    email: "katerina.kolkova@csobpoj.cz",
  },
  {
    name: "Petra Smoluchová",
    region: "Severní Morava",
    phone: { display: "+420 733 143 466", href: "+420733143466" },
    email: "pesmoluchova@csob.cz",
  },
  {
    name: "Josef Sklenář",
    region: "Olomoucký a Zlínský kraj",
    phone: { display: "+420 604 293 101", href: "+420604293101" },
    email: "jsklenar@csob.cz",
  },
  {
    name: "Irena Zachová",
    region: "Jihomoravský kraj",
    phone: { display: "+420 703 484 350", href: "+420703484350" },
    email: "irena.zachova@csobpoj.cz",
  },
  {
    name: "Martina Růžičková",
    region: "Jihočeský kraj",
    phone: { display: "+420 705 830 838", href: "+420705830838" },
    email: "martina.ruzickova@csobpoj.cz",
  },
  {
    name: "Simona Pešková Benešová",
    region: "Kraj Vysočina",
    phone: { display: "+420 603 144 506", href: "+420603144506" },
    email: "speskovabenesova@csob.cz",
  },
  {
    name: "Jakub Velíšek",
    region: "Plzeňský a Karlovarský kraj",
    phone: { display: "+420 725 358 436", href: "+420725358436" },
    email: "jvelisek@csob.cz",
  },
  {
    name: "Richard Vronský",
    region: "Webové služby a srovnávače",
    phone: { display: "+420 724 635 908", href: "+420724635908" },
    email: "richard.vronsky@csobpoj.cz",
  },
];

const mailtoHref = ({ value, cc }: ContactEmail): string =>
  cc
    ? `mailto:${value}?cc=${encodeURIComponent(cc)}`
    : `mailto:${value}`;

export function ContactsModal({ onClose }: { onClose: () => void }) {
  const [showCsobAlternatives, setShowCsobAlternatives] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );
  const visibleContacts = selectedInstitution
    ? CONTACTS.filter(
        (contact) => contact.institution === selectedInstitution,
      )
    : CONTACTS;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contacts-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Zavřít kontakty"
      />

      <section className="relative z-10 my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(155deg,#ffffff_0%,#f8fafc_55%,#f5f3ff_100%)] shadow-[0_34px_100px_rgba(2,6,23,0.42)] sm:max-h-[calc(100dvh-3rem)]">
        <header className="relative border-b border-slate-200/90 px-5 py-5 pr-16 sm:px-7 sm:py-6 sm:pr-20">
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-violet-200/45 blur-3xl" />
          <div className="relative">
            {showCsobAlternatives ? (
              <button
                type="button"
                onClick={() => setShowCsobAlternatives(false)}
                className="group inline-flex items-center gap-2 text-sm font-extrabold text-sky-700 transition hover:text-sky-900"
              >
                <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
                Zpět na kontakty
              </button>
            ) : (
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">
                Obecné
              </p>
            )}
            <h2
              id="contacts-modal-title"
              className="mt-1.5 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl"
            >
              {showCsobAlternatives ? "Alternativní kontakty ČSOB" : "Kontakty"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              {showCsobAlternatives
                ? "Regionální manažeři a další kontakty, na které se můžete obrátit, pokud Daniel Vlk není dostupný."
                : "Přímé kontakty na obchodní a administrativní podporu partnerských institucí."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 sm:right-6 sm:top-6"
            aria-label="Zavřít"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {!showCsobAlternatives ? (
          <nav
            className="border-b border-slate-200/80 bg-white/70 px-4 py-3 backdrop-blur-sm sm:px-6"
            aria-label="Filtrovat kontakty podle instituce"
          >
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedInstitution(null)}
                aria-pressed={selectedInstitution === null}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${
                  selectedInstitution === null
                    ? "border-violet-700 bg-violet-700 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                }`}
              >
                Všechny
                <span
                  className={`text-[10px] ${
                    selectedInstitution === null
                      ? "text-violet-100"
                      : "text-slate-400"
                  }`}
                >
                  {CONTACTS.length}
                </span>
              </button>
              {INSTITUTION_FILTERS.map((institution) => {
                const isActive = selectedInstitution === institution;
                const count = CONTACTS.filter(
                  (contact) => contact.institution === institution,
                ).length;

                return (
                  <button
                    key={institution}
                    type="button"
                    onClick={() => setSelectedInstitution(institution)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${
                      isActive
                        ? "border-violet-700 bg-violet-700 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                    }`}
                  >
                    {institution}
                    <span
                      className={`text-[10px] ${
                        isActive ? "text-violet-100" : "text-slate-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        ) : null}

        {showCsobAlternatives ? (
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            <div className="relative isolate overflow-hidden rounded-[24px] border border-sky-200 bg-white p-4 shadow-[0_16px_40px_rgba(3,105,161,0.1)] sm:p-5">
              <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-80 opacity-[0.07] mix-blend-multiply">
                <Image
                  src="/icons/csb.png"
                  alt=""
                  fill
                  sizes="320px"
                  className="object-contain"
                  aria-hidden="true"
                />
              </div>
              <div className="relative grid grid-cols-1 gap-x-8 gap-y-0 md:grid-cols-2">
                {CSOB_ALTERNATIVES.map((contact) => (
                  <article
                    key={contact.email}
                    className="min-w-0 border-b border-slate-200/90 py-4 first:pt-0 md:[&:nth-child(2)]:pt-0"
                  >
                    <h3 className="text-base font-black tracking-[-0.015em] text-slate-950">
                      {contact.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-sky-800">
                      <MapPin className="h-4 w-4 shrink-0 text-sky-600" />
                      {contact.region}
                    </p>
                    <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-5">
                      <a
                        href={`tel:${contact.phone.href}`}
                        className="group inline-flex min-w-0 items-center gap-2 py-1 text-sm font-bold text-slate-700 transition hover:text-sky-800"
                      >
                        <Phone className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-sky-600" />
                        {contact.phone.display}
                      </a>
                      <a
                        href={`mailto:${contact.email}`}
                        className="group inline-flex min-w-0 items-center gap-2 py-1 text-sm font-bold text-slate-700 transition hover:text-sky-800"
                      >
                        <Mail className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-sky-600" />
                        <span className="break-all">{contact.email}</span>
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        ) : (
        <div className="grid min-h-0 grid-cols-1 auto-rows-max items-start gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
          {visibleContacts.map((contact) => (
            <article
              key={contact.key}
              className="relative isolate h-auto min-w-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_18px_36px_rgba(15,23,42,0.12)] sm:p-5"
            >
              <div className={`pointer-events-none absolute inset-0 ${contact.accentClass}`} />
              <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-72 opacity-[0.09] mix-blend-multiply sm:-right-5 sm:h-56 sm:w-80">
                <Image
                  src={contact.logoPath}
                  alt=""
                  fill
                  sizes="320px"
                  className="object-contain"
                  aria-hidden="true"
                />
              </div>
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="pr-4 text-lg font-black tracking-[-0.02em] text-slate-950">
                    {contact.institution}
                  </h3>
                  {contact.role ? (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">
                      {contact.role}
                    </span>
                  ) : null}
                </div>
                {contact.person ? (
                  <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-600">
                    <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                    {contact.person}
                  </p>
                ) : null}
                {contact.description ? (
                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    {contact.description}
                  </p>
                ) : null}

                <div className="mt-4 space-y-1">
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone.href}`}
                      className="group flex min-h-9 items-center gap-2.5 py-1 text-sm font-bold text-slate-700 transition hover:text-violet-800"
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-slate-500 transition group-hover:text-violet-700">
                        <Phone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">{contact.phone.display}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-violet-500" />
                    </a>
                  ) : null}

                  {contact.emails?.map((email) => (
                    <a
                      key={email.value}
                      href={mailtoHref(email)}
                      className="group flex min-h-9 items-center gap-2.5 py-1 text-slate-700 transition hover:text-violet-800"
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-slate-500 transition group-hover:text-violet-700">
                        <Mail className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {email.label ? (
                          <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                            {email.label}
                          </span>
                        ) : null}
                        <span className="block break-all text-xs font-bold sm:text-[13px]">
                          {email.value}
                        </span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-violet-500" />
                    </a>
                  ))}
                </div>

                {contact.key === "csob" ? (
                  <div className="mt-3 border-t border-sky-200/80 pt-3">
                    <p className="text-xs font-bold leading-5 text-slate-600">
                      V případě, že se nemůžete dovolat Vlkovi
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCsobAlternatives(true)}
                      className="group mt-2 inline-flex items-center gap-2 rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-sky-800 hover:shadow-md"
                    >
                      Zobrazit alternativy
                      <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </button>
                  </div>
                ) : null}

                {contact.notice ? (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-5 text-amber-950">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <p>{contact.notice}</p>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}
