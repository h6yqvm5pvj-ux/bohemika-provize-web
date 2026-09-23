"use client";

import { Loader2, Mail, Phone } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import styles from "./OnlineCardMeetingForm.module.css";
import { ONLINE_CARD_COPY, type OnlineCardLocale } from "@/lib/onlineCardI18n";
import { isValidOnlineCardEmail, isValidOnlineCardPhone, type OnlineCardContactMethod } from "@/lib/onlineCardContact";

const TOPIC_IDS = ["vehicle", "property", "liability", "life-accident", "foreign-health", "loans-mortgage", "investments", "precious-metals", "other"] as const;
type MeetingTopicId = (typeof TOPIC_IDS)[number];
type Props = {
  slug: string;
  locale?: OnlineCardLocale;
  onSubmitted?: () => void;
  initialSelectedTopics?: MeetingTopicId[];
  initialMessage?: string;
  palette?: "default" | "bohemika";
};
const EMPTY_FORM = { fullName: "", phone: "", email: "", message: "", company: "" };
const fieldClass = "w-full rounded-[16px] border border-white/12 bg-black/15 px-3.5 py-3 text-base text-white outline-none transition placeholder:text-blue-100/40 focus:border-blue-300/55 focus:ring-2 focus:ring-blue-300/20";

export function OnlineCardMeetingForm({ slug, locale = "cs", onSubmitted, initialSelectedTopics = [], initialMessage = "", palette = "default" }: Props) {
  const copy = ONLINE_CARD_COPY[locale].meeting;
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, message: initialMessage.slice(0, 1200) }));
  const [preferredContact, setPreferredContact] = useState<OnlineCardContactMethod>("phone");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; field?: "name" | "contact" } | null>(null);
  const topics = TOPIC_IDS.flatMap((topic, index) => initialSelectedTopics.includes(topic) ? [copy.topics[index]] : []);
  const patch = (key: keyof typeof form, value: string) => {
    setError(null);
    setForm(previous => ({ ...previous, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (form.fullName.trim().length < 3) {
      setError({ field: "name", message: copy.nameError });
      nameRef.current?.focus();
      return;
    }
    const validContact = preferredContact === "phone" ? isValidOnlineCardPhone(form.phone) : isValidOnlineCardEmail(form.email);
    if (!validContact) {
      setError({ field: "contact", message: preferredContact === "phone" ? copy.phoneError : copy.emailError });
      contactRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/online-card/meeting-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug, fullName: form.fullName.trim(), preferredContact,
          phone: preferredContact === "phone" ? form.phone.trim() : "",
          email: preferredContact === "email" ? form.email.trim().toLowerCase() : "",
          message: form.message.trim(), company: form.company.trim(), topics, locale,
        }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(data?.error || copy.genericError);
      setForm(EMPTY_FORM);
      onSubmitted?.();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : copy.genericError });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={`mt-4 sm:mt-5 ${palette === "bohemika" ? styles.bohemika : ""}`} onSubmit={submit}>
      <fieldset disabled={submitting} className="min-w-0 space-y-4">
        {topics.length > 0 ? <p className={`${styles.hint} text-sm text-blue-100/70`}>{topics.join(" · ")}</p> : null}
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className={`${styles.label} text-sm font-semibold text-blue-100`}>{copy.name}</label>
          <input ref={nameRef} id={`${id}-name`} name="fullName" autoComplete="name" value={form.fullName} onChange={event => patch("fullName", event.target.value)} className={`${styles.field} ${fieldClass}`} placeholder={copy.namePlaceholder} minLength={3} maxLength={120} required aria-invalid={error?.field === "name" || undefined} aria-describedby={error?.field === "name" ? `${id}-error` : undefined} />
        </div>
        <fieldset className="min-w-0 space-y-2">
          <legend className={`${styles.label} text-sm font-semibold text-blue-100`}>{copy.preferredContact}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["phone", "email"] as const).map(method => {
              const Icon = method === "phone" ? Phone : Mail;
              return <label key={method} className={`${styles.contactOption} flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm text-blue-100`} data-selected={preferredContact === method}>
                <input type="radio" name={`${id}-preferred-contact`} value={method} checked={preferredContact === method} onChange={() => { setPreferredContact(method); setError(null); }} className={styles.radio} />
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{method === "phone" ? copy.byPhone : copy.byEmail}</span>
              </label>;
            })}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-contact`} className={`${styles.label} text-sm font-semibold text-blue-100`}>{preferredContact === "phone" ? copy.phone : copy.email}</label>
          <input key={preferredContact} ref={contactRef} id={`${id}-contact`} name={preferredContact} type={preferredContact === "phone" ? "tel" : "email"} autoComplete={preferredContact === "phone" ? "tel" : "email"} value={form[preferredContact]} onChange={event => patch(preferredContact, event.target.value)} className={`${styles.field} ${fieldClass}`} placeholder={preferredContact === "phone" ? "+420 777 000 111" : copy.emailPlaceholder} maxLength={preferredContact === "phone" ? 80 : 200} required aria-invalid={error?.field === "contact" || undefined} aria-describedby={error?.field === "contact" ? `${id}-error` : undefined} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-message`} className={`${styles.label} text-sm font-semibold text-blue-100`}>{copy.message}</label>
          <textarea id={`${id}-message`} name="message" rows={3} value={form.message} onChange={event => patch("message", event.target.value)} className={`${styles.field} ${fieldClass} resize-y`} placeholder={copy.messagePlaceholder} maxLength={1200} />
        </div>
        <div className="hidden" aria-hidden="true">
          <label htmlFor={`${id}-company`}>{copy.company}</label>
          <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" value={form.company} onChange={event => patch("company", event.target.value)} maxLength={120} />
        </div>
        {error ? <p id={`${id}-error`} role="alert" className={`${styles.error} rounded-xl border border-rose-300/45 bg-rose-400/15 px-3 py-2.5 text-sm text-rose-100`}>{error.message}</p> : null}
        <button type="submit" disabled={submitting} className={`${styles.submit} inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-65`}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitting ? copy.submitting : copy.submit}
        </button>
      </fieldset>
    </form>
  );
}
