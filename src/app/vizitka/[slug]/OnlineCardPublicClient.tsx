"use client";

import {
  Building2,
  CalendarDays,
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
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { AdvisorProfileSections } from "@/components/AdvisorProfileSections";
import { OnlineCardTestimonials } from "@/components/OnlineCardTestimonials";
import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";
import {
  PremiumOnlineCardPreview,
  type PremiumOnlineCardValue,
} from "@/components/PremiumOnlineCardPreview";
import {
  ONLINE_CARD_COPY,
  ONLINE_CARD_LANGUAGE_OPTIONS,
  onlineCardLanguageMeta,
  type OnlineCardLocale,
} from "@/lib/onlineCardI18n";
import type { OnlineCardAnalyticsEvent } from "@/lib/onlineCardAnalytics";
import { getOnlineCardHeroArtwork } from "@/lib/onlineCardHeroArtwork";

type OfficePhotoMeta = {
  width: number;
  height: number;
};

type OnlineCardPublicClientProps = {
  slug: string;
  card: PremiumOnlineCardValue;
  initialLocale: OnlineCardLocale;
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

function trackOnlineCardEvent(slug: string, event: OnlineCardAnalyticsEvent) {
  if (!slug || typeof window === "undefined") return;

  void fetch("/api/online-card/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, event }),
    keepalive: true,
  }).catch(() => {
    // Tracking is optional and must never affect the public card flow.
  });
}

export default function OnlineCardPublicClient({
  slug,
  card,
  initialLocale,
}: OnlineCardPublicClientProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [locale, setLocale] = useState<OnlineCardLocale>(initialLocale);
  const [officePhotoIndex, setOfficePhotoIndex] = useState(0);
  const [officePhotoMetaByUrl, setOfficePhotoMetaByUrl] = useState<Record<string, OfficePhotoMeta>>({});
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const copy = ONLINE_CARD_COPY[locale];
  const localizedCard = useMemo(() => {
    const translation = locale === "cs" ? null : card.translations?.[locale];
    return {
      ...card,
      title: translation?.title || card.title,
      bio: translation?.bio || card.bio,
      location: translation?.location || card.location,
      officeLabel: translation?.officeLabel || card.officeLabel,
    };
  }, [card, locale]);
  const cardWebsiteLink = useMemo(
    () => sanitizeWebsite(localizedCard.website),
    [localizedCard.website]
  );
  const cardWebsiteLabel = cardWebsiteLink ? normalizeWebsiteLabel(cardWebsiteLink) : localizedCard.website.trim();
  const cardPhoneLink = localizedCard.phone ? normalizePhoneHref(localizedCard.phone) : "";
  const heroArtwork = getOnlineCardHeroArtwork({
    slug,
    email: localizedCard.email,
    fullName: localizedCard.fullName,
  });
  const officeLabel = localizedCard.officeLabel.trim();
  const officePhotos = localizedCard.officePhotos;
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
  const officeAddressText = officeLabel || localizedCard.location.trim();
  const officeMapsQuery = normalizeMapsAddressQuery(officeAddressText);
  const officeMapsLink = officeAddressText
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(officeMapsQuery)}`
    : "";
  const lightMode = theme === "light";
  const contactItems = [
    {
      key: "phone",
      label: copy.preview.phone,
      icon: PhoneCall,
      value: localizedCard.phone.trim(),
      href: cardPhoneLink || undefined,
      analyticsEvent: "phone_click" as const,
    },
    {
      key: "email",
      label: copy.meeting.email,
      icon: Mail,
      value: localizedCard.email.trim(),
      href: localizedCard.email.trim() ? `mailto:${localizedCard.email.trim()}` : undefined,
      analyticsEvent: "email_click" as const,
    },
    {
      key: "web",
      label: copy.preview.website,
      icon: Globe2,
      value: cardWebsiteLabel,
      href: cardWebsiteLink || undefined,
      analyticsEvent: "website_click" as const,
    },
    {
      key: "ico",
      label: copy.preview.companyId,
      icon: Building2,
      value: localizedCard.ico.trim(),
      analyticsEvent: undefined,
    },
    {
      key: "location",
      label: copy.preview.location,
      icon: MapPin,
      value: localizedCard.location.trim(),
      analyticsEvent: undefined,
    },
  ];

  useEffect(() => {
    document.documentElement.lang = onlineCardLanguageMeta(locale).htmlLang;
  }, [locale]);

  useEffect(() => {
    const visitKey = `online-card:visit:${slug}`;
    try {
      if (window.sessionStorage.getItem(visitKey)) return;
      window.sessionStorage.setItem(visitKey, "1");
    } catch {
      // A strict browser mode may disable session storage; recording a single page load is still safe.
    }
    trackOnlineCardEvent(slug, "visit");
  }, [slug]);

  const selectLocale = (nextLocale: OnlineCardLocale) => {
    setLocale(nextLocale);
    const url = new URL(window.location.href);
    if (nextLocale === "cs") {
      url.searchParams.delete("lang");
    } else {
      url.searchParams.set("lang", nextLocale);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

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

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;

    const updateScrollProgress = () => {
      const documentElement = document.documentElement;
      const maxScroll = Math.max(documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      root.style.setProperty("--online-card-scroll-progress", progress.toFixed(4));
    };

    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    window.addEventListener("resize", updateScrollProgress);
    return () => {
      window.removeEventListener("scroll", updateScrollProgress);
      window.removeEventListener("resize", updateScrollProgress);
    };
  }, []);

  const openModal = () => {
    setStatus(null);
    setOpen(true);
    trackOnlineCardEvent(slug, "meeting_open");
  };

  const closeModal = () => {
    setOpen(false);
  };

  const handleDownloadContactVCard = () => {
    if (typeof document === "undefined" || typeof URL === "undefined") return;

    const fullName = localizedCard.fullName.trim();
    const { firstName, lastName } = splitFullNameForVCard(fullName);
    const title = localizedCard.title.trim();
    const phone = localizedCard.phone.trim();
    const email = localizedCard.email.trim();
    const website = cardWebsiteLink || sanitizeWebsite(localizedCard.website);
    const address = officeAddressText || localizedCard.location.trim();
    const note = localizedCard.bio.trim();

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
    trackOnlineCardEvent(slug, "vcard_download");
  };

  const handleShareOnlineCard = async () => {
    if (typeof window === "undefined") return;

    const shareUrl = window.location.href;
    const shareTitle = localizedCard.fullName.trim()
      ? `${localizedCard.fullName.trim()} | Bohemika`
      : copy.public.onlineCardTitle;
    const shareText = localizedCard.title.trim()
      ? `${localizedCard.fullName.trim()} - ${localizedCard.title.trim()}`
      : localizedCard.fullName.trim();

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText || copy.public.onlineCardTitle,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setStatus({
        type: "success",
        message: copy.public.shareSuccess,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus({
        type: "error",
        message: copy.public.shareError,
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

  const handleShellPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const root = event.currentTarget;
    const x = Math.round((event.clientX / Math.max(window.innerWidth, 1)) * 100);
    const y = Math.round((event.clientY / Math.max(window.innerHeight, 1)) * 100);
    root.style.setProperty("--online-card-pointer-x", `${x}%`);
    root.style.setProperty("--online-card-pointer-y", `${y}%`);
  };

  const resetShellPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--online-card-pointer-x", "50%");
    event.currentTarget.style.setProperty("--online-card-pointer-y", "28%");
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
        onPointerMove={handleShellPointerMove}
        onPointerLeave={resetShellPointer}
        className={`online-card-public-shell online-card-theme-${theme} relative z-10 w-full overflow-hidden transition-colors duration-300 ${
          lightMode
            ? "bg-[linear-gradient(180deg,#ffffff_0%,#faf5ff_48%,#ffffff_100%)] text-slate-950"
            : "bg-[linear-gradient(180deg,#10081f_0%,#0f0b22_48%,#080715_100%)] text-white"
        }`}
      >
        <div className="online-card-pointer-glow" aria-hidden="true" />
        <div className="online-card-scroll-progress" aria-hidden="true" />
        <div className="sticky top-2 z-30 flex flex-wrap justify-end gap-1.5 px-3 pt-3 sm:absolute sm:right-5 sm:top-5 sm:gap-2 sm:px-0 sm:pt-0">
          <button
            type="button"
            onClick={handleShareOnlineCard}
            className="online-card-action inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-700 px-3 py-2 text-xs font-bold text-white shadow-[0_14px_34px_rgba(124,58,237,0.28)] transition hover:bg-violet-800"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="sm:hidden">{copy.public.shareShort}</span>
            <span className="hidden sm:inline">{copy.public.share}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadContactVCard}
            className="online-card-action hidden items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-700 px-3 py-2 text-xs font-bold text-white shadow-[0_14px_34px_rgba(124,58,237,0.28)] transition hover:bg-violet-800 sm:inline-flex"
          >
            <Download className="h-3.5 w-3.5" />
            {copy.public.saveContact}
          </button>
          <div
            className={`inline-flex items-center rounded-full border p-0.5 text-[11px] font-bold shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur sm:p-1 sm:text-xs ${
              lightMode
                ? "border-violet-200 bg-white/90 text-slate-700"
                : "border-white/16 bg-slate-950/42 text-violet-100"
            }`}
            aria-label={copy.public.displayMode}
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
              {copy.public.dark}
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
              {copy.public.light}
            </button>
          </div>
          <div
            className={`inline-flex items-center rounded-full border p-0.5 text-[11px] font-bold shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur sm:p-1 sm:text-xs ${
              lightMode
                ? "border-violet-200 bg-white/90 text-slate-700"
                : "border-white/16 bg-slate-950/42 text-violet-100"
            }`}
            aria-label={copy.public.language}
          >
            {ONLINE_CARD_LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => selectLocale(option.id)}
                aria-pressed={locale === option.id}
                aria-label={option.label}
                className={`rounded-full px-2.5 py-1.5 transition sm:px-3 ${
                  locale === option.id
                    ? "bg-violet-700 text-white shadow-[0_8px_22px_rgba(124,58,237,0.34)]"
                    : "hover:bg-white/10"
                }`}
              >
                {option.shortLabel}
              </button>
            ))}
          </div>
        </div>

        <PremiumOnlineCardPreview
          value={localizedCard}
          layout="fullWidth"
          surface="seamless"
          theme={theme}
          locale={locale}
          showContactSection={false}
          heroArtwork={heroArtwork}
          meetingCta={{
            label: copy.preview.scheduleMeeting,
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
        <AdvisorProfileSections
          flush
          reveal
          connectToHero
          theme={theme}
          locale={locale}
          onScheduleMeeting={openModal}
        />
        <OnlineCardTestimonials
          slug={slug}
          testimonials={localizedCard.testimonials}
          locale={locale}
          theme={theme}
          reveal
          mode="showcase"
        />
        {hasOfficeSection ? (
          <section
            data-vizitka-reveal
            className={`online-card-public-section online-card-scroll-reveal vizitka-anim-up relative overflow-hidden px-4 ${
              activeOfficePhoto ? "py-10 sm:px-10 sm:py-16" : "py-8 sm:px-10 sm:py-12"
            } [animation-delay:680ms] ${
              lightMode
                ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(250,245,255,0.94)_100%)]"
                : "bg-[linear-gradient(180deg,rgba(10,8,24,0.99)_0%,rgba(13,10,29,0.99)_100%)]"
            }`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(124,58,237,0.12),transparent_34%)]" />
            <div
              className={`relative z-10 mx-auto gap-5 ${
                activeOfficePhoto
                  ? `grid max-w-[1040px] lg:items-start ${
                      activeOfficePhotoIsPortrait
                        ? "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
                        : "lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]"
                    }`
                  : "max-w-xl"
              }`}
            >
              {activeOfficePhoto ? (
                <div className="space-y-3">
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
                        alt={`${copy.public.office} ${safeOfficePhotoIndex + 1}`}
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
                            aria-label={copy.public.previousOfficePhoto}
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOfficePhotoShift(1)}
                            className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-slate-950/45 text-white transition hover:bg-slate-950/65"
                            aria-label={copy.public.nextOfficePhoto}
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

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
                        aria-label={`${copy.public.showOfficePhoto} ${index + 1}`}
                      />
                    ))}
                  </div>
                ) : null}
                </div>
              ) : null}

              <div className={activeOfficePhoto ? "flex items-start" : "flex justify-center text-center"}>
                <div
                  className={`w-full max-w-[580px] space-y-4 ${
                    activeOfficePhoto
                      ? "border-l border-violet-300/18 pl-5 sm:pl-6"
                      : "mx-auto"
                  }`}
                >
                  {!activeOfficePhoto ? (
                    <Building2 className="mx-auto h-10 w-10 text-violet-200/75 vizitka-float-soft" strokeWidth={1.45} />
                  ) : null}
                  <p className={`inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.05] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100 ${
                    activeOfficePhoto ? "" : "mx-auto"
                  }`}>
                    <Building2 className="h-3.5 w-3.5" />
                    {copy.public.office}
                  </p>

                  {officeAddressText ? (
                    <p className={`max-w-[46ch] text-base font-semibold leading-snug text-white/92 sm:text-lg ${
                      activeOfficePhoto ? "" : "mx-auto"
                    }`}>
                      {officeAddressText}
                    </p>
                  ) : (
                    <p className="text-sm text-violet-100/70">{copy.public.noOfficeAddress}</p>
                  )}

                  {officeMapsLink ? (
                    <a
                      href={officeMapsLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={() => trackOnlineCardEvent(slug, "map_click")}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
                    >
                      <MapPin className="h-4 w-4" />
                      {copy.public.openMaps}
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
          <div className="relative z-10 mx-auto max-w-[1680px]">
            <div className="text-center">
              <p
                className={`mx-auto inline-flex items-center gap-2 rounded-full border px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                  lightMode
                    ? "border-violet-300/55 bg-violet-50 text-violet-800"
                    : "border-violet-300/35 bg-white/[0.05] text-violet-100"
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                {copy.public.contact}
              </p>
            </div>

            <div
              className={`mt-7 grid gap-x-0 gap-y-7 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)_minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,.85fr)] xl:divide-x ${
                lightMode ? "xl:divide-violet-200" : "xl:divide-white/[0.09]"
              }`}
            >
              {contactItems.map((item) => (
                <div
                  key={item.key}
                  className="group min-w-0 px-1 text-center transition duration-300 sm:px-5"
                >
                  <div className="flex items-center justify-center gap-2.5">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center transition duration-300 group-hover:-translate-y-0.5 ${
                        lightMode
                          ? "text-violet-700 group-hover:text-violet-950"
                          : "text-violet-200 group-hover:text-white"
                      }`}
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${lightMode ? "text-violet-700/70" : "text-violet-200/75"}`}>
                      {item.label}
                    </span>
                  </div>

                  <div className={`mt-3 break-words text-base font-semibold leading-snug sm:text-lg ${lightMode ? "text-slate-900" : "text-white/92"}`}>
                    {item.value ? (
                      item.href ? (
                        <a
                          href={item.href}
                          target={item.href.startsWith("http") ? "_blank" : undefined}
                          rel={item.href.startsWith("http") ? "noreferrer noopener" : undefined}
                          onClick={() => {
                            if (item.analyticsEvent) {
                              trackOnlineCardEvent(slug, item.analyticsEvent);
                            }
                          }}
                          className="underline decoration-violet-300/45 underline-offset-4 transition hover:decoration-violet-500"
                        >
                          {item.value}
                        </a>
                      ) : (
                        item.value
                      )
                    ) : (
                      <span className={lightMode ? "text-slate-400" : "text-white/35"}>{copy.public.notFilled}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-center pt-6">
              <button
                type="button"
                onClick={handleDownloadContactVCard}
                className="online-card-action inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-violet-300/25 bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-[0_18px_42px_rgba(124,58,237,0.34)] transition hover:-translate-y-0.5 hover:bg-violet-800 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                {copy.public.saveContact}
              </button>
            </div>
          </div>
        </section>
        <OnlineCardTestimonials
          slug={slug}
          testimonials={localizedCard.testimonials}
          locale={locale}
          theme={theme}
          reveal
          mode="submission"
        />
      </div>

      {open ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[#070512]/74 p-2 backdrop-blur-xl sm:items-center sm:p-4 vizitka-anim-up">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-violet-300/25 bg-[#120a25] p-4 text-white shadow-[0_34px_100px_rgba(7,6,25,0.76),inset_0_1px_0_rgba(221,214,254,0.16)] sm:p-6 vizitka-anim-up [animation-delay:60ms]">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/25 blur-[90px]" />
            <div className="pointer-events-none absolute -bottom-32 left-1/4 h-48 w-80 rounded-full bg-indigo-500/10 blur-[80px]" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200/25 bg-violet-400/15 text-violet-100 shadow-[0_10px_24px_rgba(124,58,237,0.28)]">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-200/80">
                    {copy.public.scheduleKicker}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold tracking-[-0.035em] text-white">
                    {copy.public.scheduleTitle}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-violet-100/70">
                    {copy.public.scheduleDescription}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-violet-100 transition hover:rotate-90 hover:bg-white/[0.14]"
                aria-label={copy.public.closeForm}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <OnlineCardMeetingStepper
              slug={slug}
              locale={locale}
              onSubmitted={() => {
                setStatus({
                  type: "success",
                  message: copy.public.submitted,
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
