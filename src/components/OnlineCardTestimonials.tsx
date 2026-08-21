"use client";

import { Loader2, MessageSquareQuote, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { LogoLoop, type LogoLoopItem } from "@/components/LogoLoop";
import {
  ONLINE_CARD_COPY,
  onlineCardLanguageMeta,
  type OnlineCardLocale,
  type OnlineCardTestimonial,
} from "@/lib/onlineCardI18n";

type OnlineCardTestimonialsProps = {
  slug?: string;
  testimonials: OnlineCardTestimonial[] | undefined;
  locale: OnlineCardLocale;
  theme?: "dark" | "light";
  reveal?: boolean;
  allowSubmission?: boolean;
  mode?: "showcase" | "submission";
};

type ReviewDraft = {
  author: string;
  context: string;
  quote: string;
  company: string;
  consent: boolean;
};

type ReviewApiResponse = {
  ok?: boolean;
  error?: string;
};

const EMPTY_REVIEW: ReviewDraft = {
  author: "",
  context: "",
  quote: "",
  company: "",
  consent: false,
};

const getInitials = (value: string): string => {
  const initials = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return initials || "K";
};

const formatReviewDate = (value: string | undefined, locale: OnlineCardLocale): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(onlineCardLanguageMeta(locale).htmlLang, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

export function OnlineCardTestimonials({
  slug = "",
  testimonials,
  locale,
  theme = "dark",
  reveal = false,
  allowSubmission = true,
  mode = "showcase",
}: OnlineCardTestimonialsProps) {
  const copy = ONLINE_CARD_COPY[locale].public;
  const visibleTestimonials = (testimonials ?? []).filter(
    (testimonial) => testimonial.published && testimonial.locale === locale
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<ReviewDraft>(EMPTY_REVIEW);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  const light = theme === "light";
  const revealAttrs = reveal ? { "data-vizitka-reveal": true } : {};
  const reviewItems: LogoLoopItem[] = visibleTestimonials.map((testimonial) => {
    const dateLabel = formatReviewDate(testimonial.submittedAt, locale);
    const author = testimonial.author || copy.testimonialsContextFallback;
    return {
      id: testimonial.id,
      title: author,
      node: (
        <article
          className={`w-[360px] rounded-2xl border px-4 py-3 text-left sm:w-[420px] ${
            light
              ? "border-blue-200/80 bg-white text-slate-950"
              : "border-blue-300/20 bg-white/[0.055] text-white"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-extrabold tracking-wide text-white shadow-[0_8px_18px_rgba(37,99,235,0.36)]">
              {getInitials(author)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-sm font-bold ${light ? "text-slate-950" : "text-white"}`}>{author}</span>
                {dateLabel ? (
                  <time className={`shrink-0 text-[11px] font-medium ${light ? "text-slate-500" : "text-blue-100/60"}`}>
                    {dateLabel}
                  </time>
                ) : null}
              </div>
              <p className={`mt-1.5 line-clamp-2 text-sm leading-relaxed ${light ? "text-slate-600" : "text-blue-50/88"}`}>
                {testimonial.quote}
              </p>
            </div>
          </div>
        </article>
      ),
    };
  });

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (mode === "showcase" && visibleTestimonials.length === 0) return null;
  if (mode === "submission" && !allowSubmission) return null;

  const openReview = () => {
    setStatus(null);
    setReviewOpen(true);
  };

  const closeReview = () => {
    if (submitting) return;
    setReviewOpen(false);
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const author = review.author.trim();
    const quote = review.quote.trim();
    if (author.length < 2 || quote.length < 15 || !review.consent) {
      setStatus({ type: "error", message: copy.reviewValidation });
      return;
    }

    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/online-card/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          author,
          context: review.context.trim(),
          quote,
          company: review.company.trim(),
          locale,
          consent: review.consent,
        }),
      });
      const data = (await response.json().catch(() => null)) as ReviewApiResponse | null;
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || copy.reviewGenericError);
      }
      setReview(EMPTY_REVIEW);
      setStatus({ type: "success", message: copy.reviewSubmitted });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : copy.reviewGenericError,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      {...revealAttrs}
      className={`online-card-public-section relative overflow-hidden px-4 py-10 sm:px-10 sm:py-16 ${
        reveal ? "online-card-scroll-reveal" : ""
      } ${
        light
          ? "bg-[linear-gradient(180deg,rgba(239,246,255,0.94)_0%,rgba(255,255,255,0.98)_100%)]"
          : "bg-[linear-gradient(180deg,rgba(8,26,51,0.99)_0%,rgba(5,13,30,0.99)_100%)]"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(37,99,235,0.18),transparent_34%)]" />
      <div className={`relative z-10 mx-auto ${mode === "showcase" ? "max-w-[1680px]" : "max-w-5xl"}`}>
        <div className="text-left sm:text-center">
          <p
            className={`mx-auto inline-flex items-center gap-2 rounded-full border px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
              light
                ? "border-blue-200 bg-white text-blue-800"
                : "border-blue-300/35 bg-white/[0.05] text-blue-100"
            }`}
          >
            <MessageSquareQuote className="h-3.5 w-3.5" />
            {copy.testimonialsKicker}
          </p>
          <h2
            className={`mt-4 font-bold tracking-[-0.03em] ${
              mode === "showcase"
                ? "text-3xl sm:text-5xl"
                : "text-[clamp(1.25rem,3vw,2.45rem)] leading-tight sm:whitespace-nowrap"
            } ${light ? "text-slate-950" : "text-white"}`}
          >
            {mode === "showcase" ? copy.testimonialsTitle : copy.reviewPrompt}
          </h2>
        </div>

        {mode === "showcase" ? (
          <LogoLoop
            items={reviewItems}
            speed={42}
            gap={18}
            className="mt-7 py-2"
            itemClassName="min-h-[104px] min-w-[360px] sm:min-w-[420px]"
          />
        ) : null}

        {mode === "submission" && allowSubmission ? (
          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={openReview}
              className="online-card-action inline-flex items-center gap-2 rounded-full border border-blue-300/35 bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition hover:-translate-y-0.5 hover:bg-blue-800"
            >
              <MessageSquareQuote className="h-4 w-4" />
              {copy.writeReview}
            </button>
          </div>
        ) : null}
      </div>

      {reviewOpen && mode === "submission" && allowSubmission && mounted
        ? createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/62 p-3 backdrop-blur-xl sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-card-review-title"
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[28px] border border-blue-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(96,165,250,0.24),transparent_34%),linear-gradient(155deg,#071a36_0%,#061225_100%)] p-4 text-white shadow-[0_34px_90px_rgba(2,8,23,0.72),inset_0_1px_0_rgba(147,197,253,0.2)] sm:max-h-[calc(100dvh-3rem)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/80">
                  {copy.testimonialsKicker}
                </p>
                <h2 id="online-card-review-title" className="mt-1 text-xl font-bold tracking-[-0.02em] text-white">{copy.reviewTitle}</h2>
                <p className="mt-1 text-sm text-blue-100/75">{copy.reviewDescription}</p>
              </div>
              <button
                type="button"
                onClick={closeReview}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-blue-100 transition hover:bg-white/18"
                aria-label={copy.closeForm}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submitReview}>
              <div className="hidden" aria-hidden="true">
                <label>
                  Company
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={review.company}
                    onChange={(event) => setReview((current) => ({ ...current, company: event.target.value }))}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-blue-50">
                  {copy.reviewName}
                  <input
                    type="text"
                    value={review.author}
                    onChange={(event) => setReview((current) => ({ ...current, author: event.target.value.slice(0, 80) }))}
                    placeholder={copy.reviewNamePlaceholder}
                    maxLength={80}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none placeholder:text-blue-100/45 focus:border-blue-300/45 focus:ring-2 focus:ring-blue-300/20"
                  />
                </label>
                <label className="text-sm font-semibold text-blue-50">
                  {copy.reviewContext}
                  <input
                    type="text"
                    value={review.context}
                    onChange={(event) => setReview((current) => ({ ...current, context: event.target.value.slice(0, 120) }))}
                    placeholder={copy.reviewContextPlaceholder}
                    maxLength={120}
                    className="mt-1.5 w-full rounded-xl border border-white/14 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none placeholder:text-blue-100/45 focus:border-blue-300/45 focus:ring-2 focus:ring-blue-300/20"
                  />
                </label>
              </div>
              <label className="block text-sm font-semibold text-blue-50">
                {copy.reviewText}
                <textarea
                  value={review.quote}
                  onChange={(event) => setReview((current) => ({ ...current, quote: event.target.value.slice(0, 600) }))}
                  placeholder={copy.reviewTextPlaceholder}
                  maxLength={600}
                  rows={5}
                  className="mt-1.5 w-full resize-y rounded-xl border border-white/14 bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none placeholder:text-blue-100/45 focus:border-blue-300/45 focus:ring-2 focus:ring-blue-300/20"
                />
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-blue-100/82">
                <input
                  type="checkbox"
                  checked={review.consent}
                  onChange={(event) => setReview((current) => ({ ...current, consent: event.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-white/30 bg-white/10 text-blue-600 focus:ring-blue-300"
                />
                <span>{copy.reviewConsent}</span>
              </label>
              {status ? (
                <p className={`rounded-xl px-3 py-2 text-sm ${status.type === "success" ? "bg-emerald-400/15 text-emerald-100" : "bg-rose-400/15 text-rose-100"}`}>
                  {status.message}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareQuote className="h-4 w-4" />}
                {submitting ? copy.reviewSubmitting : copy.reviewSubmit}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )
        : null}
    </section>
  );
}
