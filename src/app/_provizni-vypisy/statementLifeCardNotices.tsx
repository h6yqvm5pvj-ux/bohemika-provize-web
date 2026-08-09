import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { coefficientSetLabel } from "@/app/lib/productFormulas/coefficientSets";
import { formatWholeMoney } from "./statementParsing";
import type {
  CoefficientOverrideInfo,
  MissingAcceleratedB36Warning,
} from "./statementTypes";

export type LifePremiumBaseNoticeKind =
  | "refresh-missing-original"
  | "mismatch"
  | "endorsement"
  | null;

export type LifePremiumBaseMismatchNotice = {
  statementAnnualPremium: number;
  systemAnnualPremium: number;
  systemMonthlyPremium: number;
  difference: number;
};

export type LifePremiumEndorsementNotice = {
  dateLabel: string;
  annualPremium: number;
  monthlyPremium: number;
  annualPremiumDelta: number;
};

export const lifePremiumBaseNoticeKind = ({
  hasPremiumMismatch,
  isRefreshMissingOriginal,
  hasPremiumIncrease,
  hasEndorsement,
}: {
  hasPremiumMismatch: boolean;
  isRefreshMissingOriginal: boolean;
  hasPremiumIncrease: boolean;
  hasEndorsement: boolean;
}): LifePremiumBaseNoticeKind => {
  if (!hasPremiumMismatch) return null;
  if (hasEndorsement) return "endorsement";
  if (hasPremiumIncrease) return null;
  return isRefreshMissingOriginal ? "refresh-missing-original" : "mismatch";
};

export function LifePremiumIncreaseNotice({
  annualPremiumIncrease,
}: {
  annualPremiumIncrease: number | null;
}) {
  if (annualPremiumIncrease === null) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-950">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">Pojistné navýšeno</div>
        <div className="mt-0.5 font-medium text-cyan-900">
          Řádek výpisu je provize za navýšení smlouvy. Základna {formatWholeMoney(annualPremiumIncrease)} Kč znamená navýšení pojistného o {formatWholeMoney(annualPremiumIncrease)} Kč ročně ({formatWholeMoney(annualPremiumIncrease / 12)} Kč měsíčně), ne celé nové pojistné.
        </div>
      </div>
    </div>
  );
}

export function LifeCoefficientOverrideNotice({
  override,
}: {
  override: CoefficientOverrideInfo | null;
}) {
  if (!override) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">
          Výpis sedí na {coefficientSetLabel(override.coefficientSet)}
        </div>
        <div className="mt-0.5 font-medium text-violet-900">
          Smlouva podle data používá {coefficientSetLabel(override.currentSet)}, ale vyplacené částky ve výpisu jednoznačně odpovídají sadě {coefficientSetLabel(override.coefficientSet)}. Při zápisu výpisu uložím ke smlouvě výjimku a přepočítám položky podle výpisu.
        </div>
      </div>
    </div>
  );
}

export function LifePremiumBaseNotice({
  kind,
  mismatch,
  monthlyDifference,
  endorsement,
}: {
  kind: LifePremiumBaseNoticeKind;
  mismatch: LifePremiumBaseMismatchNotice | null;
  monthlyDifference: number | null;
  endorsement: LifePremiumEndorsementNotice | null;
}) {
  if (!kind || !mismatch) return null;

  if (kind === "refresh-missing-original") {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        <div>
          <div className="font-bold">REFRESH bez původní smlouvy v systému</div>
          <div className="mt-0.5 font-medium text-sky-900">
            Výpis počítá se základnou {formatWholeMoney(mismatch.statementAnnualPremium)} Kč ročně ({formatWholeMoney(mismatch.statementAnnualPremium / 12)} Kč měsíčně). Smlouva je uložená jako REFRESH bez původní smlouvy v systému, takže kalkulační základna je jen orientační a musí se převzít z výpisu.
          </div>
        </div>
      </div>
    );
  }

  if (kind === "mismatch") {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        <div>
          <div className="font-bold">Nesoulad ročního pojistného</div>
          <div className="mt-0.5 font-medium text-amber-900">
            Výpis počítá se základnou {formatWholeMoney(mismatch.statementAnnualPremium)} Kč ročně ({formatWholeMoney(mismatch.statementAnnualPremium / 12)} Kč měsíčně), ale systém eviduje {formatWholeMoney(mismatch.systemAnnualPremium)} Kč ročně ({formatWholeMoney(mismatch.systemMonthlyPremium)} Kč měsíčně). Rozdíl pojistného je {formatWholeMoney(mismatch.difference)} Kč ročně ({formatWholeMoney(monthlyDifference ?? 0)} Kč měsíčně).
          </div>
        </div>
      </div>
    );
  }

  if (!endorsement) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">Základna odpovídá dodatku smlouvy</div>
        <div className="mt-0.5 font-medium text-sky-900">
          Výpis počítá se základnou {formatWholeMoney(mismatch.statementAnnualPremium)} Kč ročně ({formatWholeMoney(mismatch.statementAnnualPremium / 12)} Kč měsíčně). Aktuální hlavní záznam má {formatWholeMoney(mismatch.systemAnnualPremium)} Kč ročně, ale dohledaný dodatek od {endorsement.dateLabel} eviduje {Number.isFinite(endorsement.annualPremium) ? formatWholeMoney(endorsement.annualPremium) : "—"} Kč ročně{Number.isFinite(endorsement.monthlyPremium) ? ` (${formatWholeMoney(endorsement.monthlyPremium)} Kč měsíčně)` : ""}{Number.isFinite(endorsement.annualPremiumDelta) && endorsement.annualPremiumDelta !== 0 ? `, změna ${formatWholeMoney(endorsement.annualPremiumDelta)} Kč ročně` : ""}.
        </div>
      </div>
    </div>
  );
}

export function LifeClientCardCommissionNotice({
  hasMissingCommission,
  hasDeferredCommission,
}: {
  hasMissingCommission: boolean;
  hasDeferredCommission: boolean;
}) {
  if (!hasMissingCommission && !hasDeferredCommission) return null;

  return (
    <>
      {hasMissingCommission && (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        <div>
          <div className="font-bold">Chybí provize B0301 (karta klienta)</div>
          <div className="mt-0.5 font-medium text-amber-900">
            Ve výpisu je A101, ale B0301 zde není. Pokud karta klienta nebyla zpracována do výplatního termínu, očekáváme B0301 obvykle po 3 měsících.
          </div>
        </div>
      </div>
      )}
      {hasDeferredCommission && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
          <div>
            <div className="font-bold">Doplacená B0301 po kartě klienta</div>
            <div className="mt-0.5 font-medium text-emerald-900">
              Ve výpisu je pouze B0301 bez A101. Beru ji jako pozdější doplacení provize po zpracování karty klienta; částka se pořád kontroluje proti Bohemka.App.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AcceleratedB36WarningNotice({
  warning,
}: {
  warning: MissingAcceleratedB36Warning | null;
}) {
  if (!warning) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <span>Zrychlený režim: {warning.detail}</span>
    </div>
  );
}
