"use client";

import {
  BrickWall,
  Building2,
  CarFront,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Globe2,
  HeartPulse,
  House,
  Loader2,
  Mail,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { AdvisorProfileSections } from "@/components/AdvisorProfileSections";
import {
  PremiumOnlineCardPreview,
  type PremiumOnlineCardValue,
} from "@/components/PremiumOnlineCardPreview";

type MeetingFormDraft = {
  fullName: string;
  phone: string;
  email: string;
  message: string;
  company: string;
};

type MeetingApiResponse = {
  ok?: boolean;
  error?: string;
};

type OfficePhotoMeta = {
  width: number;
  height: number;
};

type OnlineCardPublicClientProps = {
  slug: string;
  card: PremiumOnlineCardValue;
};

const EMPTY_FORM: MeetingFormDraft = {
  fullName: "",
  phone: "",
  email: "",
  message: "",
  company: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM_STEPS = ["Oblast řešení", "Kontakt", "Zpráva"] as const;

const MEETING_TOPICS = [
  { id: "vehicle", label: "Pojištění vozidel", icon: CarFront },
  { id: "property", label: "Pojištění majetku", icon: House },
  { id: "liability", label: "Pojištění odpovědnosti", icon: ShieldCheck },
  { id: "life-accident", label: "Životní a úrazové pojištění", icon: HeartPulse },
  { id: "foreign-health", label: "Zdravotní pojištění cizinců", icon: Stethoscope },
  { id: "loans-mortgage", label: "Úvěry a hypotéky", icon: Building2 },
  { id: "investments", label: "Investice", icon: TrendingUp },
  { id: "precious-metals", label: "Drahé kovy", icon: BrickWall },
  { id: "other", label: "Jiné", icon: Sparkles },
] as const;

type MeetingTopicId = (typeof MEETING_TOPICS)[number]["id"];

const fieldClass =
  "w-full rounded-2xl border border-white/14 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-violet-100/45 focus:border-violet-300/45 focus:ring-2 focus:ring-violet-300/20";

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

export default function OnlineCardPublicClient({ slug, card }: OnlineCardPublicClientProps) {
  const [form, setForm] = useState<MeetingFormDraft>(EMPTY_FORM);
  const [selectedTopics, setSelectedTopics] = useState<MeetingTopicId[]>([]);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [officePhotoIndex, setOfficePhotoIndex] = useState(0);
  const [officePhotoMetaByUrl, setOfficePhotoMetaByUrl] = useState<Record<string, OfficePhotoMeta>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const hasValidContact = useMemo(() => {
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();
    return fullName.length >= 3 && phone.length >= 6 && EMAIL_RE.test(email);
  }, [form.email, form.fullName, form.phone]);
  const selectedTopicLabels = useMemo(
    () =>
      MEETING_TOPICS.filter((topic) => selectedTopics.includes(topic.id)).map((topic) => topic.label),
    [selectedTopics]
  );
  const cardWebsiteLink = useMemo(() => sanitizeWebsite(card.website), [card.website]);
  const cardWebsiteLabel = cardWebsiteLink ? normalizeWebsiteLabel(cardWebsiteLink) : card.website.trim();
  const cardPhoneLink = card.phone ? normalizePhoneHref(card.phone) : "";
  const officeLabel = card.officeLabel.trim();
  const officePhotos = card.officePhotos;
  const hasOfficeSection = officeLabel.length > 0 || officePhotos.length > 0;
  const officePhotoCount = officePhotos.length;
  const activeOfficePhoto = officePhotos[officePhotoIndex] ?? "";
  const activeOfficePhotoMeta = activeOfficePhoto ? officePhotoMetaByUrl[activeOfficePhoto] : null;
  const activeOfficePhotoIsPortrait = activeOfficePhotoMeta
    ? activeOfficePhotoMeta.height > activeOfficePhotoMeta.width * 1.05
    : false;
  const activeOfficePhotoIsLandscape = activeOfficePhotoMeta
    ? activeOfficePhotoMeta.width > activeOfficePhotoMeta.height * 1.05
    : false;
  const officeAddressText = officeLabel || card.location.trim();
  const officeMapsLink = officeAddressText
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(officeAddressText)}`
    : "";

  const hasSelectedTopics = selectedTopics.length > 0;
  const canSubmit = hasSelectedTopics && hasValidContact;
  const lastStep = FORM_STEPS.length - 1;

  useEffect(() => {
    setOfficePhotoIndex((prev) => {
      if (officePhotoCount === 0) return 0;
      return Math.min(prev, officePhotoCount - 1);
    });
  }, [officePhotoCount]);

  const openModal = () => {
    setStatus(null);
    setFormError(null);
    setStep(0);
    setOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setFormError(null);
    setOpen(false);
  };

  const toggleTopic = (topicId: MeetingTopicId) => {
    setFormError(null);
    setSelectedTopics((prev) =>
      prev.includes(topicId) ? prev.filter((current) => current !== topicId) : [...prev, topicId]
    );
  };

  const goToNextStep = () => {
    if (step === 0 && !hasSelectedTopics) {
      setFormError("Vyberte prosím alespoň jednu oblast, kterou chcete řešit.");
      return;
    }
    if (step === 1 && !hasValidContact) {
      setFormError("Vyplň prosím jméno, telefon a platný e-mail.");
      return;
    }

    setFormError(null);
    setStep((prev) => Math.min(prev + 1, lastStep));
  };

  const goToPreviousStep = () => {
    setFormError(null);
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const submitMeetingRequest = async () => {
    if (submitting) return;

    if (!hasSelectedTopics) {
      setFormError("Vyberte prosím alespoň jednu oblast, kterou chcete řešit.");
      setStep(0);
      return;
    }

    if (!hasValidContact) {
      setFormError("Vyplň prosím jméno, telefon a platný e-mail.");
      setStep(1);
      return;
    }

    const payload = {
      slug,
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim().toLowerCase(),
      message: form.message.trim().slice(0, 1200),
      topics: selectedTopicLabels,
      company: form.company.trim(),
    };

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/online-card/meeting-request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as MeetingApiResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Odeslání žádosti se nepodařilo.");
      }

      setForm(EMPTY_FORM);
      setSelectedTopics([]);
      setStep(0);
      setStatus({
        type: "success",
        message: "Žádost byla odeslána. Brzy se ti ozveme.",
      });
      setOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Žádost se nepodařilo odeslat."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step < lastStep) {
      goToNextStep();
      return;
    }
    void submitMeetingRequest();
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
      <div className="space-y-6 sm:space-y-8">
        <PremiumOnlineCardPreview
          value={card}
          layout="fullWidth"
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
        <AdvisorProfileSections />
        {hasOfficeSection ? (
          <section className="vizitka-anim-up [animation-delay:680ms]">
            <div
              className={`relative z-10 mx-auto grid max-w-[1160px] gap-5 lg:items-start ${
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
                    <div className="relative overflow-hidden rounded-2xl border border-white/14 bg-[radial-gradient(circle_at_15%_10%,rgba(129,140,248,0.18),rgba(2,6,23,0.65)_55%)]">
                      <img
                        src={activeOfficePhoto}
                        alt={`Fotka kanceláře ${officePhotoIndex + 1}`}
                        onLoad={(event) =>
                          handleOfficePhotoLoad(
                            activeOfficePhoto,
                            event.currentTarget.naturalWidth,
                            event.currentTarget.naturalHeight
                          )
                        }
                        className={`w-full object-contain ${
                          activeOfficePhotoIsPortrait
                            ? "h-[330px] sm:h-[430px] lg:h-[500px]"
                            : activeOfficePhotoIsLandscape
                              ? "h-[230px] sm:h-[320px] lg:h-[400px]"
                              : "h-[260px] sm:h-[360px] lg:h-[430px]"
                        }`}
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
                          index === officePhotoIndex ? "w-6 bg-violet-200" : "w-2.5 bg-white/35 hover:bg-white/60"
                        }`}
                        aria-label={`Zobrazit fotku kanceláře ${index + 1}`}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex items-start">
                <div className="w-full max-w-[580px] space-y-4 rounded-2xl border border-white/14 bg-[linear-gradient(160deg,rgba(30,27,60,0.45)_0%,rgba(15,23,42,0.35)_100%)] p-5 sm:p-6">
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
        <section className="relative overflow-hidden rounded-[30px] border border-violet-400/18 bg-[linear-gradient(160deg,rgba(14,11,29,0.96)_0%,rgba(8,8,20,0.98)_100%)] p-6 shadow-[0_24px_70px_rgba(6,4,23,0.48)] sm:p-8 vizitka-anim-up [animation-delay:720ms]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(139,92,246,0.2),transparent_34%)]" />
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
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/14 bg-white/[0.07] text-violet-100 transition-colors group-hover:border-violet-300/60 group-hover:text-white">
                      <item.icon className="h-4 w-4" />
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

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-white/14 bg-white/[0.04] px-3 py-3">
                <div className="grid grid-cols-3 gap-2">
                  {FORM_STEPS.map((stepLabel, index) => {
                    const stepDone = step > index;
                    const stepActive = step === index;

                    return (
                      <div key={stepLabel} className="flex flex-col items-center gap-1 text-center">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                            stepDone
                              ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100"
                              : stepActive
                                ? "border-violet-200/70 bg-violet-400/30 text-white"
                                : "border-white/20 bg-white/[0.03] text-violet-200/70"
                          }`}
                        >
                          {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            stepActive || stepDone ? "text-violet-100" : "text-violet-200/60"
                          }`}
                        >
                          {stepLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#a855f7_55%,#c084fc_100%)] transition-[width] duration-300"
                    style={{ width: `${((step + 1) / FORM_STEPS.length) * 100}%` }}
                  />
                </div>
              </div>

              {step === 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                    Co chcete řešit
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MEETING_TOPICS.map((topic) => {
                      const Icon = topic.icon;
                      const selected = selectedTopics.includes(topic.id);

                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => toggleTopic(topic.id)}
                          className={`group flex min-h-[56px] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                            selected
                              ? "border-violet-200/70 bg-violet-400/20 text-white shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                              : "border-white/14 bg-white/[0.03] text-violet-100/90 hover:border-violet-300/40 hover:bg-white/[0.07]"
                          }`}
                        >
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                              selected
                                ? "border-violet-200/70 bg-violet-300/35 text-white"
                                : "border-white/20 bg-white/[0.03] text-violet-100/80"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium leading-tight">{topic.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                      Jméno a příjmení
                    </label>
                    <input
                      type="text"
                      value={form.fullName}
                      onChange={(event) => {
                        setFormError(null);
                        setForm((prev) => ({ ...prev, fullName: event.target.value.slice(0, 120) }));
                      }}
                      className={fieldClass}
                      placeholder="Jan Novák"
                      maxLength={120}
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        Telefon
                      </label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={(event) => {
                          setFormError(null);
                          setForm((prev) => ({ ...prev, phone: event.target.value.slice(0, 80) }));
                        }}
                        className={fieldClass}
                        placeholder="+420 777 000 111"
                        maxLength={80}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        E-mail
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) => {
                          setFormError(null);
                          setForm((prev) => ({ ...prev, email: event.target.value.slice(0, 160) }));
                        }}
                        className={fieldClass}
                        placeholder="jan@firma.cz"
                        maxLength={160}
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                      Vybrané oblasti
                    </label>
                    <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/12 bg-white/[0.03] p-2">
                      {selectedTopicLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-full border border-violet-200/35 bg-violet-400/15 px-2.5 py-1 text-xs font-medium text-violet-100"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                      Zpráva (volitelné)
                    </label>
                    <textarea
                      value={form.message}
                      onChange={(event) => {
                        setFormError(null);
                        setForm((prev) => ({ ...prev, message: event.target.value.slice(0, 1200) }));
                      }}
                      className={`${fieldClass} min-h-[120px] resize-y`}
                      placeholder="Napište preferovaný termín nebo stručný důvod schůzky."
                      maxLength={1200}
                    />
                  </div>
                </div>
              ) : null}

              <div className="hidden" aria-hidden="true">
                <label>
                  Společnost
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.company}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, company: event.target.value.slice(0, 120) }))
                    }
                  />
                </label>
              </div>

              {formError ? (
                <p className="rounded-2xl border border-rose-300/45 bg-rose-400/15 px-3 py-2 text-xs text-rose-100">
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-violet-100/70">
                  {step === 0
                    ? `Vybráno: ${selectedTopics.length}`
                    : step === 2
                      ? `${form.message.length}/1200 znaků`
                      : "Vyplňte kontaktní údaje."}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  {step > 0 ? (
                    <button
                      type="button"
                      onClick={goToPreviousStep}
                      disabled={submitting}
                      className="inline-flex items-center rounded-full border border-white/22 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zpět
                    </button>
                  ) : null}

                  {step < lastStep ? (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65 vizitka-cta-glow"
                    >
                      Pokračovat
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={submitting || !canSubmit}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65 vizitka-cta-glow"
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {submitting ? "Odesílám..." : "Odeslat"}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
