"use client";

import {
  BrickWall,
  Building2,
  CarFront,
  CheckCircle2,
  HeartPulse,
  House,
  Loader2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

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

type OnlineCardMeetingStepperProps = {
  slug: string;
  onSubmitted?: () => void;
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

export function OnlineCardMeetingStepper({
  slug,
  onSubmitted,
}: OnlineCardMeetingStepperProps) {
  const [form, setForm] = useState<MeetingFormDraft>(EMPTY_FORM);
  const [selectedTopics, setSelectedTopics] = useState<MeetingTopicId[]>([]);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasValidContact = useMemo(() => {
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();
    return fullName.length >= 3 && phone.length >= 6 && EMAIL_RE.test(email);
  }, [form.email, form.fullName, form.phone]);
  const selectedTopicLabels = useMemo(
    () =>
      MEETING_TOPICS.filter((topic) => selectedTopics.includes(topic.id)).map(
        (topic) => topic.label
      ),
    [selectedTopics]
  );
  const hasSelectedTopics = selectedTopics.length > 0;
  const canSubmit = hasSelectedTopics && hasValidContact;
  const lastStep = FORM_STEPS.length - 1;

  const toggleTopic = (topicId: MeetingTopicId) => {
    setFormError(null);
    setSelectedTopics((prev) =>
      prev.includes(topicId)
        ? prev.filter((current) => current !== topicId)
        : [...prev, topicId]
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
      onSubmitted?.();
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

  return (
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
  );
}
