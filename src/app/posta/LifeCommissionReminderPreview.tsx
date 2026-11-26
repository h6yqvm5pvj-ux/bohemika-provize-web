"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";

import { parseLifeCommissionReminderContracts, type LifeCommissionReminder } from "@/app/lib/lifeCommissionReminder";
import type { MailboxItem } from "./postaTypes";

const dateFormat = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long", timeZone: "UTC" });

export function LifeCommissionReminderContent({ reminder, ownerEmail }: { reminder: LifeCommissionReminder; ownerEmail: string }) {
  return (
    <div className="space-y-4 text-sm text-slate-800">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 leading-relaxed">{reminder.body}</p>
      <ul className="space-y-2" aria-label="Smlouvy s očekávanou výplatou">
        {reminder.contracts.map(({ entryId, contractNumber, productLabel, code, payoutDay }) => (
          <li key={`${entryId}:${code}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="break-words font-semibold text-slate-950">{productLabel}{contractNumber ? ` · ${contractNumber}` : ""}</p>
              <p className="mt-1 text-slate-600">
                {code} · očekávaná výplata <time dateTime={payoutDay}>{dateFormat.format(new Date(`${payoutDay}T00:00:00Z`))}</time>
              </p>
            </div>
            <Link
              href={`/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}?source=life-commission-reminder`}
              prefetch={false}
              aria-label={contractNumber ? `Otevřít smlouvu ${contractNumber}` : `Otevřít smlouvu ${productLabel}`}
              className="inline-flex min-h-10 items-center rounded-lg bg-violet-700 px-3 font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
            >
              Otevřít smlouvu
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LifeCommissionReminderDownload({ reminder }: { reminder: LifeCommissionReminder }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);

  async function download(event: MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    setDownloading(true);
    setError(false);
    try {
      const { createLifeCommissionReminderPdf } = await import("./lifeCommissionReminderPdf");
      const blob = await createLifeCommissionReminderPdf(reminder);
      if (!button.isConnected) return;
      const url = URL.createObjectURL(blob);
      const month = reminder.contracts[0]?.payoutDay.slice(0, 7);
      const link = document.createElement("a");
      link.href = url;
      link.download = month ? `provize-B036-B048-${month}.pdf` : "provize-B036-B048.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError(true);
    } finally {
      setDownloading(false);
    }
  }

  if (!reminder.contracts.length) return null;
  return (
    <div>
      <button type="button" disabled={downloading} onClick={download} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
        {downloading ? "Připravuji PDF…" : "Stáhnout seznam v PDF"}
      </button>
      {error ? <p className="mt-2 text-sm text-rose-700" role="alert">PDF se nepodařilo připravit. Zkus to znovu.</p> : null}
    </div>
  );
}

export function LifeCommissionReminderPreview({ item, ownerEmail }: { item: MailboxItem; ownerEmail: string }) {
  const reminder = { id: item.id, title: item.title, body: item.body,
    contracts: parseLifeCommissionReminderContracts(item.metadata?.lifeCommissionContracts) };
  return (
    <article className="space-y-4 p-4 sm:p-6" aria-label={item.title}>
      <LifeCommissionReminderContent reminder={reminder} ownerEmail={ownerEmail} />
      <LifeCommissionReminderDownload reminder={reminder} />
    </article>
  );
}
