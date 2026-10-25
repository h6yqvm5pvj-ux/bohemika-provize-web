import {
  ArrowLeftRight,
  BadgeCheck,
  Calculator,
  CircleAlert,
  FileText,
  Info,
  ListChecks,
  RotateCcw,
  UserRound,
  Wallet,
} from "lucide-react";

// Split only at known section boundaries: amounts, dates and abbreviations such
// as “Kar. 6” must stay together. Older or unfamiliar details remain visible.
const sectionBoundary = /(?<=[.!?])\s+(?=(?:Důvod rozdílu:|Kariérní |Výpis uvádí |(?:smlouva|meziprovize) je uložená |Základna výpisu |Priorita kontroly:|Součást opravného výpisu:))/u;
const payoutComparison = /^([^:]+): vyplaceno ([-+]?\d[\d\s.,]*\s*Kč), systém ([-+]?\d[\d\s.,]*\s*Kč|—), rozdíl ([-+]?\d[\d\s.,]*\s*Kč|—)\.(?:\s|$)/u;

function explanationPoint(text: string) {
  if (text.startsWith("Důvod rozdílu:")) {
    return {
      title: "Co se liší",
      text: text.replace(/^Důvod rozdílu:\s*/, ""),
      Icon: CircleAlert,
      tone: "border-amber-100 bg-amber-50 text-amber-700",
    };
  }
  if (text.startsWith("Kariérní stupeň sedí")) {
    return {
      title: "Kariérní stupeň souhlasí",
      text: text.replace(/^Kariérní stupeň sedí:\s*/, ""),
      Icon: BadgeCheck,
      tone: "border-emerald-100 bg-emerald-50 text-emerald-700",
    };
  }
  if (/^(?:Kariérní |Výpis uvádí |(?:smlouva|meziprovize) je uložená )/u.test(text)) {
    return {
      title: "Kariérní stupeň",
      text,
      Icon: UserRound,
      tone: "border-amber-100 bg-amber-50 text-amber-700",
    };
  }
  if (text.startsWith("Základna výpisu ")) {
    return {
      title: "Základna ve výpisu",
      text: text.replace(/^Základna výpisu\s*/, ""),
      Icon: Calculator,
      tone: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  if (text.startsWith("Priorita kontroly:")) {
    return {
      title: "Doporučený další krok",
      text: text.replace(/^Priorita kontroly:\s*/, ""),
      Icon: ListChecks,
      tone: "border-violet-100 bg-violet-50 text-violet-700",
    };
  }
  if (text.startsWith("Součást opravného výpisu:")) {
    return {
      title: "Opravný výpis",
      text: text.replace(/^Součást opravného výpisu:\s*/, ""),
      Icon: RotateCcw,
      tone: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  return {
    title: "Podrobnosti položky",
    text,
    Icon: Info,
    tone: "border-slate-200 bg-slate-50 text-slate-600",
  };
}

export function PayoutDifferenceExplanationContent({ detail, reasonLabel }: {
  detail: string;
  reasonLabel: string;
}) {
  const normalizedDetail = detail.replace(/\s+/g, " ").trim();
  const comparison = normalizedDetail.match(payoutComparison);
  const remainingDetail = comparison
    ? normalizedDetail.slice(comparison[0].length).trim()
    : normalizedDetail;
  const points = remainingDetail.split(sectionBoundary).filter(Boolean).map(explanationPoint);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {comparison && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700">
            <FileText size={13} aria-hidden="true" />
            {comparison[1]}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
          <CircleAlert size={13} aria-hidden="true" />
          {reasonLabel}
        </span>
      </div>

      {comparison && (
        <dl className="grid gap-2.5 sm:grid-cols-3" aria-label="Porovnání částek provize">
          {[
            { label: "Výpočet aplikace", amount: comparison[3], Icon: Calculator, difference: false },
            { label: "Vyplaceno ve výpisu", amount: comparison[2], Icon: Wallet, difference: false },
            { label: "Rozdíl oproti aplikaci", amount: comparison[4], Icon: ArrowLeftRight, difference: true },
          ].map(({ label, amount, Icon, difference }) => (
            <div key={label} className={`min-w-0 rounded-2xl border p-3.5 ${difference ? "border-amber-200 bg-amber-50/80 text-amber-950" : "border-slate-200/80 bg-slate-50/70 text-slate-900"}`}>
              <dt className={`flex items-center gap-1.5 text-[11px] font-semibold ${difference ? "text-amber-800" : "text-slate-500"}`}>
                <Icon size={14} className="shrink-0" aria-hidden="true" />
                {label}
              </dt>
              <dd className="mt-2 break-words text-xl font-bold tracking-tight tabular-nums">{amount}</dd>
            </div>
          ))}
        </dl>
      )}

      {points.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white" aria-label="Odůvodnění nesrovnalosti">
          {points.map(({ title, text, Icon, tone }, index) => (
            <li key={`${index}-${title}`} className="flex items-start gap-3 px-4 py-3.5">
              <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${tone}`}>
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
                <p className="mt-1 break-words text-sm leading-6 text-slate-600">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
