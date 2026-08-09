import { AlertTriangle } from "lucide-react";

import type { Position } from "@/app/types/domain";

import type { ContractTimelinePositionMismatch } from "./statementTypes";

type CareerMismatch = {
  careers: Array<{ raw: string; position: Position }>;
  systemPosition: Position | null;
  mismatched: boolean;
};

const positionLabel = (position: Position | null | undefined): string => {
  if (!position) return "—";
  const advisorMatch = position.match(/^poradce(\d+)$/);
  if (advisorMatch) return `Poradce ${advisorMatch[1]}`;
  const managerMatch = position.match(/^manazer(\d+)$/);
  if (managerMatch) return `Manažer ${managerMatch[1]}`;
  return position;
};

const statementCareerPositionsLabel = (careers: CareerMismatch["careers"]): string =>
  careers.map((career) => `${career.raw} (${positionLabel(career.position)})`).join(", ");

export function StatementCorrectionWarning({
  details,
  label,
}: {
  details: string[];
  label: string | null;
}) {
  if (details.length === 0) return null;

  const title =
    label === "Oprava kariérního stupně" || label === "Opravná provize: kariérní stupeň"
      ? "Pozor: smlouva byla zprovizována na jiném kariérním stupni, než by měla"
      : label === "Opravná provize"
        ? "Pozor: tento výpis obsahuje opravu provize"
        : "Pozor: provize byla opravena navazujícím výpisem";

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">{title}</div>
        <div className="mt-0.5 space-y-1 font-medium text-amber-900">
          {details.map((detail) => (
            <div key={detail}>{detail}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CareerMismatchWarning({
  careerCheck,
  hasAmountDifference,
}: {
  careerCheck: CareerMismatch | null;
  hasAmountDifference: boolean;
}) {
  if (
    !careerCheck ||
    careerCheck.careers.length === 0 ||
    !careerCheck.systemPosition ||
    !careerCheck.mismatched
  ) {
    return null;
  }

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">Nesoulad kariérního stupně</div>
        <div className="mt-0.5 font-medium text-rose-900">
          Firma zprovizovala smlouvu na Kar. {statementCareerPositionsLabel(careerCheck.careers)}, ale podle systému má být {positionLabel(careerCheck.systemPosition)}.{" "}
          {hasAmountDifference
            ? "Kvůli tomu vznikl rozdíl v provizi."
            : "To může způsobit rozdíl v provizi."}{" "}
          Doporučuju prověřit výpis, případně zkontrolovat další výpis, jestli proběhlo odúčtování a nová výplata ve správném stupni.
        </div>
      </div>
    </div>
  );
}

export function ContractTimelinePositionWarning({
  mismatch,
}: {
  mismatch: ContractTimelinePositionMismatch | null;
}) {
  if (!mismatch) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">Pozice smlouvy nesedí s historií kariéry</div>
        <div className="mt-0.5 font-medium text-amber-900">
          Na smlouvě je uložená pozice {positionLabel(mismatch.storedPosition)}, ale podle historie kariéry k datu sjednání {mismatch.signedDateLabel} má být {positionLabel(mismatch.timelinePosition)}. Nejdřív zkontroluj a případně oprav uloženou smlouvu; teprve potom má smysl řešit rozdíl proti proviznímu výpisu.
        </div>
      </div>
    </div>
  );
}
