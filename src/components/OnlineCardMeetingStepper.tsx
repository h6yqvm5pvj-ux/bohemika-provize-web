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
import { ONLINE_CARD_COPY, type OnlineCardLocale } from "@/lib/onlineCardI18n";

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
  locale?: OnlineCardLocale;
  onSubmitted?: () => void;
  initialSelectedTopics?: MeetingTopicId[];
  initialStep?: 0 | 1;
};

const EMPTY_FORM: MeetingFormDraft = {
  fullName: "",
  phone: "",
  email: "",
  message: "",
  company: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MEETING_TOPICS = [
  { id: "vehicle", icon: CarFront },
  { id: "property", icon: House },
  { id: "liability", icon: ShieldCheck },
  { id: "life-accident", icon: HeartPulse },
  { id: "foreign-health", icon: Stethoscope },
  { id: "loans-mortgage", icon: Building2 },
  { id: "investments", icon: TrendingUp },
  { id: "precious-metals", icon: BrickWall },
  { id: "other", icon: Sparkles },
] as const;

type MeetingTopicId = (typeof MEETING_TOPICS)[number]["id"];

const fieldClass =
  "w-full rounded-[16px] border border-white/12 bg-black/15 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-violet-100/40 hover:border-white/20 focus:border-violet-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-violet-300/20";

export function OnlineCardMeetingStepper({
  slug,
  locale = "cs",
  onSubmitted,
  initialSelectedTopics,
  initialStep = 0,
}: OnlineCardMeetingStepperProps) {
  const copy = ONLINE_CARD_COPY[locale].meeting;
  const formSteps = copy.steps;
  const validInitialTopics = (initialSelectedTopics ?? []).filter((topic): topic is MeetingTopicId =>
    MEETING_TOPICS.some((availableTopic) => availableTopic.id === topic)
  );
  const [form, setForm] = useState<MeetingFormDraft>(EMPTY_FORM);
  const [selectedTopics, setSelectedTopics] = useState<MeetingTopicId[]>(() => validInitialTopics);
  const [step, setStep] = useState(() => initialStep === 1 && validInitialTopics.length > 0 ? 1 : 0);
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
      MEETING_TOPICS.flatMap((topic, index) =>
        selectedTopics.includes(topic.id) ? [copy.topics[index] ?? ""] : []
      ),
    [copy.topics, selectedTopics]
  );
  const hasSelectedTopics = selectedTopics.length > 0;
  const canSubmit = hasSelectedTopics && hasValidContact;
  const lastStep = formSteps.length - 1;

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
      setFormError(copy.chooseTopicError);
      return;
    }
    if (step === 1 && !hasValidContact) {
      setFormError(copy.contactError);
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
      setFormError(copy.chooseTopicError);
      setStep(0);
      return;
    }

    if (!hasValidContact) {
      setFormError(copy.contactError);
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
      locale,
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
          : copy.genericError
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
    <form className="mt-4 space-y-3.5 sm:mt-5 sm:space-y-5" onSubmit={handleSubmit}>
      <div className="relative overflow-hidden rounded-[20px] border border-white/12 bg-black/15 p-3 sm:rounded-[22px] sm:p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-16 bg-violet-400/10 blur-3xl" />
        <div className="relative grid grid-cols-3 gap-2">
          {formSteps.map((stepLabel, index) => {
            const stepDone = step > index;
            const stepActive = step === index;

            return (
              <div key={stepLabel} className="flex flex-col items-center gap-1.5 text-center">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold shadow-sm transition ${
                    stepDone
                      ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,0.22)]"
                      : stepActive
                        ? "border-violet-200/80 bg-violet-400/35 text-white shadow-[0_0_22px_rgba(167,139,250,0.32)]"
                        : "border-white/14 bg-white/[0.04] text-violet-200/60"
                  }`}
                >
                  {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.15em] ${
                    stepActive || stepDone ? "text-violet-100" : "text-violet-200/60"
                  }`}
                >
                  {stepLabel}
                </span>
              </div>
            );
          })}
        </div>
        <div className="relative mt-3 h-1 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#a855f7_55%,#c084fc_100%)] shadow-[0_0_12px_rgba(192,132,252,0.8)] transition-[width] duration-300"
            style={{ width: `${((step + 1) / formSteps.length) * 100}%` }}
          />
        </div>
      </div>

      {step === 0 ? (
        <div className="space-y-3 rounded-[18px] border border-white/10 bg-black/10 p-3 sm:rounded-[20px] sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200/85">
              {copy.chooseTopic}
            </p>
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-violet-100/75">
              {copy.selected}: {selectedTopics.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            {MEETING_TOPICS.map((topic, index) => {
              const Icon = topic.icon;
              const selected = selectedTopics.includes(topic.id);

              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => toggleTopic(topic.id)}
                  className={`group relative flex min-h-[58px] items-center gap-2.5 overflow-hidden rounded-[16px] border px-3 py-2 text-left transition duration-200 sm:min-h-[64px] sm:gap-3 sm:rounded-[18px] sm:px-3.5 sm:py-2.5 ${
                    selected
                      ? "border-violet-200/70 bg-[linear-gradient(135deg,rgba(139,92,246,0.42),rgba(109,40,217,0.2))] text-white shadow-[0_12px_28px_rgba(139,92,246,0.24)]"
                      : "border-white/12 bg-white/[0.025] text-violet-100/90 hover:-translate-y-0.5 hover:border-violet-300/40 hover:bg-white/[0.07]"
                  }`}
                >
                  {selected ? (
                    <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-violet-100" />
                  ) : null}
                  <span
                    className={`inline-flex shrink-0 items-center justify-center transition ${
                      selected ? "text-white" : "text-violet-200/80 group-hover:text-violet-100"
                    }`}
                  >
                    <Icon className="h-5 w-5 stroke-[1.8] sm:h-6 sm:w-6" />
                  </span>
                  <span className="pr-3 text-[13px] font-semibold leading-tight sm:pr-5 sm:text-sm">{copy.topics[index]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3 rounded-[20px] border border-white/10 bg-black/10 p-3.5 sm:p-4">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
              {copy.name}
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(event) => {
                setFormError(null);
                setForm((prev) => ({ ...prev, fullName: event.target.value.slice(0, 120) }));
              }}
              className={fieldClass}
              placeholder={copy.namePlaceholder}
              maxLength={120}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                {copy.phone}
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
                {copy.email}
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
              {copy.selectedTopics}
            </label>
            <div className="flex flex-wrap gap-1.5 rounded-[16px] border border-white/12 bg-white/[0.035] p-2.5">
              {selectedTopicLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-violet-200/35 bg-violet-400/15 px-2.5 py-1 text-xs font-semibold text-violet-100"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
              {copy.message}
            </label>
            <textarea
              value={form.message}
              onChange={(event) => {
                setFormError(null);
                setForm((prev) => ({ ...prev, message: event.target.value.slice(0, 1200) }));
              }}
              className={`${fieldClass} min-h-[120px] resize-y`}
              placeholder={copy.messagePlaceholder}
              maxLength={1200}
            />
          </div>
        </div>
      ) : null}

      <div className="hidden" aria-hidden="true">
        <label>
          {copy.company}
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
        <p className="rounded-[16px] border border-rose-300/45 bg-rose-400/15 px-3 py-2.5 text-xs text-rose-100">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="text-xs text-violet-100/70">
          {step === 0
            ? `${copy.selected}: ${selectedTopics.length}`
            : step === 2
              ? `${form.message.length}/1200 ${copy.characters}`
              : copy.fillContact}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={goToPreviousStep}
              disabled={submitting}
              className="inline-flex items-center rounded-full border border-white/18 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copy.back}
            </button>
          ) : null}

          {step < lastStep ? (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200/35 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65 vizitka-cta-glow"
            >
              {copy.continue}
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="inline-flex items-center gap-2 rounded-full border border-violet-200/35 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-65 vizitka-cta-glow"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? copy.submitting : copy.submit}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
