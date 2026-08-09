"use client";

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ExternalLink, Grip, Minus, Move, Plus, X } from "lucide-react";

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
  BohemkaContractDetailModalPayload,
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
  return `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}?from=commission-statements`;
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

export function BohemkaContractDetailModal({
  detail,
  onClose,
}: {
  detail: BohemkaContractDetailModalPayload;
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
      className="fixed inset-0 z-[90] bg-slate-950/55 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-label={detail.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full max-h-[92vh] max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="truncate text-base font-black text-slate-950">{detail.title}</div>
            {detail.subtitle && (
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-500">
                {detail.subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label="Zavřít detail smlouvy"
          >
            <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <iframe title={detail.title} src={detail.href} className="min-h-0 flex-1 border-0" />
      </div>
    </div>
  );
}

const statementCalculatorPrefillHref = (prefill: StatementCalculatorPrefill): string => {
  const params = new URLSearchParams();
  params.set("prefill", "commission-statement");
  params.set("product", prefill.product);
  params.set("productLabel", prefill.productLabel);
  params.set("sourceProductCode", prefill.sourceProductCode);
  if (prefill.contractNumber) params.set("contractNumber", prefill.contractNumber);
  if (prefill.clientName) params.set("clientName", prefill.clientName);
  if (prefill.contractSignedDate) params.set("contractSignedDate", prefill.contractSignedDate);
  if (prefill.policyStartDate) params.set("policyStartDate", prefill.policyStartDate);
  if (prefill.amountText) params.set("amount", prefill.amountText);
  params.set("frequency", prefill.frequency);
  if (prefill.statementId) params.set("sourceStatementId", prefill.statementId);
  if (prefill.statementNumber) params.set("sourceStatementNumber", prefill.statementNumber);
  if (prefill.statementPeriod) params.set("sourceStatementPeriod", prefill.statementPeriod);
  if (prefill.statementDate) params.set("sourceStatementDate", prefill.statementDate);
  if (prefill.statementChronologyMs != null) {
    params.set("sourceStatementChronologyMs", String(prefill.statementChronologyMs));
  }
  return `/kalkulacka?${params.toString()}`;
};

export function StatementCalculatorPrefillButton({
  prefill,
  compact = false,
}: {
  prefill: StatementCalculatorPrefill | null;
  compact?: boolean;
}) {
  const openCalculatorPrefill = useContext(StatementCalculatorPrefillContext);
  if (!prefill || !openCalculatorPrefill) return null;

  return (
    <button
      type="button"
      onClick={() => openCalculatorPrefill(prefill)}
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

const clampStatementCalculatorPanelPosition = (
  position: { x: number; y: number },
  size: { width: number; height: number }
): { x: number; y: number } => {
  if (typeof window === "undefined") return position;
  const maxX = Math.max(16, window.innerWidth - size.width - 16);
  const maxY = Math.max(16, window.innerHeight - size.height - 16);
  return {
    x: Math.min(Math.max(16, position.x), maxX),
    y: Math.min(Math.max(16, position.y), maxY),
  };
};

const clampStatementCalculatorPanelSize = (
  size: { width: number; height: number }
): { width: number; height: number } => {
  if (typeof window === "undefined") {
    return {
      width: Math.min(1120, Math.max(520, size.width)),
      height: Math.min(760, Math.max(420, size.height)),
    };
  }

  const maxWidth = Math.max(320, window.innerWidth - 32);
  const maxHeight = Math.max(320, window.innerHeight - 96);
  const minWidth = Math.min(520, maxWidth);
  const minHeight = Math.min(420, maxHeight);

  return {
    width: Math.min(maxWidth, Math.max(minWidth, size.width)),
    height: Math.min(maxHeight, Math.max(minHeight, size.height)),
  };
};

const defaultStatementCalculatorPanelSize = (): { width: number; height: number } =>
  clampStatementCalculatorPanelSize({ width: 1120, height: 760 });

export function StatementCalculatorIframePanel({
  prefill,
  onClose,
}: {
  prefill: StatementCalculatorPrefill;
  onClose: () => void;
}) {
  const href = useMemo(() => statementCalculatorPrefillHref(prefill), [prefill]);
  const [minimized, setMinimized] = useState(false);
  const [size, setSize] = useState(defaultStatementCalculatorPanelSize);
  const [position, setPosition] = useState(() =>
    clampStatementCalculatorPanelPosition({ x: 16, y: 72 }, defaultStatementCalculatorPanelSize())
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,a")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(
      clampStatementCalculatorPanelPosition(
        {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
        size
      )
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: size.width,
      originHeight: size.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextSize = clampStatementCalculatorPanelSize({
      width: resize.originWidth + event.clientX - resize.startX,
      height: resize.originHeight + event.clientY - resize.startY,
    });
    setSize(nextSize);
    setPosition((previous) => clampStatementCalculatorPanelPosition(previous, nextSize));
  };

  const handleResizePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      {minimized && (
        <div className="fixed bottom-4 right-4 z-[95] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-violet-200 bg-slate-950 px-3 py-2 text-white shadow-[0_22px_60px_rgba(15,23,42,0.34)]">
          <button type="button" onClick={() => setMinimized(false)} className="min-w-0 text-left">
            <span className="block truncate text-xs font-black uppercase tracking-wide text-violet-200">
              Kalkulačka
            </span>
            <span className="block truncate text-sm font-bold">
              {prefill.contractNumber || prefill.productLabel}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="inline-flex h-9 items-center rounded-full bg-white px-3 text-sm font-bold text-slate-950 transition hover:bg-violet-50"
          >
            Otevřít
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/10"
            aria-label="Zavřít kalkulačku"
          >
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        className={`fixed left-0 top-0 z-[95] flex overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] ring-1 ring-white/75 transition-opacity ${
          minimized ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
        role="dialog"
        aria-label="Přidat smlouvu z provizního výpisu"
        aria-hidden={minimized}
      >
        <div className="relative flex min-h-0 w-full flex-col">
          <div
            className="flex cursor-move items-center justify-between gap-3 border-b border-violet-100 bg-white/95 px-4 py-3 backdrop-blur-xl"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                <Move className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-950">Přidat smlouvu z výpisu</div>
                <div className="truncate text-xs font-semibold text-slate-500">
                  {prefill.contractNumber || "bez čísla"} · {prefill.clientName || prefill.productLabel}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="hidden h-9 items-center gap-2 rounded-full border border-violet-100 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-violet-200 hover:text-violet-800 sm:inline-flex"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                Nová karta
              </a>
              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-100 bg-white text-slate-700 transition hover:border-violet-200 hover:text-violet-800"
                aria-label="Minimalizovat kalkulačku"
              >
                <Minus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-black"
                aria-label="Zavřít kalkulačku"
              >
                <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>
          <iframe
            title={`Přidat smlouvu ${prefill.contractNumber || prefill.productLabel}`}
            src={href}
            className="min-h-0 flex-1 border-0"
          />
          <button
            type="button"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            className="absolute bottom-1 right-1 z-10 inline-flex h-8 w-8 cursor-nwse-resize items-center justify-center rounded-lg border border-violet-100 bg-white/90 text-violet-700 shadow-[0_8px_18px_rgba(15,23,42,0.14)] backdrop-blur transition hover:border-violet-200 hover:bg-violet-50"
            aria-label="Změnit velikost kalkulačky"
          >
            <Grip className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
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
