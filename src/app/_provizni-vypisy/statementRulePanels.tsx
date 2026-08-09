"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, ListChecks, ReceiptText, X } from "lucide-react";

import {
  COMMISSION_CODE_RULES,
  TROY_OUNCE_COMMISSION_CODE_RULES,
  normalizedRowText,
} from "./statementParsing";
import type {
  CommissionCodeCategory,
  CommissionCodeRule,
  ContractStatusCategory,
  ContractStatusRule,
  ParsedStatement,
} from "./statementTypes";

const COMMISSION_CODE_CATEGORY_ORDER: CommissionCodeCategory[] = [
  "closing",
  "closingRole",
  "subsequent",
  "installment",
  "unexpected",
  "increase",
  "tip",
  "adjustment",
  "office",
  "other",
];

const commissionCodeCategoryLabel = (category: CommissionCodeCategory): string => {
  switch (category) {
    case "closing":
      return "Uzavření";
    case "closingRole":
      return "Uzavření / role";
    case "subsequent":
      return "Následné provize";
    case "installment":
      return "Splátky provize";
    case "unexpected":
      return "Neočekávané provize";
    case "increase":
      return "Navýšení";
    case "tip":
      return "TIP";
    case "adjustment":
      return "Korekce";
    case "office":
      return "Ostatní platby";
    case "troyOunce":
      return "Troyská unce";
    default:
      return "Ostatní";
  }
};

const commissionCodeCategoryClass = (category: CommissionCodeCategory): string => {
  switch (category) {
    case "closing":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "closingRole":
      return "border-teal-200 bg-teal-50 text-teal-800";
    case "subsequent":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "installment":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "unexpected":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "increase":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "tip":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "adjustment":
    case "office":
      return "border-orange-200 bg-orange-50 text-orange-900";
    case "troyOunce":
      return "border-purple-200 bg-purple-50 text-purple-900";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const contractStatusCategoryLabel = (category: ContractStatusCategory): string => {
  switch (category) {
    case "active":
      return "Aktivní";
    case "pending":
      return "Nová / čekárna";
    case "matured":
      return "Dožitá";
    case "transferred":
      return "Převedená";
    case "storno":
      return "Storno";
    case "invalid":
      return "Chybná";
    default:
      return "Neznámá";
  }
};

const contractStatusCategoryClass = (category: ContractStatusCategory): string => {
  switch (category) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending":
    case "transferred":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "matured":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "storno":
    case "invalid":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
};

const commissionCodeRuleMatches = (
  rule: Pick<CommissionCodeRule, "matchers">,
  code: string
): boolean => rule.matchers.some((matcher) => matcher.test(code));

const statementCommissionCodeSet = (statement: ParsedStatement): string[] => {
  const codes = new Set<string>();
  const addCode = (value: string | null | undefined) => {
    const code = normalizedRowText(value);
    if (code) codes.add(code);
  };

  statement.commissionRows.forEach((row) => addCode(row.type));
  statement.deductionRows.forEach((row) => addCode(row.type));
  statement.stornoRows.forEach((row) => addCode(row.type));
  statement.managerCommissions.forEach((advisor) => {
    advisor.rows.forEach((row) => addCode(row.type));
  });

  return [...codes].sort((left, right) => left.localeCompare(right, "cs"));
};

const commissionCodeRuleUsedCodes = (
  rule: CommissionCodeRule,
  usedCodes: string[]
): string[] => usedCodes.filter((code) => commissionCodeRuleMatches(rule, code));

function StatementLegendModal({
  title,
  description,
  eyebrow,
  children,
  onClose,
}: {
  title: string;
  description: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/75 bg-white/90 shadow-[0_30px_90px_rgba(15,23,42,0.28)] ring-1 ring-violet-100/80 backdrop-blur-xl"
      >
        <div className="flex flex-col gap-4 border-b border-violet-100/80 bg-white/60 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wide text-violet-700">
              {eyebrow}
            </div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.2)] transition hover:bg-black"
            aria-label="Zavřít"
          >
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </section>
    </div>
  );
}

export function CommissionCodeRulesPanel({ statement }: { statement: ParsedStatement }) {
  const [open, setOpen] = useState(false);
  const usedCodes = statementCommissionCodeSet(statement);
  const groupedRules = COMMISSION_CODE_CATEGORY_ORDER.flatMap((category) => {
    const rules = COMMISSION_CODE_RULES.filter((rule) => rule.category === category);
    return rules.length > 0 ? [{ category, rules }] : [];
  });
  const ruleCount = COMMISSION_CODE_RULES.length + TROY_OUNCE_COMMISSION_CODE_RULES.length;
  const usedRuleCount = COMMISSION_CODE_RULES.filter(
    (rule) => commissionCodeRuleUsedCodes(rule, usedCodes).length > 0
  ).length;
  const unknownUsedCodes = usedCodes.filter((code) => {
    const knownInGeneral = COMMISSION_CODE_RULES.some((rule) =>
      commissionCodeRuleMatches(rule, code)
    );
    const knownInTroyOunce = TROY_OUNCE_COMMISSION_CODE_RULES.some((rule) =>
      commissionCodeRuleMatches(rule, code)
    );
    return !knownInGeneral && !knownInTroyOunce;
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex min-h-28 w-full items-center justify-between gap-4 overflow-hidden rounded-lg border border-white/70 bg-white/75 px-4 py-4 text-left shadow-[0_16px_36px_rgba(15,23,42,0.07)] ring-1 ring-violet-100/70 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_22px_48px_rgba(76,29,149,0.12)]"
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-violet-500/60" aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
            <ReceiptText className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-black tracking-tight text-slate-950">Kódy provizí</h3>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-600">
              Legenda provizních položek a zvýraznění kódů z tohoto výpisu.
            </p>
          </div>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-sm font-black text-slate-950">{ruleCount} pravidel</span>
          {usedRuleCount > 0 && (
            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
              {usedRuleCount} nalezeno
            </span>
          )}
          <ExternalLink className="h-4 w-4 text-violet-700 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.2} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <StatementLegendModal
          eyebrow="Legenda výpisu"
          title="Kódy provizí"
          description="Kódy použité v tomto výpisu jsou zvýrazněné. Troyská unce má vlastní odlišnosti významu kódů."
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm font-bold text-slate-700">
              <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-800 ring-1 ring-violet-100">
                {ruleCount} pravidel
              </span>
              {usedCodes.length > 0 && (
                <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">
                  {usedCodes.length} kódů ve výpisu
                </span>
              )}
              {usedRuleCount > 0 && (
                <span className="rounded-full bg-slate-950 px-3 py-1 text-white">
                  {usedRuleCount} nalezeno
                </span>
              )}
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {groupedRules.map(({ category, rules }) => (
                <div key={category} className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ring-1 ring-violet-100/60">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${commissionCodeCategoryClass(category)}`}>
                      {commissionCodeCategoryLabel(category)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{rules.length} pravidel</span>
                  </div>
                  <div className="space-y-2">
                    {rules.map((rule) => {
                      const usedRuleCodes = commissionCodeRuleUsedCodes(rule, usedCodes);

                      return (
                        <div key={`${category}-${rule.codes}`} className="grid gap-1 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-sm font-bold text-slate-950">{rule.codes}</span>
                            {usedRuleCodes.length > 0 && (
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-100">
                                ve výpisu: {usedRuleCodes.join(", ")}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-700">{rule.label}</div>
                          {rule.note && <div className="text-xs text-slate-500">{rule.note}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-violet-100 bg-violet-50/70 px-3 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${commissionCodeCategoryClass("troyOunce")}`}>
                  Troyská unce - odlišnosti významu kódů
                </span>
                <span className="text-xs font-semibold text-purple-900">Produkty TU_*</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {TROY_OUNCE_COMMISSION_CODE_RULES.map((rule) => {
                  const usedRuleCodes = commissionCodeRuleUsedCodes(rule, usedCodes);

                  return (
                    <div key={`troy-${rule.codes}`} className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 ring-1 ring-violet-100/70">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-sm font-bold text-slate-950">{rule.codes}</span>
                        {usedRuleCodes.length > 0 && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900 ring-1 ring-violet-100">
                            ve výpisu
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{rule.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {unknownUsedCodes.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <span className="font-bold">Nezařazené kódy ve výpisu: </span>
                {unknownUsedCodes.join(", ")}
              </div>
            )}
          </div>
        </StatementLegendModal>
      )}
    </>
  );
}

export function ContractStatusRulesPanel({ rules }: { rules?: ContractStatusRule[] }) {
  const [open, setOpen] = useState(false);
  const safeRules = rules ?? [];
  if (safeRules.length === 0) return null;

  const groupedRules = safeRules.reduce<Record<ContractStatusCategory, ContractStatusRule[]>>(
    (groups, rule) => {
      groups[rule.category].push(rule);
      return groups;
    },
    {
      active: [],
      pending: [],
      matured: [],
      transferred: [],
      storno: [],
      invalid: [],
      unknown: [],
    }
  );
  const visibleGroups = Object.entries(groupedRules).filter(([, groupRules]) => groupRules.length > 0) as [
    ContractStatusCategory,
    ContractStatusRule[],
  ][];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex min-h-28 w-full items-center justify-between gap-4 overflow-hidden rounded-lg border border-white/70 bg-white/75 px-4 py-4 text-left shadow-[0_16px_36px_rgba(15,23,42,0.07)] ring-1 ring-violet-100/70 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_22px_48px_rgba(76,29,149,0.12)]"
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-violet-500/60" aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
            <ListChecks className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-black tracking-tight text-slate-950">Kódy stavů smluv</h3>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-600">
              Obecná pravidla pro stav smlouvy při importu a ČPP synchronizaci.
            </p>
          </div>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-sm font-black text-slate-950">{safeRules.length} kódů</span>
          <ExternalLink className="h-4 w-4 text-violet-700 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.2} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <StatementLegendModal
          eyebrow="Import a stav smlouvy"
          title="Kódy stavů smluv"
          description="Konkrétní stav smlouvy se při ostrém importu vezme z našeho systému nebo ČPP synchronizace. Tohle je obecná legenda pravidel."
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm font-bold text-slate-700">
              <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-800 ring-1 ring-violet-100">
                {safeRules.length} kódů celkem
              </span>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {visibleGroups.map(([category, groupRules]) => (
                <div key={category} className="rounded-lg border border-white/80 bg-white/75 px-3 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ring-1 ring-violet-100/60">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${contractStatusCategoryClass(category)}`}>
                      {contractStatusCategoryLabel(category)}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{groupRules.length} kódů</span>
                  </div>
                  <div className="space-y-2">
                    {groupRules.map((rule) => (
                      <div key={rule.code} className="grid gap-1 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-sm font-bold text-slate-950">{rule.code}</span>
                          <span className="text-sm text-slate-700">{rule.label}</span>
                        </div>
                        <div className="text-xs text-slate-500">{rule.importDecision}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </StatementLegendModal>
      )}
    </>
  );
}
