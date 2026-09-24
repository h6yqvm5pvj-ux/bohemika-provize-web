import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from "lucide-react";
import type { RefreshBaseReview } from "./statementRefreshBaseReview";

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

export function NeonRefreshBaseNotice({review, onConfirm, saving = false, error}: {
  review: RefreshBaseReview;
  onConfirm?: () => void;
  saving?: boolean;
  error?: string | null;
}) {
  if (!review) return null;
  const confirmed = review.status === "confirmed";
  const Icon = confirmed ? CheckCircle2 : Info;
  const canConfirm = !confirmed && review.statementRiskAnnual != null && Boolean(onConfirm);
  return <div aria-busy={saving} className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${confirmed ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-sky-200 bg-sky-50 text-sky-950"}`}>
    <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <div>
      <div className="font-bold">{review.label}</div>
      <div className="mt-0.5 font-medium">
        {confirmed ? <>
          Riziková základna{review.annual != null ? ` ${formatWholeMoney(review.annual)} Kč ročně` : ""} je potvrzená položkou A101/B0301
          {review.statementNumber ? ` z výpisu ${review.statementNumber}` : " z výpisu"}{review.statementDate ? ` ze dne ${review.statementDate}` : ""}.
          {" "}Případný rozdíl u následné provize kontrolujeme samostatně podle jejího kódu.
        </> : review.status === "calculated" ? <>
          Základna{review.annual != null ? ` ${formatWholeMoney(review.annual)} Kč ročně` : ""} je vypočtená z původní smlouvy. Čeká na ověření rizikovou položkou A101/B0301 z výpisu.
        </> : <>
          Základna tohoto refreshe zatím není doložená. Částky provizí zůstávají ve výpisu; kontrolu proti předběžnému výpočtu zatím nevyhodnocujeme jako chybu.
        </>}
        {!confirmed && (review.statementRiskAnnual != null ? <>
          {" "}Tento výpis obsahuje rizikovou základnu {formatWholeMoney(review.statementRiskAnnual)} Kč ročně.
          {canConfirm ? " Použitím této základny přepočítáš provize u smlouvy." : " Potvrzení se uloží při zpracování výpisu."}
        </> : <>
          {" "}Pro potvrzení potřebujeme výpis s rizikovou A101/B0301. A201 ani samotná B101 základnu refreshe nepotvrzují.
        </>)}
      </div>
      {canConfirm && <button
        type="button"
        onClick={onConfirm}
        disabled={saving}
        className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-wait disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />}
        {saving ? "Ukládám a přepočítávám…" : "Použít základnu z výpisu a přepočítat"}
      </button>}
      {error && <p role="alert" className="mt-2 font-semibold text-rose-800">{error}</p>}
    </div>
  </div>;
}

export function LifeCommissionBaseDifferenceNotice({differences}: {differences: {label: string; statementAnnualPremiumBase: number; systemAnnualPremiumBase: number}[]}) {
  if (differences.length === 0) return null;
  return <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <div>
      <div className="font-bold">Rozdíl základny u konkrétní provize</div>
      {differences.map((difference,index) => <div key={index} className="mt-0.5 font-medium">
        {difference.label}: výpis {formatWholeMoney(difference.statementAnnualPremiumBase)} Kč ročně, výpočet smlouvy {formatWholeMoney(difference.systemAnnualPremiumBase)} Kč ročně.
      </div>)}
      <div className="mt-1">Tento rozdíl je potřeba ověřit u dané položky. Sám o sobě není důvodem ke změně rizikové základny celé smlouvy.</div>
    </div>
  </div>;
}

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
