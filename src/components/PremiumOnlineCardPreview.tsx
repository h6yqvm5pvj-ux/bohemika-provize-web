"use client";

import {
  BriefcaseBusiness,
  CalendarPlus2,
  Globe2,
  Mail,
  MapPin,
  MessageSquareQuote,
  PenLine,
  PhoneCall,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ComponentType } from "react";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export type PremiumOnlineCardValue = {
  fullName: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  ico: string;
  bio: string;
  location: string;
  officeLabel: string;
  officePhotos: string[];
};

type PremiumOnlineCardPreviewProps = {
  value: PremiumOnlineCardValue;
  editable?: boolean;
  onPatch?: (patch: Partial<PremiumOnlineCardValue>) => void;
  className?: string;
  layout?: "contained" | "fullWidth";
  density?: "normal" | "compact";
  surface?: "card" | "seamless";
  theme?: "dark" | "light";
  showContactSection?: boolean;
  meetingCta?: {
    label?: string;
    onClick?: () => void;
    disabled?: boolean;
    busy?: boolean;
  } | null;
};

const sanitizeWebsite = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return trimmed;
  }
};

const normalizePhoneHref = (value: string): string => {
  const cleaned = value.replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "tel:";
};

const normalizeWebsiteLabel = (value: string): string => value.replace(/^https?:\/\//i, "");

const lightEditableInputClass =
  "w-full bg-transparent !text-slate-900 placeholder:text-slate-400 outline-none";
const darkEditableInputClass =
  "w-full bg-transparent !text-white placeholder:text-white/45 outline-none";

type ContactTone = "light" | "dark";

type ContactRowProps = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: string;
  placeholder: string;
  onChange?: (value: string) => void;
  editable: boolean;
  href?: string;
  tone?: ContactTone;
};

function ContactRow({
  label,
  icon: Icon,
  value,
  placeholder,
  onChange,
  editable,
  href,
  tone = "light",
}: ContactRowProps) {
  const dark = tone === "dark";

  return (
    <div
      className={`group border-b py-3 transition-colors first:pt-0 last:border-b-0 last:pb-0 sm:py-4 ${
        dark ? "border-transparent" : "border-slate-200/75"
      }`}
    >
      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,188px)_minmax(0,1fr)] sm:items-center sm:gap-3">
        <div className={`inline-flex items-center gap-2.5 ${dark ? "text-violet-200/75" : "text-slate-500"}`}>
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
              dark
                ? "border-white/14 bg-white/[0.07] text-violet-100 group-hover:border-violet-300/60 group-hover:text-white"
                : "border-slate-200/90 bg-white/85 text-slate-600 group-hover:border-slate-300 group-hover:text-slate-900"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
              dark ? "text-violet-200/75" : "text-slate-500"
            }`}
          >
            {label}
          </span>
        </div>

        <div
          className={`min-h-[24px] text-[15px] font-semibold leading-tight sm:text-[16px] ${
            dark ? "text-white/92" : "text-slate-900"
          }`}
        >
          {editable ? (
            <input
              type="text"
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              placeholder={placeholder}
              className={dark ? darkEditableInputClass : lightEditableInputClass}
            />
          ) : value ? (
            href ? (
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noreferrer noopener" : undefined}
                className={`underline underline-offset-4 transition ${
                  dark
                    ? "decoration-violet-300/30 hover:decoration-violet-300"
                    : "decoration-slate-300 hover:decoration-slate-900"
                }`}
              >
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className={dark ? "text-white/35" : "text-slate-400"}>{placeholder}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PremiumOnlineCardPreview({
  value,
  editable = false,
  onPatch,
  className,
  layout = "contained",
  density = "normal",
  surface = "card",
  theme = "dark",
  showContactSection = true,
  meetingCta,
}: PremiumOnlineCardPreviewProps) {
  const fullWidthLayout = layout === "fullWidth";
  const compact = fullWidthLayout && density === "compact";
  const seamless = fullWidthLayout && surface === "seamless";
  const lightFullWidth = fullWidthLayout && theme === "light";
  const websiteLink = sanitizeWebsite(value.website);
  const websiteLabel = websiteLink ? normalizeWebsiteLabel(websiteLink) : value.website;
  const phoneLink = value.phone ? normalizePhoneHref(value.phone) : "";
  const meetingCtaLabel = meetingCta?.label?.trim() || "Sjednat schůzku";
  const showHeaderCta = !fullWidthLayout && !!meetingCta;
  const editableFieldFrameClass = fullWidthLayout
    ? compact
      ? "rounded-lg border border-dashed border-violet-300/45 bg-white/[0.03] px-2.5 py-1.5 transition-colors hover:border-violet-200/65 focus-within:border-violet-200/80 focus-within:bg-white/[0.05]"
      : "rounded-xl border border-dashed border-violet-300/45 bg-white/[0.03] px-3 py-2 transition-colors hover:border-violet-200/65 focus-within:border-violet-200/80 focus-within:bg-white/[0.05]"
    : "rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 transition-colors hover:border-slate-400 focus-within:border-slate-500 focus-within:bg-white";
  const editableFieldLabelClass = fullWidthLayout
    ? compact
      ? "text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-200/78"
      : "text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/78"
    : "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500";

  const fullNameInputClass = fullWidthLayout
    ? compact
      ? "w-full bg-transparent text-[34px] font-extrabold leading-[0.96] !text-white placeholder:text-white/45 outline-none sm:text-[44px] lg:text-[56px] xl:text-[62px]"
      : "w-full bg-transparent text-[38px] font-extrabold leading-[0.96] !text-white placeholder:text-white/45 outline-none sm:text-[64px] sm:leading-[0.95] lg:text-[84px]"
    : "w-full bg-transparent text-[40px] font-extrabold leading-[0.98] tracking-[-0.05em] !text-slate-950 placeholder:text-slate-400 outline-none sm:text-[58px]";
  const fullNameDisplayClass = fullWidthLayout
    ? compact
      ? `text-[34px] font-extrabold leading-[0.96] ${
          lightFullWidth ? "text-slate-950" : "text-white"
        } sm:text-[44px] lg:text-[56px] xl:text-[62px]`
      : `text-[38px] font-extrabold leading-[0.96] ${
          lightFullWidth ? "text-slate-950" : "text-white"
        } sm:text-[64px] sm:leading-[0.95] lg:text-[84px]`
    : "text-[40px] font-extrabold leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-[58px]";
  const titleInputClass = fullWidthLayout
    ? compact
      ? "w-full bg-transparent text-[21px] font-semibold !text-white/78 placeholder:text-white/45 outline-none sm:text-[26px] lg:text-[30px]"
      : "w-full bg-transparent text-[22px] font-semibold !text-white/78 placeholder:text-white/45 outline-none sm:text-[32px] lg:text-[36px]"
    : "w-full bg-transparent text-base font-medium !text-slate-600 placeholder:text-slate-400 outline-none sm:text-xl";
  const titleDisplayClass = fullWidthLayout
    ? compact
      ? `text-[21px] font-semibold ${
          lightFullWidth ? "text-slate-700" : "text-white/78"
        } sm:text-[26px] lg:text-[30px]`
      : `text-[22px] font-semibold ${
          lightFullWidth ? "text-slate-700" : "text-white/78"
        } sm:text-[32px] lg:text-[36px]`
    : "text-base font-medium text-slate-600 sm:text-xl";

  const identityBlock = (
    <div className={`${fullWidthLayout ? (compact ? "space-y-1.5" : "space-y-2") : "space-y-2 pt-1"} vizitka-anim-up [animation-delay:140ms]`}>
      {fullWidthLayout ? (
        <p
          className={`inline-flex items-center gap-2 rounded-full border font-semibold uppercase tracking-[0.18em] ${
            lightFullWidth
              ? "border-violet-200 bg-white/70 text-violet-950"
              : "border-violet-300/35 bg-white/[0.06] text-violet-100"
          } ${
            compact ? "px-2.5 py-0.5 text-[9px]" : "px-3 py-1 text-[11px]"
          }`}
        >
          <UserRound className={compact ? "h-3 w-3 text-fuchsia-300" : "h-3.5 w-3.5 text-fuchsia-300"} />
          Profil poradce
        </p>
      ) : null}

      {editable ? (
        <div className={editableFieldFrameClass}>
          <p className={editableFieldLabelClass}>Jméno a příjmení</p>
          <input
            type="text"
            value={value.fullName}
            onChange={(event) => onPatch?.({ fullName: event.target.value.slice(0, 120) })}
            placeholder="Jméno a příjmení"
            className={`${fullNameInputClass} mt-1`}
          />
        </div>
      ) : value.fullName ? (
        <h1 className={`${fullNameDisplayClass} vizitka-anim-up [animation-delay:180ms]`}>{value.fullName}</h1>
      ) : null}

      {editable ? (
        <div className={`inline-flex w-full items-center ${compact ? "gap-2" : "gap-2.5"}`}>
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full border ${
              compact ? "h-7 w-7" : "h-8 w-8"
            } ${
              fullWidthLayout ? "border-white/16 bg-white/[0.06] text-violet-100" : "border-slate-200 bg-white/80 text-slate-600"
            }`}
          >
            <BriefcaseBusiness className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </span>
          <div className={`flex-1 ${editableFieldFrameClass}`}>
            <p className={editableFieldLabelClass}>Pozice</p>
            <input
              type="text"
              value={value.title}
              onChange={(event) => onPatch?.({ title: event.target.value.slice(0, 120) })}
              placeholder="Pozice / role"
              className={`${titleInputClass} mt-1`}
            />
          </div>
        </div>
      ) : value.title ? (
        <div className="inline-flex items-center gap-2.5 vizitka-anim-up [animation-delay:230ms]">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
              fullWidthLayout
                ? lightFullWidth
                  ? "border-violet-200 bg-white/75 text-violet-700"
                  : "border-white/16 bg-white/[0.06] text-violet-100"
                : "border-slate-200 bg-white/80 text-slate-600"
            }`}
          >
            <BriefcaseBusiness className="h-4 w-4" />
          </span>
          <p className={titleDisplayClass}>{value.title}</p>
        </div>
      ) : null}
    </div>
  );

  const bioSection = (
    <section
      className={`border-t vizitka-anim-up [animation-delay:360ms] ${
        compact ? "pt-3 sm:pt-4" : "pt-5 sm:pt-6"
      } ${
        fullWidthLayout ? "border-transparent" : "border-slate-200/85"
      }`}
    >
      <h2
        className={`inline-flex items-center gap-2 font-semibold uppercase tracking-[0.22em] ${
          compact ? "text-[9px]" : "text-[11px]"
        } ${
          fullWidthLayout ? (lightFullWidth ? "text-violet-800/78" : "text-violet-200/82") : "text-slate-500"
        }`}
      >
        <MessageSquareQuote className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        O mně
      </h2>
      {editable ? (
        <div className={`${editableFieldFrameClass} ${compact ? "mt-2" : "mt-3"}`}>
          <p className={editableFieldLabelClass}>O mně</p>
          <textarea
            value={value.bio}
            onChange={(event) => onPatch?.({ bio: event.target.value.slice(0, 1_000) })}
            placeholder="Krátké představení pro veřejnou vizitku."
            className={`mt-1 w-full resize-y bg-transparent leading-relaxed outline-none ${
              compact ? "min-h-[86px] text-xs sm:text-sm" : "min-h-[130px] text-sm sm:text-base"
            } ${
              fullWidthLayout ? "!text-white/88 placeholder:text-white/45" : "!text-slate-800 placeholder:text-slate-400"
            }`}
          />
        </div>
      ) : value.bio ? (
        <p
          className={`mt-3 whitespace-pre-line text-sm leading-relaxed sm:text-base ${
            fullWidthLayout ? (lightFullWidth ? "text-slate-700" : "text-white/82") : "text-slate-700"
          }`}
        >
          {value.bio}
        </p>
      ) : (
        <p className={`mt-3 text-sm sm:text-base ${fullWidthLayout ? "text-white/42" : "text-slate-400"}`}>
          Bez doplněného představení.
        </p>
      )}
    </section>
  );

  const contactSection = (
    <section
      className={`space-y-0 border-t pt-5 sm:pt-6 vizitka-anim-up [animation-delay:420ms] ${
        fullWidthLayout ? "border-transparent" : "border-slate-200/90"
      }`}
    >
      {fullWidthLayout ? (
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {[
            {
              key: "phone",
              label: "Telefon",
              icon: PhoneCall,
              value: value.phone,
              placeholder: "+420 777 000 111",
              href: !editable && phoneLink ? phoneLink : undefined,
              onChange: (next: string) => onPatch?.({ phone: next.slice(0, 80) }),
            },
            {
              key: "email",
              label: "E-mail",
              icon: Mail,
              value: value.email,
              placeholder: "jmeno@bohemika.eu",
              href: !editable && value.email ? `mailto:${value.email}` : undefined,
              onChange: (next: string) => onPatch?.({ email: next.slice(0, 160) }),
            },
            {
              key: "web",
              label: "Web",
              value: editable ? value.website : websiteLabel,
              icon: Globe2,
              placeholder: "https://...",
              href: !editable && websiteLink ? websiteLink : undefined,
              onChange: (next: string) => onPatch?.({ website: next.slice(0, 220) }),
            },
            {
              key: "ico",
              label: "IČO",
              icon: BriefcaseBusiness,
              value: value.ico,
              placeholder: "12345678",
              onChange: (next: string) => onPatch?.({ ico: next.replace(/\D+/g, "").slice(0, 8) }),
            },
            {
              key: "location",
              label: "Lokalita",
              icon: MapPin,
              value: value.location,
              placeholder: "Město",
              onChange: (next: string) => onPatch?.({ location: next.slice(0, 120) }),
            },
          ].map((item) => (
            <div key={item.key} className="group space-y-2">
              <div className="inline-flex items-center gap-2.5 text-violet-200/75">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/14 bg-white/[0.07] text-violet-100 transition-colors group-hover:border-violet-300/60 group-hover:text-white">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/75">
                  {item.label}
                </span>
              </div>

	              <div className="min-h-[28px] break-words pl-[42px] text-[18px] font-semibold leading-tight text-white/92 sm:text-[22px]">
	                {editable ? (
	                  <div className={editableFieldFrameClass}>
	                    <p className={editableFieldLabelClass}>Kontakt</p>
	                    <input
	                      type="text"
	                      value={item.value}
	                      onChange={(event) => item.onChange(event.target.value)}
	                      placeholder={item.placeholder}
	                      className={`${darkEditableInputClass} mt-1`}
	                    />
	                  </div>
	                ) : item.value ? (
	                  item.href ? (
	                    <a
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noreferrer noopener" : undefined}
                      className="underline decoration-violet-300/30 underline-offset-4 transition hover:decoration-violet-300"
                    >
                      {item.value}
                    </a>
                  ) : (
                    item.value
                  )
                ) : (
                  <span className="text-white/35">{item.placeholder}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <ContactRow
            label="Telefon"
            icon={PhoneCall}
            value={value.phone}
            placeholder="+420 777 000 111"
            editable={editable}
            onChange={(next) => onPatch?.({ phone: next.slice(0, 80) })}
            href={!editable && phoneLink ? phoneLink : undefined}
            tone="light"
          />
          <ContactRow
            label="E-mail"
            icon={Mail}
            value={value.email}
            placeholder="jmeno@bohemika.eu"
            editable={editable}
            onChange={(next) => onPatch?.({ email: next.slice(0, 160) })}
            href={!editable && value.email ? `mailto:${value.email}` : undefined}
            tone="light"
          />
          <ContactRow
            label="Web"
            icon={Globe2}
            value={editable ? value.website : websiteLabel}
            placeholder="https://..."
            editable={editable}
            onChange={(next) => onPatch?.({ website: next.slice(0, 220) })}
            href={!editable && websiteLink ? websiteLink : undefined}
            tone="light"
          />
          <ContactRow
            label="IČO"
            icon={BriefcaseBusiness}
            value={value.ico}
            placeholder="12345678"
            editable={editable}
            onChange={(next) => onPatch?.({ ico: next.replace(/\D+/g, "").slice(0, 8) })}
            tone="light"
          />
          <ContactRow
            label="Lokalita"
            icon={MapPin}
            value={value.location}
            placeholder="Město"
            editable={editable}
            onChange={(next) => onPatch?.({ location: next.slice(0, 120) })}
            tone="light"
          />
        </>
      )}
    </section>
  );

  return (
    <article
      className={`${jakarta.className} premium-online-card-preview ${
        fullWidthLayout ? "premium-online-card-preview--full" : "premium-online-card-preview--contained"
      } relative isolate text-slate-900 ${
        fullWidthLayout
          ? seamless
            ? compact
              ? `overflow-hidden bg-transparent px-4 py-3 ${
                  lightFullWidth ? "text-slate-950" : "text-white"
                } sm:px-5 sm:py-4 lg:px-7 lg:py-5`
              : `overflow-hidden bg-transparent px-4 py-4 ${
                  lightFullWidth ? "text-slate-950" : "text-white"
                } sm:px-8 sm:py-6 lg:px-12 lg:py-8`
            : compact
              ? "overflow-hidden rounded-[28px] border border-violet-400/24 bg-[radial-gradient(circle_at_14%_16%,rgba(168,85,247,0.34),transparent_38%),radial-gradient(circle_at_88%_6%,rgba(59,130,246,0.22),transparent_35%),linear-gradient(145deg,#10081f_0%,#0f0b22_45%,#0b0a1b_100%)] px-4 py-3 text-white shadow-[0_24px_70px_rgba(8,6,28,0.5),inset_0_1px_0_rgba(196,181,253,0.2)] sm:px-5 sm:py-4 lg:px-7 lg:py-5"
              : "overflow-hidden rounded-[36px] border border-violet-400/24 bg-[radial-gradient(circle_at_14%_16%,rgba(168,85,247,0.34),transparent_38%),radial-gradient(circle_at_88%_6%,rgba(59,130,246,0.22),transparent_35%),linear-gradient(145deg,#10081f_0%,#0f0b22_45%,#0b0a1b_100%)] px-4 py-4 text-white shadow-[0_35px_90px_rgba(8,6,28,0.65),inset_0_1px_0_rgba(196,181,253,0.2)] sm:px-8 sm:py-6 lg:px-12 lg:py-8"
          : "overflow-hidden rounded-[32px] border border-slate-200/85 bg-[linear-gradient(140deg,#f8fcff_0%,#ffffff_44%,#eef6ff_100%)] px-5 py-5 shadow-[0_28px_80px_rgba(15,23,42,0.09)] sm:px-8 sm:py-8"
      } ${className ?? ""}`}
    >
      {fullWidthLayout ? (
        <>
          <div
            className={`pointer-events-none absolute -right-32 -top-24 h-72 w-72 rounded-full blur-[100px] vizitka-ambient-float ${
              lightFullWidth ? "bg-violet-200/45" : "bg-fuchsia-500/25"
            }`}
          />
          <div
            className={`pointer-events-none absolute -left-32 bottom-[-140px] h-80 w-80 rounded-full blur-[110px] vizitka-ambient-float [animation-delay:-6s] ${
              lightFullWidth ? "bg-sky-100/50" : "bg-indigo-500/22"
            }`}
          />
          <div
            className={`pointer-events-none absolute inset-0 ${
              lightFullWidth
                ? "bg-[radial-gradient(circle_at_82%_28%,rgba(124,58,237,0.08),transparent_36%)]"
                : "bg-[radial-gradient(circle_at_82%_28%,rgba(255,255,255,0.08),transparent_36%)]"
            }`}
          />
          {!seamless ? (
            <div
              className={`pointer-events-none absolute inset-[1px] border ${
                lightFullWidth ? "border-violet-100" : "border-white/7"
              } ${compact ? "rounded-[27px]" : "rounded-[35px]"}`}
            />
          ) : null}
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute -left-16 top-[-96px] h-64 w-64 rounded-full bg-cyan-200/42 blur-3xl vizitka-ambient-float" />
          <div className="pointer-events-none absolute -right-16 bottom-[-110px] h-72 w-72 rounded-full bg-blue-200/42 blur-3xl vizitka-ambient-float [animation-delay:-5s] [animation-duration:19s]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_12%,rgba(255,255,255,0.92),transparent_45%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.22)_1px,transparent_1px)] [background-size:52px_52px]" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.5),transparent)] vizitka-line-pulse" />
        </>
      )}

	      <div className={`relative z-10 ${fullWidthLayout ? (compact ? "space-y-4" : "space-y-7") : "space-y-6 sm:space-y-8"}`}>
	        {editable ? (
	          <div
            className={`mb-4 ${
              fullWidthLayout && compact
                ? "-mx-4 -mt-3 sm:-mx-5 sm:-mt-4 lg:-mx-7 lg:-mt-5"
                : fullWidthLayout
                ? "-mx-4 -mt-4 sm:-mx-8 sm:-mt-6 lg:-mx-12 lg:-mt-8"
                : "-mx-5 -mt-5 sm:-mx-8 sm:-mt-8 sm:mb-5"
            }`}
          >
	            <div className={`flex items-center gap-2 border-b border-[#1e293b] bg-[linear-gradient(90deg,#0b1220_0%,#0a1a3f_50%,#0a3356_100%)] px-4 vizitka-anim-up [animation-delay:20ms] ${compact ? "py-1.5" : "py-2"}`}>
              <span className={`${compact ? "h-2 w-2" : "h-2.5 w-2.5"} rounded-full bg-[#fb7185]`} />
              <span className={`${compact ? "h-2 w-2" : "h-2.5 w-2.5"} rounded-full bg-[#f59e0b]`} />
              <span className={`${compact ? "h-2 w-2" : "h-2.5 w-2.5"} rounded-full bg-[#22c55e]`} />
	              <span className="ml-2 truncate rounded border border-[#31415f] bg-[#1f2937] px-2 py-0.5 text-[10px] font-medium text-[#cbd5e1]">
	                Bohemka.App export preview
	              </span>
	            </div>
	          </div>
	        ) : null}
	        {editable ? (
	          <div
	            className={`inline-flex w-fit max-w-full items-center gap-2 rounded-full border font-semibold vizitka-anim-up [animation-delay:50ms] ${
                compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"
              } ${
	              fullWidthLayout
	                ? "border-violet-300/40 bg-white/[0.06] text-violet-100"
	                : "border-slate-300 bg-white/90 text-slate-700"
	            }`}
	          >
		            <PenLine className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
		            Upravitelné: jméno, pozice, O mně a kontakt
		          </div>
		        ) : null}

        {fullWidthLayout ? (
          <header className={`${compact ? "pb-2 pt-0 sm:pb-3" : "pb-6 pt-1 sm:pb-7"} vizitka-anim-up [animation-delay:80ms]`}>
            <div className={compact ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.78fr)] lg:items-center" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"}>
              <div className={`order-2 text-left lg:order-1 ${compact ? "space-y-4 lg:pt-0" : "space-y-6 lg:pt-2"}`}>
                {identityBlock}
                {bioSection}
              </div>
              <div className={`order-1 ml-auto flex flex-col items-center text-center lg:order-2 vizitka-anim-right [animation-delay:260ms] ${compact ? "w-full max-w-[520px] gap-3 lg:mt-1" : "gap-4 lg:-mt-20 xl:-mt-24"}`}>
                <div className="relative">
                  <Image
                    src={lightFullWidth ? "/icons/bohemikalogo.png" : "/icons/bhmkwhite.png"}
                    alt="Bohemika logo"
                    width={420}
                    height={96}
                    className={`premium-online-card-logo ${
                      compact ? "h-auto w-full max-w-[500px]" : "h-[180px] w-auto sm:h-[320px] lg:h-[430px]"
                    } object-contain object-top opacity-95 vizitka-float-soft`}
                  />
                  <div className={`pointer-events-none absolute left-1/2 top-[67.8%] w-[115vw] -translate-x-1/2 items-center gap-6 xl:top-[68.2%] ${compact ? "hidden" : "hidden lg:flex"}`}>
                    <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(196,181,253,0.06)_0%,rgba(216,180,254,0.42)_100%)] vizitka-line-pulse" />
                    <span className="h-px w-[270px] bg-transparent xl:w-[330px]" />
                    <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(216,180,254,0.42)_0%,rgba(196,181,253,0.06)_100%)] vizitka-line-pulse [animation-delay:160ms]" />
                  </div>
                </div>
                {meetingCta ? (
                  <button
                    type="button"
                    onClick={meetingCta.onClick}
                    disabled={meetingCta.disabled || meetingCta.busy}
                    className={`inline-flex items-center justify-center gap-2 rounded-[20px] border border-violet-300/20 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] font-bold text-white shadow-[0_22px_44px_rgba(124,58,237,0.4)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 vizitka-cta-glow ${
                      compact ? "min-w-[220px] px-5 py-2.5 text-base" : "mt-1 min-w-[220px] px-5 py-2.5 text-base sm:-mt-10 sm:min-w-[260px] sm:px-7 sm:py-3 sm:text-lg lg:-mt-12"
                    }`}
                  >
                    <CalendarPlus2 className={compact ? "h-[18px] w-[18px]" : "h-5 w-5"} />
                    {meetingCta.busy ? "Odesílám..." : meetingCtaLabel}
                  </button>
                ) : null}
              </div>
            </div>
          </header>
        ) : (
          <header className="space-y-4 border-b border-slate-200/90 pb-5 pt-4 sm:space-y-5 sm:pb-6 sm:pt-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="inline-flex items-center pl-3 -mt-4 sm:pl-5 sm:-mt-6">
                <Image
                  src="/icons/bhmkwhite.png"
                  alt="Bohemika logo"
                  width={420}
                  height={96}
                  className="h-[220px] w-auto object-contain sm:h-[308px]"
                />
              </div>
              <div className="ml-auto flex min-w-[220px] flex-col items-end gap-2 pt-1 text-right sm:min-w-[300px]">
                {showHeaderCta ? (
                  <button
                    type="button"
                    onClick={meetingCta.onClick}
                    disabled={meetingCta.disabled || meetingCta.busy}
                    className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[linear-gradient(130deg,#0f172a_0%,#1e3a8a_58%,#0891b2_100%)] px-4 py-2 text-xs font-semibold text-white shadow-[0_14px_30px_rgba(30,58,138,0.32)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 vizitka-cta-glow"
                  >
                    <CalendarPlus2 className="h-4 w-4" />
                    {meetingCta.busy ? "Odesílám..." : meetingCtaLabel}
                  </button>
                ) : null}
              </div>
            </div>
            {identityBlock}
          </header>
        )}

        {showContactSection && !fullWidthLayout ? contactSection : null}

        {fullWidthLayout ? (showContactSection ? contactSection : null) : bioSection}
      </div>
    </article>
  );
}
