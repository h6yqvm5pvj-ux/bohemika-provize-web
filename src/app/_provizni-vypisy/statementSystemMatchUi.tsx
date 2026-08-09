import type { Position, Product } from "@/app/types/domain";

import {
  formatSystemDate,
  paymentAmountWithFrequencyLabel,
  productLabelFromKey,
} from "./statementParsing";
import type {
  ContractMatchScope,
  ContractMatchState,
  ContractTimelinePositionMismatch,
  MatchedSystemContract,
} from "./statementTypes";

export type SystemMatchPresentation = {
  matchedSystemContract: (match: ContractMatchState | null) => MatchedSystemContract | null;
  systemMatchHistoryLabel: (match: ContractMatchState | null) => string;
  dedupeEquivalentSystemContracts: (
    contracts: MatchedSystemContract[]
  ) => MatchedSystemContract[];
  systemMatchHasSingleFamilyHistory: (match: ContractMatchState | null) => boolean;
  sortSystemContractTimeline: (
    contracts: MatchedSystemContract[]
  ) => MatchedSystemContract[];
  statementProductMatchesSystemProduct: (
    expectedProductKey: Product | null | undefined,
    systemProductKey: Product | null | undefined
  ) => boolean;
  systemContractTimelinePositionMismatch: (
    contract: MatchedSystemContract | null | undefined
  ) => ContractTimelinePositionMismatch | null;
  systemContractIsEndorsement: (
    contract: MatchedSystemContract | null | undefined
  ) => boolean;
  positionLabel: (position: Position | null | undefined) => string;
  systemContractPosition: (
    contract: MatchedSystemContract | null | undefined
  ) => Position | null;
};

export function SystemMatchBadge({
  match,
  scope = "my",
  presentation,
}: {
  match: ContractMatchState | null;
  scope?: ContractMatchScope;
  presentation: SystemMatchPresentation;
}) {
  if (!match || match.status === "idle") return null;
  const resolvedContract = presentation.matchedSystemContract(match);
  const historyLabel = presentation.systemMatchHistoryLabel(match);

  const badgeClass =
    match.status === "matched"
      ? resolvedContract
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-900"
      : match.status === "loading"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : match.status === "not_found"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-rose-200 bg-rose-50 text-rose-800";

  const label =
    match.status === "matched"
      ? resolvedContract
        ? historyLabel
          ? `Spárováno s historií (${historyLabel})`
          : "Spárováno v systému"
        : `Více shod v systému (${match.contracts.length})`
      : match.status === "loading"
        ? scope === "team"
          ? "Páruji v týmu"
          : scope === "tip"
            ? "Páruji TIP"
            : "Páruji se systémem"
        : match.status === "not_found"
          ? scope === "team"
            ? "Nenalezeno v týmu"
            : scope === "tip"
              ? "Nenalezeno přes TIP"
              : "Nenalezeno v mých smlouvách"
          : "Ověření nedokončeno";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
      {label}
    </span>
  );
}

export function SystemMatchPanel({
  match,
  expectedProductKey,
  selectedContract,
  scope = "my",
  presentation,
}: {
  match: ContractMatchState | null;
  expectedProductKey?: Product | null;
  selectedContract?: MatchedSystemContract | null;
  scope?: ContractMatchScope;
  presentation: SystemMatchPresentation;
}) {
  if (!match || match.status === "idle") return null;

  if (match.status === "loading") {
    return (
      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
        {scope === "team"
          ? "Páruji číslo smlouvy s týmovými smlouvami."
          : scope === "tip"
            ? "Páruji číslo smlouvy přes uloženou TIP vazbu."
            : "Páruji číslo smlouvy s mými uloženými smlouvami."}
      </div>
    );
  }

  if (match.status === "not_found") return null;

  if (match.status === "error") {
    return (
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
        Ověření se systémem selhalo: {match.error}
      </div>
    );
  }

  const resolvedContract = selectedContract ?? presentation.matchedSystemContract(match);
  const uniqueContracts =
    match.status === "matched" ? presentation.dedupeEquivalentSystemContracts(match.contracts) : [];
  const hasFamilyHistory = presentation.systemMatchHasSingleFamilyHistory(match);
  const displayContracts =
    hasFamilyHistory && resolvedContract
      ? [
          resolvedContract,
          ...presentation.sortSystemContractTimeline(uniqueContracts).filter(
            (contract) => contract.id !== resolvedContract.id
          ),
        ]
      : uniqueContracts.length > 0
        ? uniqueContracts
        : match.contracts;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
      {displayContracts.map((contract) => {
        const productMismatch =
          Boolean(expectedProductKey && contract.productKey) &&
          !presentation.statementProductMatchesSystemProduct(
            expectedProductKey,
            contract.productKey
          );
        const timelinePositionMismatch = presentation.systemContractTimelinePositionMismatch(contract);
        const inputAmount = Number(
          presentation.systemContractIsEndorsement(contract)
            ? contract.newInputAmount ?? contract.effectiveInputAmount ?? contract.inputAmount
            : contract.inputAmount
        );
        const isSelected = resolvedContract?.id === contract.id;
        const contractLabel = hasFamilyHistory
          ? isSelected
            ? "Použitý záznam"
            : presentation.systemContractIsEndorsement(contract)
              ? "Dodatek v historii"
              : "Původní záznam v historii"
          : "Shoda v systému";

        return (
          <div key={`${contract.adviserEmail ?? "owner"}-${contract.id}`}>
            <div className="font-bold">
              {contractLabel}: {contract.clientName || "klient bez názvu"}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-emerald-900">
              <span>{productLabelFromKey(contract.productKey)}</span>
              <span>Poradce: {contract.adviserName || contract.adviserEmail || "—"}</span>
              <span>Pozice: {presentation.positionLabel(presentation.systemContractPosition(contract))}</span>
              <span>
                Pojistné:{" "}
                {Number.isFinite(inputAmount)
                  ? paymentAmountWithFrequencyLabel(inputAmount, contract.frequencyRaw)
                  : "—"}
              </span>
              <span>Sjednáno: {formatSystemDate(contract.contractSignedDate)}</span>
              <span>Počátek: {formatSystemDate(contract.policyStartDate)}</span>
            </div>
            {productMismatch && (
              <div className="mt-1 font-semibold text-amber-900">
                Pozor: produkt ve výpisu nesedí s produktem uložené smlouvy.
              </div>
            )}
            {timelinePositionMismatch && (
              <div className="mt-1 font-semibold text-amber-900">
                Pozor: uložená pozice {presentation.positionLabel(timelinePositionMismatch.storedPosition)} nesedí s historií kariéry ({presentation.positionLabel(timelinePositionMismatch.timelinePosition)} k datu sjednání).
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
