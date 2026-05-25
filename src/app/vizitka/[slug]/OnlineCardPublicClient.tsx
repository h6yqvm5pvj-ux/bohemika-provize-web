"use client";

import { CheckCircle2, Loader2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

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

const fieldClass =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200";

export default function OnlineCardPublicClient({ slug, card }: OnlineCardPublicClientProps) {
  const [form, setForm] = useState<MeetingFormDraft>(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const canSubmit = useMemo(() => {
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();
    return fullName.length >= 3 && phone.length >= 6 && EMAIL_RE.test(email);
  }, [form.email, form.fullName, form.phone]);

  const openModal = () => {
    setStatus(null);
    setOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const payload = {
      slug,
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim().toLowerCase(),
      message: form.message.trim(),
      company: form.company.trim(),
    };

    if (!canSubmit) {
      setStatus({
        type: "error",
        message: "Vyplň prosím jméno, telefon a platný e-mail.",
      });
      return;
    }

    setSubmitting(true);
    setStatus(null);

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
      setStatus({
        type: "success",
        message: "Žádost byla odeslána. Brzy se ti ozveme.",
      });
      setOpen(false);
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Žádost se nepodařilo odeslat.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PremiumOnlineCardPreview
        value={card}
        meetingCta={{
          label: "Sjednat schůzku",
          onClick: openModal,
          disabled: false,
        }}
      />

      {status ? (
        <p
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
            status.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {status.type === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          {status.message}
        </p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/40 p-2 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-[linear-gradient(155deg,#f8fcff_0%,#ffffff_100%)] p-4 shadow-[0_34px_90px_rgba(15,23,42,0.28)] sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Sjednat schůzku
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-[-0.02em] text-slate-950">
                  Domluvte si termín
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Vyplňte kontakt a zprávu. Majiteli vizitky přijde zpráva do pošty a notifikace.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                aria-label="Zavřít formulář"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                  Jméno a příjmení
                </label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, fullName: event.target.value.slice(0, 120) }))
                  }
                  className={fieldClass}
                  placeholder="Jan Novák"
                  maxLength={120}
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                    Telefon
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, phone: event.target.value.slice(0, 80) }))
                    }
                    className={fieldClass}
                    placeholder="+420 777 000 111"
                    maxLength={80}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, email: event.target.value.slice(0, 160) }))
                    }
                    className={fieldClass}
                    placeholder="jan@firma.cz"
                    maxLength={160}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-600">
                  Zpráva (volitelné)
                </label>
                <textarea
                  value={form.message}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, message: event.target.value.slice(0, 1200) }))
                  }
                  className={`${fieldClass} min-h-[120px] resize-y`}
                  placeholder="Napište preferovaný termín nebo stručný důvod schůzky."
                  maxLength={1200}
                />
              </div>

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

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-slate-500">{form.message.length}/1200 znaků</p>
                <button
                  type="submit"
                  disabled={submitting || !canSubmit}
                  className="inline-flex items-center gap-2 rounded-full border border-transparent bg-[linear-gradient(125deg,#0f172a_0%,#1e3a8a_62%,#0891b2_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(30,58,138,0.3)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? "Odesílám..." : "Odeslat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
