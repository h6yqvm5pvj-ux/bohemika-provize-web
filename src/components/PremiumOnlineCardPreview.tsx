"use client";

import {
  CalendarPlus2,
  Globe2,
  Mail,
  MapPin,
  PhoneCall,
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
  bio: string;
  location: string;
};

type PremiumOnlineCardPreviewProps = {
  value: PremiumOnlineCardValue;
  editable?: boolean;
  onPatch?: (patch: Partial<PremiumOnlineCardValue>) => void;
  className?: string;
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

const normalizeWebsiteLabel = (value: string): string =>
  value.replace(/^https?:\/\//i, "");

const editableInputClass = "w-full bg-transparent !text-slate-900 placeholder:text-slate-400 outline-none";

type ContactRowProps = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: string;
  placeholder: string;
  onChange?: (value: string) => void;
  editable: boolean;
  href?: string;
};

function ContactRow({
  label,
  icon: Icon,
  value,
  placeholder,
  onChange,
  editable,
  href,
}: ContactRowProps) {
  return (
    <div className="group border-b border-slate-200/75 py-3 transition-colors first:pt-0 last:border-b-0 last:pb-0 sm:py-4">
      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,188px)_minmax(0,1fr)] sm:items-center sm:gap-3">
        <div className="inline-flex items-center gap-2.5 text-slate-500">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 bg-white/85 text-slate-600 transition-colors group-hover:border-slate-300 group-hover:text-slate-900">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </span>
        </div>
        <div className="min-h-[24px] text-[15px] font-semibold leading-tight text-slate-900 sm:text-[16px]">
          {editable ? (
            <input
              type="text"
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              placeholder={placeholder}
              className={editableInputClass}
            />
          ) : value ? (
            href ? (
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noreferrer noopener" : undefined}
                className="underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
              >
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className="text-slate-400">{placeholder}</span>
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
  meetingCta,
}: PremiumOnlineCardPreviewProps) {
  const websiteLink = sanitizeWebsite(value.website);
  const websiteLabel = websiteLink ? normalizeWebsiteLabel(websiteLink) : value.website;
  const phoneLink = value.phone ? normalizePhoneHref(value.phone) : "";
  const meetingCtaLabel = meetingCta?.label?.trim() || "Sjednat schůzku";

  return (
    <article
      className={`${jakarta.className} relative isolate overflow-hidden rounded-[32px] border border-slate-200/85 bg-[linear-gradient(140deg,#f8fcff_0%,#ffffff_44%,#eef6ff_100%)] px-5 py-5 text-slate-900 shadow-[0_28px_80px_rgba(15,23,42,0.09)] sm:px-8 sm:py-8 ${className ?? ""}`}
    >
      <div className="pointer-events-none absolute -left-16 top-[-96px] h-64 w-64 rounded-full bg-cyan-200/42 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-[-110px] h-72 w-72 rounded-full bg-blue-200/42 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_12%,rgba(255,255,255,0.92),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.22)_1px,transparent_1px)] [background-size:52px_52px]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.5),transparent)]" />

      <div className="relative z-10 space-y-6 sm:space-y-8">
        {editable ? (
          <div className="-mx-5 -mt-5 mb-4 sm:-mx-8 sm:-mt-8 sm:mb-5">
            <div className="flex items-center gap-2 border-b border-[#1e293b] bg-[linear-gradient(90deg,#0b1220_0%,#0a1a3f_50%,#0a3356_100%)] px-4 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
              <span className="ml-2 truncate rounded border border-[#31415f] bg-[#1f2937] px-2 py-0.5 text-[10px] font-medium text-[#cbd5e1]">
                Bohemka.App export preview
              </span>
            </div>
          </div>
        ) : null}

        <header className="space-y-4 border-b border-slate-200/90 pb-5 pt-4 sm:space-y-5 sm:pb-6 sm:pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="inline-flex items-center pl-3 -mt-4 sm:pl-5 sm:-mt-6">
              <Image
                src="/icons/bohemikalogo.png"
                alt="Bohemika logo"
                width={420}
                height={96}
                className="h-[220px] w-auto object-contain sm:h-[308px]"
              />
            </div>
            <div className="ml-auto flex min-w-[220px] flex-col items-end gap-2 pt-1 text-right sm:min-w-[300px]">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500 sm:text-[12px]">
                  Bohemika a.s.
                </p>
              </div>
              {meetingCta ? (
                <button
                  type="button"
                  onClick={meetingCta.onClick}
                  disabled={meetingCta.disabled || meetingCta.busy}
                  className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[linear-gradient(130deg,#0f172a_0%,#1e3a8a_58%,#0891b2_100%)] px-4 py-2 text-xs font-semibold text-white shadow-[0_14px_30px_rgba(30,58,138,0.32)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <CalendarPlus2 className="h-4 w-4" />
                  {meetingCta.busy ? "Odesílám..." : meetingCtaLabel}
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {editable ? (
              <input
                type="text"
                value={value.fullName}
                onChange={(event) =>
                  onPatch?.({ fullName: event.target.value.slice(0, 120) })
                }
                placeholder="Jméno a příjmení"
                className="w-full bg-transparent text-[40px] font-extrabold leading-[0.98] tracking-[-0.05em] !text-slate-950 placeholder:text-slate-400 outline-none sm:text-[58px]"
              />
            ) : value.fullName ? (
              <h1 className="text-[40px] font-extrabold leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-[58px]">
                {value.fullName}
              </h1>
            ) : null}

            {editable ? (
              <input
                type="text"
                value={value.title}
                onChange={(event) =>
                  onPatch?.({ title: event.target.value.slice(0, 120) })
                }
                placeholder="Pozice / role"
                className="w-full bg-transparent text-base font-medium !text-slate-600 placeholder:text-slate-400 outline-none sm:text-xl"
              />
            ) : value.title ? (
              <p className="text-base font-medium text-slate-600 sm:text-xl">{value.title}</p>
            ) : null}
          </div>
        </header>

        <section className="space-y-0">
          <ContactRow
            label="Telefon"
            icon={PhoneCall}
            value={value.phone}
            placeholder="+420 777 000 111"
            editable={editable}
            onChange={(next) => onPatch?.({ phone: next.slice(0, 80) })}
            href={!editable && phoneLink ? phoneLink : undefined}
          />
          <ContactRow
            label="E-mail"
            icon={Mail}
            value={value.email}
            placeholder="jmeno@bohemika.eu"
            editable={editable}
            onChange={(next) => onPatch?.({ email: next.slice(0, 160) })}
            href={!editable && value.email ? `mailto:${value.email}` : undefined}
          />
          <ContactRow
            label="Web"
            icon={Globe2}
            value={editable ? value.website : websiteLabel}
            placeholder="https://..."
            editable={editable}
            onChange={(next) => onPatch?.({ website: next.slice(0, 220) })}
            href={!editable && websiteLink ? websiteLink : undefined}
          />
          <ContactRow
            label="Lokalita"
            icon={MapPin}
            value={value.location}
            placeholder="Město"
            editable={editable}
            onChange={(next) => onPatch?.({ location: next.slice(0, 120) })}
          />
        </section>

        <section className="border-t border-slate-200/85 pt-5 sm:pt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            O mně
          </h2>
          {editable ? (
            <textarea
              value={value.bio}
              onChange={(event) => onPatch?.({ bio: event.target.value.slice(0, 1_000) })}
              placeholder="Krátké představení pro veřejnou vizitku."
              className="mt-3 min-h-[130px] w-full resize-y bg-transparent text-sm leading-relaxed !text-slate-800 placeholder:text-slate-400 outline-none sm:text-base"
            />
          ) : value.bio ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:text-base">
              {value.bio}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-400 sm:text-base">Bez doplněného představení.</p>
          )}
        </section>
      </div>
    </article>
  );
}
