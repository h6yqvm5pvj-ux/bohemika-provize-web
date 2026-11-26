"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { LifeCommissionReminder } from "@/app/lib/lifeCommissionReminder";
import { privateMemoryGeneration } from "@/app/lib/privateMemory";
import { LifeCommissionReminderContent, LifeCommissionReminderDownload } from "@/app/posta/LifeCommissionReminderPreview";

const REMINDER_API = "/api/mailbox/life-commission-reminder";
const REMINDER_REFRESH_MS = 5 * 60_000;
type ReminderCheck = {
  generation: number;
  expiresAt: number;
  result: Promise<LifeCommissionReminder | null>;
};
const reminderChecks = new WeakMap<User, ReminderCheck>();

function loadReminder(user: User, generation: number): Promise<LifeCommissionReminder | null> {
  const cached = reminderChecks.get(user);
  if (cached?.generation === generation && cached.expiresAt > Date.now()) return cached.result;

  const check: ReminderCheck = {
    generation,
    expiresAt: Infinity,
    result: fetchAuthedJsonOrThrow<{ reminder: LifeCommissionReminder | null }>(user, REMINDER_API)
      .then(({ reminder }) => {
        if (reminderChecks.get(user) !== check || privateMemoryGeneration() !== generation) return null;
        check.expiresAt = Date.now() + REMINDER_REFRESH_MS;
        return reminder;
      })
      .catch((error: unknown) => {
        if (reminderChecks.get(user) === check) reminderChecks.delete(user);
        throw error;
      }),
  };
  reminderChecks.set(user, check);
  return check.result;
}

export function LifeCommissionReminderDialog({ user, pathname }: { user: User; pathname: string }) {
  const [snapshot, setSnapshot] = useState<{ user: User; generation: number; reminder: LifeCommissionReminder | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ownerEmail = user.email?.trim().toLowerCase();
  const generation = privateMemoryGeneration();
  const onLinkedContract = pathname.startsWith("/smlouvy/") && typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("source") === "life-commission-reminder";
  const reminder = !onLinkedContract && snapshot?.user === user && snapshot.generation === generation ? snapshot.reminder : null;

  useEffect(() => {
    if (!ownerEmail || onLinkedContract) return;
    let disposed = false;
    const refresh = () => {
      if (document.visibilityState === "hidden" || privateMemoryGeneration() !== generation) return;
      void loadReminder(user, generation).then(reminder => {
        if (!disposed && privateMemoryGeneration() === generation) setSnapshot({ user, generation, reminder });
      }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, REMINDER_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [generation, onLinkedContract, ownerEmail, user]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!reminder || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [reminder]);

  if (!reminder || !ownerEmail) return null;
  const { id } = reminder;

  async function acknowledge() {
    setConfirming(true);
    setError(false);
    try {
      await fetchAuthedJsonOrThrow(user, REMINDER_API, { method: "PATCH", body: JSON.stringify({ id }) });
      if (privateMemoryGeneration() === generation) {
        reminderChecks.set(user, {
          generation,
          expiresAt: Date.now() + REMINDER_REFRESH_MS,
          result: Promise.resolve(null),
        });
        setSnapshot({ user, generation, reminder: null });
      }
    } catch {
      setError(true);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="life-commission-reminder-title"
      onCancel={event => event.preventDefault()}
      className="m-auto w-[calc(100%_-_1.5rem)] max-w-[44rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
    >
      <div className="flex max-h-[min(44rem,90dvh)] flex-col">
        <header className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6">
          <h2 id="life-commission-reminder-title" className="text-lg font-bold sm:text-xl">{reminder.title}</h2>
        </header>
        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
          <LifeCommissionReminderContent reminder={reminder} ownerEmail={ownerEmail} />
        </div>
        <footer className="shrink-0 border-t border-slate-200 px-4 py-4 sm:px-6">
          {error ? <p role="alert" className="mb-3 text-sm text-rose-700">Potvrzení se nepodařilo uložit. Zkus to znovu.</p> : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <LifeCommissionReminderDownload reminder={reminder} />
            <button type="button" disabled={confirming} onClick={() => void acknowledge()} className="min-h-11 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">
              {confirming ? "Ukládám…" : "Rozumím, pokračovat"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
