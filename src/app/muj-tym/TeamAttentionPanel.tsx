import { Mail, PhoneCall, ShieldCheck, UserRoundSearch } from "lucide-react";

import type { TeamAttentionItem } from "./teamDashboard";

type TeamAttentionPanelProps = {
  items: TeamAttentionItem[];
  onOpenDetail: (email: string) => void;
  statsUnavailable?: boolean;
};

const phoneHref = (phoneNumber: string | null): string | null => {
  const raw = String(phoneNumber ?? "").trim();
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  return `tel:${raw.startsWith("+") ? "+" : ""}${digits}`;
};

export function TeamAttentionPanel({
  items,
  onOpenDetail,
  statsUnavailable = false,
}: TeamAttentionPanelProps) {
  const visibleItems = items.slice(0, 8);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-[0_14px_32px_rgba(120,53,15,0.07)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">
            Vyžaduje pozornost
          </div>
          <h3 className="mt-1 text-xl font-black text-slate-950">
            Koho teď kontaktovat
          </h3>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
          {items.length}
        </span>
      </div>

      {statsUnavailable ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-600">
          Doporučení se zobrazí po načtení týmových dat.
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900">
          <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <div className="text-sm font-bold">Nikdo teď nevyžaduje pozornost.</div>
            <div className="mt-0.5 text-xs font-semibold text-emerald-700">
              Tým je aktivní a drží tempo proti minulému měsíci.
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {visibleItems.map((item) => {
            const tel = phoneHref(item.phoneNumber);
            return (
              <article
                key={item.email}
                className="rounded-2xl border border-amber-100 bg-amber-50/45 px-3 py-3"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-950">
                      {item.name}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {item.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-800"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {tel ? (
                      <a
                        href={tel}
                        className="ui-focus inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        <PhoneCall className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                        Zavolat
                      </a>
                    ) : (
                      <span
                        title="Telefon není vyplněný"
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-400"
                      >
                        <PhoneCall className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                        Zavolat
                      </span>
                    )}
                    <a
                      href={`mailto:${item.email}`}
                      className="ui-focus inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                    >
                      <Mail className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                      Napsat
                    </a>
                    <button
                      type="button"
                      onClick={() => onOpenDetail(item.email)}
                      className="ui-focus inline-flex items-center gap-1.5 rounded-full bg-violet-700 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-violet-800"
                    >
                      <UserRoundSearch
                        className="h-3.5 w-3.5"
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                      Otevřít detail
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {hiddenCount > 0 ? (
            <div className="pt-1 text-center text-xs font-bold text-slate-500">
              A dalších {hiddenCount} členů týmu.
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
