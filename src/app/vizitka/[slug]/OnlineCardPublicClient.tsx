"use client";

import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  Globe2,
  Mail,
  MapPin,
  Moon,
  PhoneCall,
  Share2,
  Sun,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdvisorProfileSections } from "@/components/AdvisorProfileSections";
import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";
import {
  PremiumOnlineCardPreview,
  type PremiumOnlineCardValue,
} from "@/components/PremiumOnlineCardPreview";

type OfficePhotoMeta = {
  width: number;
  height: number;
};

type OnlineCardPublicClientProps = {
  slug: string;
  card: PremiumOnlineCardValue;
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
    return "";
  }
};

const normalizeWebsiteLabel = (value: string): string => value.replace(/^https?:\/\//i, "");

const normalizePhoneHref = (value: string): string => {
  const cleaned = value.replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
};

const normalizeMapsAddressQuery = (value: string): string => {
  const cleaned = value
    .replace(/\bbohemika\s*a\.?\s*s\.?\b/giu, "")
    .replace(/[|•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/tyr[sš]ova\s*133/i.test(cleaned) && /kada[nň]/i.test(cleaned)) {
    return "Tyršova 133, 432 01 Kadaň, Česko";
  }

  return cleaned;
};

const escapeVCardValue = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .trim();

const splitFullNameForVCard = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return {
      firstName: parts[0] ?? "",
      lastName: "",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
};

const sanitizeVCardFilename = (value: string): string => {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "kontakt";
};

export default function OnlineCardPublicClient({ slug, card }: OnlineCardPublicClientProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [officePhotoIndex, setOfficePhotoIndex] = useState(0);
  const [officePhotoMetaByUrl, setOfficePhotoMetaByUrl] = useState<Record<string, OfficePhotoMeta>>({});
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const cardWebsiteLink = useMemo(() => sanitizeWebsite(card.website), [card.website]);
  const cardWebsiteLabel = cardWebsiteLink ? normalizeWebsiteLabel(cardWebsiteLink) : card.website.trim();
  const cardPhoneLink = card.phone ? normalizePhoneHref(card.phone) : "";
  const officeLabel = card.officeLabel.trim();
  const officePhotos = card.officePhotos;
  const hasOfficeSection = officeLabel.length > 0 || officePhotos.length > 0;
  const officePhotoCount = officePhotos.length;
  const safeOfficePhotoIndex =
    officePhotoCount > 0 ? Math.min(officePhotoIndex, officePhotoCount - 1) : 0;
  const activeOfficePhoto = officePhotos[safeOfficePhotoIndex] ?? "";
  const activeOfficePhotoMeta = activeOfficePhoto ? officePhotoMetaByUrl[activeOfficePhoto] : null;
  const activeOfficePhotoIsPortrait = activeOfficePhotoMeta
    ? activeOfficePhotoMeta.height > activeOfficePhotoMeta.width * 1.05
    : false;
  const activeOfficePhotoIsLandscape = activeOfficePhotoMeta
    ? activeOfficePhotoMeta.width > activeOfficePhotoMeta.height * 1.05
    : false;
  const officeAddressText = officeLabel || card.location.trim();
  const officeMapsQuery = normalizeMapsAddressQuery(officeAddressText);
  const officeMapsLink = officeAddressText
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(officeMapsQuery)}`
    : "";
  const lightMode = theme === "light";

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;

    const revealItems = Array.from(
      root.querySelectorAll<HTMLElement>("[data-vizitka-reveal]")
    );
    if (revealItems.length === 0) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const pendingItems = revealItems.filter((item) => {
      const rect = item.getBoundingClientRect();
      const alreadyReached = rect.top < viewportHeight * 0.92;
      if (alreadyReached) {
        item.classList.add("is-visible");
        return false;
      }
      item.classList.remove("is-visible");
      return true;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.16,
      }
    );

    pendingItems.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [theme]);

  const openModal = () => {
    setStatus(null);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
  };

  const handleDownloadContactVCard = () => {
    if (typeof document === "undefined" || typeof URL === "undefined") return;

    const fullName = card.fullName.trim();
    const { firstName, lastName } = splitFullNameForVCard(fullName);
    const title = card.title.trim();
    const phone = card.phone.trim();
    const email = card.email.trim();
    const website = cardWebsiteLink || sanitizeWebsite(card.website);
    const address = officeAddressText || card.location.trim();
    const note = card.bio.trim();

    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      fullName ? `FN:${escapeVCardValue(fullName)}` : "",
      fullName
        ? `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`
        : "",
      "ORG:Bohemika a.s.",
      title ? `TITLE:${escapeVCardValue(title)}` : "",
      phone ? `TEL;TYPE=CELL,VOICE:${escapeVCardValue(phone)}` : "",
      email ? `EMAIL;TYPE=INTERNET:${escapeVCardValue(email)}` : "",
      website ? `URL:${escapeVCardValue(website)}` : "",
      address ? `ADR;TYPE=WORK:;;${escapeVCardValue(address)};;;;` : "",
      note ? `NOTE:${escapeVCardValue(note)}` : "",
      "END:VCARD",
    ].filter(Boolean);

    const blob = new Blob([`${lines.join("\r\n")}\r\n`], {
      type: "text/vcard;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${sanitizeVCardFilename(slug || fullName)}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const handleShareOnlineCard = async () => {
    if (typeof window === "undefined") return;

    const shareUrl = window.location.href;
    const shareTitle = card.fullName.trim()
      ? `${card.fullName.trim()} | Bohemika`
      : "Online vizitka Bohemika";
    const shareText = card.title.trim()
      ? `${card.fullName.trim()} - ${card.title.trim()}`
      : card.fullName.trim();

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText || "Online vizitka",
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setStatus({
        type: "success",
        message: "Odkaz na vizitku byl zkopírován do schránky.",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus({
        type: "error",
        message: "Odkaz se nepodařilo sdílet. Zkopírujte ho prosím z adresního řádku.",
      });
    }
  };

  const handleOfficePhotoShift = (direction: 1 | -1) => {
    if (officePhotoCount <= 1) return;
    setOfficePhotoIndex((prev) => (prev + direction + officePhotoCount) % officePhotoCount);
  };

  const handleOfficePhotoLoad = (photoUrl: string, width: number, height: number) => {
    if (!photoUrl || width <= 0 || height <= 0) return;
    setOfficePhotoMetaByUrl((prev) => {
      const current = prev[photoUrl];
      if (current && current.width === width && current.height === height) return prev;
      return {
        ...prev,
        [photoUrl]: { width, height },
      };
    });
  };

  return (
    <>
      <div
        className={`pointer-events-none fixed inset-0 z-0 transition-colors duration-300 ${
          lightMode
            ? "bg-[radial-gradient(circle_at_18%_8%,rgba(124,58,237,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]"
            : "bg-[radial-gradient(circle_at_15%_12%,#271245_0%,#110a21_36%,#080715_72%,#05040f_100%)]"
        }`}
        aria-hidden="true"
      />
      <div
        ref={shellRef}
        className={`online-card-public-shell online-card-theme-${theme} relative z-10 mx-auto max-w-[1160px] overflow-hidden rounded-none border-x-0 border-y transition-colors duration-300 sm:rounded-[38px] sm:border ${
          lightMode
            ? "border-violet-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#faf5ff_48%,#ffffff_100%)] text-slate-950 shadow-[0_30px_90px_rgba(88,28,135,0.16)]"
            : "border-violet-400/22 bg-[linear-gradient(180deg,#10081f_0%,#0f0b22_48%,#080715_100%)] text-white shadow-[0_36px_110px_rgba(5,4,18,0.72)]"
        }`}
      >
        <div className="sticky top-2 z-30 flex flex-wrap justify-end gap-1.5 px-3 pt-3 sm:absolute sm:right-5 sm:top-5 sm:gap-2 sm:px-0 sm:pt-0">
          <button
            type="button"
            onClick={handleShareOnlineCard}
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-700 px-3 py-2 text-xs font-bold text-white shadow-[0_14px_34px_rgba(124,58,237,0.28)] transition hover:bg-violet-800"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="sm:hidden">Sdílet</span>
            <span className="hidden sm:inline">Sdílet vizitku</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadContactVCard}
            className="hidden items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-700 px-3 py-2 text-xs font-bold text-white shadow-[0_14px_34px_rgba(124,58,237,0.28)] transition hover:bg-violet-800 sm:inline-flex"
          >
            <Download className="h-3.5 w-3.5" />
            Uložit kontakt
          </button>
          <div
            className={`inline-flex items-center rounded-full border p-0.5 text-[11px] font-bold shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur sm:p-1 sm:text-xs ${
              lightMode
                ? "border-violet-200 bg-white/90 text-slate-700"
                : "border-white/16 bg-slate-950/42 text-violet-100"
            }`}
            aria-label="Režim zobrazení vizitky"
          >
            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={!lightMode}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 transition sm:gap-1.5 sm:px-3 ${
                !lightMode ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]" : "hover:bg-violet-50"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Tmavý
            </button>
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={lightMode}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 transition sm:gap-1.5 sm:px-3 ${
                lightMode ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]" : "hover:bg-white/10"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              Světlý
            </button>
          </div>
        </div>

        <PremiumOnlineCardPreview
          value={card}
          layout="fullWidth"
          surface="seamless"
          theme={theme}
          showContactSection={false}
          meetingCta={{
            label: "Sjednat schůzku",
            onClick: openModal,
            disabled: false,
          }}
        />

        {status ? (
          <p
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold vizitka-anim-up ${
              status.type === "success"
                ? "border border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                : "border border-rose-300/40 bg-rose-400/15 text-rose-100"
            }`}
          >
            {status.type === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            {status.message}
          </p>
        ) : null}
        <AdvisorProfileSections flush reveal theme={theme} />
        {hasOfficeSection ? (
          <section
            data-vizitka-reveal
            className={`online-card-public-section online-card-scroll-reveal vizitka-anim-up relative overflow-hidden px-4 py-10 sm:px-10 sm:py-16 [animation-delay:680ms] ${
              lightMode
                ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(250,245,255,0.94)_100%)]"
                : "bg-[linear-gradient(180deg,rgba(10,8,24,0.99)_0%,rgba(13,10,29,0.99)_100%)]"
            }`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(124,58,237,0.12),transparent_34%)]" />
            <div
              className={`relative z-10 mx-auto grid max-w-[1040px] gap-5 lg:items-start ${
                activeOfficePhotoIsPortrait
                  ? "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
                  : "lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]"
              }`}
            >
              <div className="space-y-3">
                {activeOfficePhoto ? (
                  <div
                    className={`mx-auto w-full ${
                      activeOfficePhotoIsPortrait
                        ? "max-w-[390px]"
                        : activeOfficePhotoIsLandscape
                          ? "max-w-none"
                          : "max-w-[620px]"
                    }`}
                  >
                    <div
                      className={`relative overflow-hidden rounded-2xl border border-white/14 bg-[radial-gradient(circle_at_15%_10%,rgba(129,140,248,0.18),rgba(2,6,23,0.65)_55%)] ${
                        activeOfficePhotoIsPortrait
                          ? "h-[330px] sm:h-[430px] lg:h-[500px]"
                          : activeOfficePhotoIsLandscape
                            ? "h-[230px] sm:h-[320px] lg:h-[400px]"
                            : "h-[260px] sm:h-[360px] lg:h-[430px]"
                      }`}
                    >
                      <Image
                        src={activeOfficePhoto}
                        alt={`Fotka kanceláře ${safeOfficePhotoIndex + 1}`}
                        fill
                        sizes={
                          activeOfficePhotoIsPortrait
                            ? "(min-width: 1024px) 390px, 100vw"
                            : "(min-width: 1024px) 680px, 100vw"
                        }
                        unoptimized
                        onLoadingComplete={(image) =>
                          handleOfficePhotoLoad(
                            activeOfficePhoto,
                            image.naturalWidth,
                            image.naturalHeight
                          )
                        }
                        className="object-contain"
                      />
                      {officePhotoCount > 1 ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOfficePhotoShift(-1)}
                            className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-slate-950/45 text-white transition hover:bg-slate-950/65"
                            aria-label="Předchozí fotka kanceláře"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOfficePhotoShift(1)}
                            className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-slate-950/45 text-white transition hover:bg-slate-950/65"
                            aria-label="Další fotka kanceláře"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[230px] items-center justify-center rounded-2xl border border-white/14 bg-slate-950/45 text-center text-xs text-violet-100/70 sm:h-[320px] lg:h-[360px]">
                    Bez nahraných fotek kanceláře.
                  </div>
                )}

                {officePhotoCount > 1 ? (
                  <div className="flex justify-center gap-1.5">
                    {officePhotos.map((photoUrl, index) => (
                      <button
                        key={photoUrl}
                        type="button"
                        onClick={() => setOfficePhotoIndex(index)}
                        className={`h-2.5 rounded-full transition ${
                          index === safeOfficePhotoIndex ? "w-6 bg-violet-200" : "w-2.5 bg-white/35 hover:bg-white/60"
                        }`}
                        aria-label={`Zobrazit fotku kanceláře ${index + 1}`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex items-start">
                <div className="w-full max-w-[580px] space-y-4 border-l border-violet-300/18 pl-5 sm:pl-6">
                  <p className="inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.05] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100">
                    <Building2 className="h-3.5 w-3.5" />
                    Kancelář
                  </p>

                  {officeAddressText ? (
                    <p className="max-w-[46ch] text-base font-semibold leading-snug text-white/92 sm:text-lg">
                      {officeAddressText}
                    </p>
                  ) : (
                    <p className="text-sm text-violet-100/70">Adresa kanceláře není vyplněná.</p>
                  )}

                  {officeMapsLink ? (
                    <a
                      href={officeMapsLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
                    >
                      <MapPin className="h-4 w-4" />
                      Otevřít v Google mapách
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}
        <section
          data-vizitka-reveal
          className={`online-card-public-section online-card-scroll-reveal relative overflow-hidden px-4 py-10 sm:px-10 sm:py-16 vizitka-anim-up [animation-delay:720ms] ${
            lightMode
              ? "bg-[linear-gradient(180deg,rgba(250,245,255,0.94)_0%,rgba(255,255,255,0.98)_100%)]"
              : "bg-[linear-gradient(180deg,rgba(13,10,29,0.99)_0%,rgba(8,7,18,0.99)_100%)]"
          }`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(124,58,237,0.1),transparent_44%)]" />
          <div className="relative z-10 space-y-5">
            <div className="text-center">
              <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.05] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100">
                <Mail className="h-3.5 w-3.5" />
                Kontakt
              </p>
            </div>

            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {[
                {
                  key: "phone",
                  label: "Telefon",
                  icon: PhoneCall,
                  value: card.phone.trim(),
                  href: cardPhoneLink || undefined,
                },
                {
                  key: "email",
                  label: "E-mail",
                  icon: Mail,
                  value: card.email.trim(),
                  href: card.email.trim() ? `mailto:${card.email.trim()}` : undefined,
                },
                {
                  key: "web",
                  label: "Web",
                  icon: Globe2,
                  value: cardWebsiteLabel,
                  href: cardWebsiteLink || undefined,
                },
                {
                  key: "ico",
                  label: "IČO",
                  icon: Building2,
                  value: card.ico.trim(),
                },
                {
                  key: "location",
                  label: "Lokalita",
                  icon: MapPin,
                  value: card.location.trim(),
                },
              ].map((item) => (
                <div key={item.key} className="group space-y-2">
                  <div className="inline-flex items-center gap-2.5 text-violet-200/75">
                    <span className="relative inline-flex h-8 w-7 items-center justify-center text-violet-100">
                      <item.icon
                        className="h-[18px] w-[18px] drop-shadow-[0_8px_18px_rgba(196,181,253,0.2)] transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-110 group-hover:text-white"
                        strokeWidth={1.9}
                      />
                      <span
                        className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-violet-300/75 opacity-70 shadow-[0_0_14px_rgba(196,181,253,0.5)] transition duration-300 group-hover:left-0 group-hover:right-0 group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/75">
                      {item.label}
                    </span>
                  </div>

                  <div className="min-h-[28px] break-words pl-[42px] text-[18px] font-semibold leading-tight text-white/92 sm:text-[22px]">
                    {item.value ? (
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
                      <span className="text-white/35">Nevyplněno</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleDownloadContactVCard}
                className="inline-flex w-full items-center justify-center rounded-[18px] border border-violet-300/25 bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-[0_18px_42px_rgba(124,58,237,0.34)] transition hover:bg-violet-800 sm:w-auto"
              >
                Uložit do kontaktů
              </button>
            </div>
          </div>
        </section>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/66 p-2 backdrop-blur-md sm:items-center sm:p-4 vizitka-anim-up">
          <div className="w-full max-w-xl rounded-[28px] border border-violet-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.24),transparent_34%),linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 text-white shadow-[0_34px_90px_rgba(7,6,25,0.7),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6 vizitka-anim-up [animation-delay:60ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                  Sjednat schůzku
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-[-0.02em] text-white">
                  Domluvte si termín
                </h2>
                <p className="mt-1 text-sm text-violet-100/75">
                  Vyplňte kontakt a zprávu. V nejbližší době vás budu kontaktovat.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-violet-100 transition hover:bg-white/18"
                aria-label="Zavřít formulář"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <OnlineCardMeetingStepper
              slug={slug}
              onSubmitted={() => {
                setStatus({
                  type: "success",
                  message: "Žádost byla odeslána. Brzy se ti ozveme.",
                });
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
