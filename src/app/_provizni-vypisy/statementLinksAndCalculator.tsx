"use client";

import { useContext } from "react";
import { ExternalLink, Plus } from "lucide-react";

import {
  hasSjednatelExtranetFromDetailLink,
  normalizeExternalHref,
  normalizeText,
} from "./statementParsing";
import {
  BohemkaContractDetailModalContext,
  StatementCalculatorPrefillContext,
  type StatementCalculatorPrefill,
} from "./statementPresentation";
import type {
  MatchedSystemContract,
} from "./statementTypes";

export function ContractDetailLink({
  href,
  compact = false,
}: {
  href: string | null | undefined;
  compact?: boolean;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          : "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-300 hover:bg-slate-50"
      }
    >
      <ExternalLink className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden="true" />
      {compact ? "MAXX" : "Otevřít smlouvu v MAXX"}
    </a>
  );
}

export const firstContractDetailUrl = (
  rows: Array<{ detailUrl?: string | null }>
): string | null => rows.find((row) => row.detailUrl)?.detailUrl ?? null;

const SJEDNATEL_EXTRANET_REDIRECT_URL =
  "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx";
const SJEDNATEL_EXTRANET_DEFAULT_ENTITY_TYPE_ID = "43";

const normalizeSjednatelExtranetParam = (
  value: string | number | null | undefined
): string | null => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
};

const buildSjednatelExtranetDetailUrl = (
  entityId: string | number | null | undefined,
  entityTypeId: string | number | null | undefined = SJEDNATEL_EXTRANET_DEFAULT_ENTITY_TYPE_ID
): string | null => {
  const normalizedEntityId = normalizeSjednatelExtranetParam(entityId);
  const normalizedEntityTypeId =
    normalizeSjednatelExtranetParam(entityTypeId) ?? SJEDNATEL_EXTRANET_DEFAULT_ENTITY_TYPE_ID;
  if (!normalizedEntityId || !normalizedEntityTypeId) return null;

  const params = new URLSearchParams({
    type: "detail",
    p_EntityTypeID: normalizedEntityTypeId,
    p_EntityID: normalizedEntityId,
  });
  return `${SJEDNATEL_EXTRANET_REDIRECT_URL}?${params.toString()}`;
};

const extranetEntityIdFromContractDetailUrl = (
  detailUrl: string | null | undefined
): string | null => {
  const normalizedUrl = normalizeExternalHref(detailUrl);
  if (!normalizedUrl) return null;

  try {
    return normalizeSjednatelExtranetParam(
      new URL(normalizedUrl).searchParams.get("sml")
    );
  } catch {
    return null;
  }
};

export const firstSjednatelExtranetUrl = (
  rows: Array<{ detailUrl?: string | null; product?: string | null }>,
  systemContract: MatchedSystemContract | null = null
): string | null => {
  const statementRow = rows.find((row) => hasSjednatelExtranetFromDetailLink(row.product));
  const statementUrl = buildSjednatelExtranetDetailUrl(
    extranetEntityIdFromContractDetailUrl(statementRow?.detailUrl)
  );
  if (statementUrl) return statementUrl;

  return buildSjednatelExtranetDetailUrl(
    systemContract?.cppExtranetEntityId,
    systemContract?.cppExtranetEntityTypeId
  );
};

const bohemkaContractDetailHref = (
  contract: MatchedSystemContract | null | undefined
): string | null => {
  const ownerEmail = normalizeText(contract?.adviserEmail);
  const entryId = normalizeText(contract?.id);
  if (!ownerEmail || !entryId) return null;
  return `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}?from=commission-statements&embedded=1`;
};

export function BohemkaContractDetailLink({
  contract,
  compact = false,
}: {
  contract: MatchedSystemContract | null | undefined;
  compact?: boolean;
}) {
  const href = bohemkaContractDetailHref(contract);
  const openDetailModal = useContext(BohemkaContractDetailModalContext);
  if (!href) return null;

  const contractNumber = normalizeText(contract?.contractNumber);
  const clientName = normalizeText(contract?.clientName);
  const openModal = () => {
    openDetailModal?.({
      href,
      title: contractNumber ? `Smlouva ${contractNumber}` : "Detail smlouvy",
      subtitle: clientName || null,
    });
  };

  return (
    <button
      type="button"
      onClick={openModal}
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800 hover:border-violet-300 hover:bg-violet-100"
          : "inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 hover:border-violet-300 hover:bg-violet-100"
      }
    >
      <ExternalLink className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden="true" />
      {compact ? "Detail" : "Detail smlouvy"}
    </button>
  );
}


export function StatementCalculatorPrefillButton({
  prefill,
  compact = false,
  maxxHref,
}: {
  prefill: StatementCalculatorPrefill | null;
  compact?: boolean;
  maxxHref?: string | null;
}) {
  const openCalculatorPrefill = useContext(StatementCalculatorPrefillContext);
  if (!prefill || !openCalculatorPrefill) return null;

  const openContractForm = () => {
    if (maxxHref) window.open(maxxHref, "_blank", "noopener,noreferrer");
    openCalculatorPrefill(prefill);
  };

  return (
    <button
      type="button"
      onClick={openContractForm}
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800 hover:border-violet-300 hover:bg-violet-100"
          : "inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 hover:border-violet-300 hover:bg-violet-100"
      }
    >
      <Plus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden="true" />
      Přidat smlouvu
    </button>
  );
}

export function SjednatelExtranetLink({
  href,
  compact = false,
}: {
  href: string | null | undefined;
  compact?: boolean;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-100"
          : "inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:border-sky-300 hover:bg-sky-100"
      }
    >
      <ExternalLink className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden="true" />
      {compact ? "Extranet" : "Otevřít extranet"}
    </a>
  );
}
