"use client";

import {
  ArrowDown,
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
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
import { OnlineCardTestimonials } from "@/components/OnlineCardTestimonials";
import { OnlineCardMeetingStepper } from "@/components/OnlineCardMeetingStepper";
import { OnlineCardHeroVisual } from "@/components/OnlineCardHeroVisual";
import type { PremiumOnlineCardValue } from "@/components/PremiumOnlineCardPreview";
import styles from "@/components/OnlineCardMinimal.module.css";
import {
  ONLINE_CARD_COPY,
  ONLINE_CARD_LANGUAGE_OPTIONS,
  onlineCardLanguageMeta,
  type OnlineCardLocale,
} from "@/lib/onlineCardI18n";
import { trackOnlineCardEvent, trackOnlineCardVisit } from "@/lib/onlineCardTracking";
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

export default function OnlineCardPublicClient({
  slug,
  card,
  initialLocale,
}: OnlineCardPublicClientProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");
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
    void trackOnlineCardVisit(slug);
  }, [slug]);

  useEffect(() => {
    if (officePhotos.length < 2) return;

    const preloadId = window.setTimeout(() => {
      officePhotos.forEach((photoUrl) => {
        if (!photoUrl || photoUrl === activeOfficePhoto) return;
        const image = new window.Image();
        image.decoding = "async";
        image.src = photoUrl;
      });
    }, 250);

    return () => window.clearTimeout(preloadId);
  }, [activeOfficePhoto, officePhotos]);

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
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="hidden"]):not([tabindex="-1"]), textarea, a[href]') ?? []).filter(element => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

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

  const nameParts = localizedCard.fullName.trim().split(/\s+/);
  const givenName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : localizedCard.fullName;
  const surname = nameParts.length > 1 ? nameParts.at(-1) : "";
  const bioParagraphs = localizedCard.bio.trim().split(/\n\s*\n/).filter(Boolean);

  return (
    <>
      <div className={styles.shell} data-theme={theme}>
        <header className={styles.nav}>
          <div className={[styles.container, styles.navInner].join(" ")}>
            <a href="#profile" className={styles.brand} aria-label="Bohemika">
              <span className={styles.brandEmblem} aria-hidden="true"><Image src="/icons/bohemikalogo.png" alt="" width={146} height={146} priority /></span>
              <span className={styles.brandLogo}>
                <Image src={lightMode ? "/icons/bohemikalogo.png" : "/icons/bhmkwhite.png"} alt="Bohemika" width={168} height={168} priority />
              </span>
            </a>
            <nav className={styles.navLinks} aria-label={copy.public.onlineCardTitle}>
              <a href="#services">{copy.advisor.serviceKicker}</a>
              <a href="#company">{copy.advisor.aboutKicker}</a>
              <a href="#contact" className={styles.navContact}>{copy.public.contact}<ArrowUpRight aria-hidden="true" /></a>
            </nav>
            <div className={styles.navTools}>
              <button type="button" onClick={handleShareOnlineCard} className={styles.iconButton} aria-label={copy.public.share} title={copy.public.share}>
                <Share2 aria-hidden="true" />
              </button>
              <button type="button" onClick={handleDownloadContactVCard} className={[styles.iconButton, styles.desktopControl].join(" ")} aria-label={copy.public.saveContact} title={copy.public.saveContact}>
                <Download aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setTheme(lightMode ? "dark" : "light")} className={styles.iconButton} aria-label={lightMode ? copy.public.dark : copy.public.light} title={lightMode ? copy.public.dark : copy.public.light}>
                {lightMode ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
              </button>
              <select className={styles.language} value={locale} onChange={event => selectLocale(event.target.value as OnlineCardLocale)} aria-label={copy.public.language}>
                {ONLINE_CARD_LANGUAGE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.shortLabel}</option>)}
              </select>
            </div>
          </div>
        </header>

        <section id="profile" className={styles.hero} aria-labelledby="card-name">
          <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div className={styles.heroIdentity}>
              <div className={styles.heroTopline}>
                <p className={styles.eyebrow}>{copy.preview.advisorProfile}</p>
                {localizedCard.title ? <p className={styles.role}>{localizedCard.title}</p> : null}
              </div>
              <h1 id="card-name" className={styles.name}>{givenName}{surname ? <> <span className={styles.surname}>{surname}</span></> : null}</h1>
              <p className={styles.heroBio}>{bioParagraphs[0] || copy.preview.noBio}</p>
              <div className={styles.actions}>
                <button type="button" className={styles.primaryButton} onClick={openModal}>{copy.preview.scheduleMeeting}<ArrowUpRight aria-hidden="true" /></button>
                <button type="button" className={styles.heroSaveButton} onClick={handleDownloadContactVCard}><Download aria-hidden="true" />{copy.public.saveContact}</button>
              </div>
            </div>
            <OnlineCardHeroVisual artwork={heroArtwork} location={localizedCard.location} promise={copy.advisor.pillars[0][0]} />
          </div>
          <div className={styles.heroFoot}>
            <a href="#services" className={styles.exploreLink}>{copy.advisor.serviceKicker}<span><ArrowDown aria-hidden="true" /></span></a>
          </div>
          </div>
        </section>

        {bioParagraphs.length > 1 ? <section className={[styles.container, styles.personalIntro].join(" ")} aria-labelledby="card-about-title">
          <div>
            <h2 id="card-about-title" className={styles.eyebrow}>{copy.preview.about}</h2>
            <p className={styles.introStatement}>{bioParagraphs[1]}</p>
          </div>
          <div className={styles.introBody}>
            {bioParagraphs.slice(2).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </section> : null}

        {status ? (
          <p className={styles.status} role="status" data-error={status.type === "error"}>
            {status.message}
          </p>
        ) : null}

        <AdvisorProfileSections
          minimal
          theme={theme}
          locale={locale}
          onScheduleMeeting={openModal}
          goldPageHref={"/vizitka/" + slug + "/zlato"}
          lifeInsurancePageHref={"/vizitka/" + slug + "/zivotni-pojisteni"}
          vehicleInsurancePageHref={"/vizitka/" + slug + "/pojisteni-vozidla"}
          travelInsurancePageHref={"/vizitka/" + slug + "/cestovni-pojisteni"}
          useMetalVig
        />
        <OnlineCardTestimonials slug={slug} testimonials={localizedCard.testimonials} locale={locale} theme={theme} mode="showcase" minimal />

        {hasOfficeSection ? (
          <section className={styles.section} aria-labelledby="card-office-title">
            <div className={[styles.container, activeOfficePhoto ? styles.officeGrid : ""].join(" ")}>
              {activeOfficePhoto ? (
                <div>
                  <div className={[styles.officePhoto, activeOfficePhotoIsPortrait ? styles.officePortrait : ""].join(" ")}>
                    <Image
                      src={activeOfficePhoto}
                      alt={copy.public.office + " " + (safeOfficePhotoIndex + 1)}
                      fill
                      sizes="(max-width: 760px) calc(100vw - 40px), 600px"
                      unoptimized
                      onLoad={event => handleOfficePhotoLoad(activeOfficePhoto, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                    />
                  </div>
                  <div className={styles.photoTools}>
                    <span className={styles.photoCount}>{String(safeOfficePhotoIndex + 1).padStart(2, "0")} / {String(officePhotoCount).padStart(2, "0")}</span>
                    {officePhotoCount > 1 ? (
                      <>
                        <div className={styles.photoDots}>
                          {officePhotos.map((url, index) => (
                            <button key={url} type="button" onClick={() => setOfficePhotoIndex(index)} aria-pressed={index === safeOfficePhotoIndex} aria-label={copy.public.showOfficePhoto + " " + (index + 1)} />
                          ))}
                        </div>
                        <div>
                          <button type="button" onClick={() => handleOfficePhotoShift(-1)} className={styles.iconButton} aria-label={copy.public.previousOfficePhoto}><ChevronLeft /></button>
                          <button type="button" onClick={() => handleOfficePhotoShift(1)} className={styles.iconButton} aria-label={copy.public.nextOfficePhoto}><ChevronRight /></button>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className={styles.officeCopy}>
                <p className={styles.eyebrow}>{copy.public.office}</p>
                <h2 id="card-office-title" className={styles.heading}>{copy.public.officeWelcome}</h2>
                <p className={styles.address}><MapPin aria-hidden="true" /><span>{officeAddressText || copy.public.noOfficeAddress}</span></p>
                <div className={styles.actions}>
                  <button type="button" onClick={openModal} className={styles.primaryButton}>{copy.preview.scheduleMeeting}<ArrowUpRight aria-hidden="true" /></button>
                  {officeMapsLink ? <a href={officeMapsLink} target="_blank" rel="noreferrer noopener" onClick={() => trackOnlineCardEvent(slug, "map_click")} className={styles.textLink}>{copy.public.openMaps}<ArrowUpRight aria-hidden="true" /></a> : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section id="contact" className={[styles.section, styles.contactSection].join(" ")} aria-labelledby="card-contact-title">
          <div className={styles.container}>
            <div className={styles.contactHead}>
              <div>
                <p className={styles.eyebrow}>{copy.public.contact}</p>
                <h2 id="card-contact-title" className={styles.heading}>{copy.public.scheduleTitle}</h2>
              </div>
              <button type="button" onClick={openModal} className={styles.primaryButton}>{copy.preview.scheduleMeeting}<ArrowUpRight aria-hidden="true" /></button>
            </div>
            <dl className={styles.contactGrid}>
              {contactItems.map(item => (
                <div key={item.key} className={styles.contactItem}>
                  <dt><item.icon aria-hidden="true" />{item.label}</dt>
                  <dd>{item.value ? item.href ? (
                    <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel={item.href.startsWith("http") ? "noreferrer noopener" : undefined} onClick={() => { if (item.analyticsEvent) trackOnlineCardEvent(slug, item.analyticsEvent); }}>{item.value}</a>
                  ) : item.value : copy.public.notFilled}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.contactFooter}>
              <button type="button" onClick={handleDownloadContactVCard} className={styles.textLink}><Download aria-hidden="true" />{copy.public.saveContact}</button>
              <button type="button" onClick={handleShareOnlineCard} className={styles.textLink}><Share2 aria-hidden="true" />{copy.public.share}</button>
            </div>
          </div>
        </section>
        <OnlineCardTestimonials slug={slug} testimonials={localizedCard.testimonials} locale={locale} theme={theme} mode="submission" minimal />

        <footer className={styles.footer}>
          <div className={[styles.container, styles.footerInner].join(" ")}>
            <a href="#profile" className={styles.brand} aria-label="Bohemika">
              <span className={styles.brandLogo}><Image src={lightMode ? "/icons/bohemikalogo.png" : "/icons/bhmkwhite.png"} alt="Bohemika" width={168} height={168} /></span>
            </a>
            <span>{localizedCard.fullName} · Bohemika a.s.</span>
            <a href="#profile" className={styles.iconButton} aria-label={copy.preview.advisorProfile}><ArrowUpRight aria-hidden="true" /></a>
          </div>
        </footer>
      </div>

      {open ? (
        <div className={styles.overlay} onClick={event => { if (event.target === event.currentTarget) closeModal(); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="card-meeting-title" className={styles.dialog} data-theme={theme}>
            <div className={styles.dialogHeader}>
              <div>
                <p className={styles.eyebrow}>{copy.public.scheduleKicker}</p>
                <h2 id="card-meeting-title">{copy.public.scheduleTitle}</h2>
                <p>{copy.public.scheduleDescription}</p>
              </div>
              <button type="button" onClick={closeModal} className={styles.iconButton} aria-label={copy.public.closeForm}><X aria-hidden="true" /></button>
            </div>
            <OnlineCardMeetingStepper
              slug={slug}
              locale={locale}
              onSubmitted={() => {
                setStatus({ type: "success", message: copy.public.submitted });
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
