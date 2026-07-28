import type { User } from "firebase/auth";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type {
  CommissionMode,
  CommissionResultItemDTO,
  Position,
  Product,
} from "../types/domain";

import {
  POSITION_ORDER,
  type ManagerChainSnapshotEntry,
  isoDayFromUnknown,
} from "./calculatorHelpers";

const CONTRACTS_CREATE_IDEMPOTENCY_HEADER = "x-idempotency-key";

export type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: { clientName?: string | null }[];
  hasMore?: boolean;
  nextCursor?: number | null;
  nextCursorToken?: string | null;
};

export type ContractsFindApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: Array<{
    id?: string;
    entryType?: string | null;
    contractNumber?: string | null;
    clientName?: string | null;
    adviserEmail?: string | null;
    adviserName?: string | null;
    userEmail?: string | null;
    productKey?: Product | null;
    position?: Position | null;
    commissionMode?: CommissionMode | null;
    rootContractEntryId?: string | null;
    effectiveInputAmount?: number | null;
    newInputAmount?: number | null;
    inputAmount?: number | null;
    durationYears?: number | null;
    durationMonths?: number | null;
    refreshCommissionBase?: {
      calculationMonthlyPremium?: number | null;
      calculationAnnualPremium?: number | null;
    } | null;
    policyStartDate?: unknown;
    policyEndDate?: unknown;
    contractSignedDate?: unknown;
    createdAt?: unknown;
    items?: CommissionResultItemDTO[] | null;
    result?: {
      items?: CommissionResultItemDTO[] | null;
      total?: number | null;
    } | null;
    lifePremiumChanges?: Array<{
      premiumAmount?: number | null;
      policyStartDate?: unknown;
      contractSignedDate?: unknown;
      createdAt?: unknown;
    }> | null;
  }>;
};

type ContractsFindItem = NonNullable<ContractsFindApiResponse["contracts"]>[number];

export type ContractsPrecheckApiResponse = {
  ok?: boolean;
  error?: string;
  similarContracts?: Array<{
    id?: string;
    contractNumber?: string | null;
    ownerEmail?: string | null;
  }>;
};

export type ContractsMutationResponse = {
  ok?: boolean;
  error?: string;
  entryId?: string;
  refreshOriginalEntryId?: string | null;
  idempotentReplay?: boolean;
  [key: string]: unknown;
};

type ContractAttachmentUploadResponse = {
  ok?: boolean;
  error?: string;
  attachment?: {
    hasFile?: boolean;
    originalName?: string | null;
    sizeBytes?: number | null;
  } | null;
};

export type TeamOverviewApiResponse = {
  ok?: boolean;
  error?: string;
  members?: Array<{
    email?: string | null;
    name?: string | null;
    managerEmail?: string | null;
    position?: Position | null;
    commissionMode?: CommissionMode | null;
  }>;
};

export type TeamOverviewPositionTimelineReadApiResponse = {
  ok?: boolean;
  error?: string;
  targetEmail?: string | null;
  positionTimeline?: unknown;
};

export type SubordinateOption = {
  email: string;
  name: string;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

export type ContractNumberLiveCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "duplicate"; count: number }
  | { status: "foundForEndorsement"; count: number }
  | { status: "notFoundForEndorsement" }
  | { status: "error" };

type RefreshOriginalContractInfo = {
  premiumAmount: number;
  stornoBasePremiumAmount: number;
  stornoStartDateIso: string | null;
};

type RefreshOriginalLookupStatus =
  | "idle"
  | "checking"
  | "found"
  | "notFound"
  | "wrongProduct"
  | "error";

export type RefreshOriginalLookupState = {
  status: RefreshOriginalLookupStatus;
  progress: number;
  adviserName: string | null;
  original: RefreshOriginalContractInfo | null;
};

type ManagerSnapshotApiChainEntry = {
  email?: string | null;
  position?: Position | null;
  commissionMode?: CommissionMode | null;
};

type ManagerSnapshotApiResponse = {
  ok?: boolean;
  error?: string;
  ownerEmail?: string | null;
  managerEmail?: string | null;
  managerPosition?: Position | null;
  managerMode?: CommissionMode | null;
  managerChain?: ManagerSnapshotApiChainEntry[];
};

const finitePositiveNumber = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

export function resolveRefreshOriginalContractInfo(
  contract: ContractsFindItem
): RefreshOriginalContractInfo | null {
  const changes = Array.isArray(contract.lifePremiumChanges)
    ? contract.lifePremiumChanges
    : [];
  const latestPremiumChange = [...changes]
    .reverse()
    .find((change) => finitePositiveNumber(change?.premiumAmount) != null);
  const premiumAmount =
    finitePositiveNumber(latestPremiumChange?.premiumAmount) ??
    finitePositiveNumber(contract.newInputAmount) ??
    finitePositiveNumber(contract.effectiveInputAmount) ??
    finitePositiveNumber(contract.inputAmount);
  if (premiumAmount == null) return null;
  const stornoBasePremiumAmount =
    finitePositiveNumber(contract.refreshCommissionBase?.calculationMonthlyPremium) ??
    (finitePositiveNumber(contract.refreshCommissionBase?.calculationAnnualPremium) != null
      ? finitePositiveNumber(contract.refreshCommissionBase?.calculationAnnualPremium)! / 12
      : null) ??
    premiumAmount;

  const firstChangeWithDate = changes.find(
    (change) =>
      Boolean(isoDayFromUnknown(change?.contractSignedDate)) ||
      Boolean(isoDayFromUnknown(change?.policyStartDate))
  );
  const stornoStartDateIso =
    isoDayFromUnknown(firstChangeWithDate?.policyStartDate) ??
    isoDayFromUnknown(contract.policyStartDate) ??
    isoDayFromUnknown(firstChangeWithDate?.contractSignedDate) ??
    isoDayFromUnknown(contract.contractSignedDate);

  return {
    premiumAmount,
    stornoBasePremiumAmount,
    stornoStartDateIso,
  };
}

export async function requestContractsMutationWithAuth({
  user,
  path,
  method,
  payload,
  idempotencyKey,
}: {
  user: User;
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  payload: unknown;
  idempotencyKey?: string | null;
}): Promise<{
  response: Response;
  data: ContractsMutationResponse | null;
}> {
  let token = await user.getIdToken();
  const request = async (idToken: string) =>
    fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(idempotencyKey
          ? { [CONTRACTS_CREATE_IDEMPOTENCY_HEADER]: idempotencyKey }
          : {}),
      },
      body: JSON.stringify(payload),
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  const raw = await response.text();
  let data: ContractsMutationResponse | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as ContractsMutationResponse;
    } catch {
      data = null;
    }
  }

  return { response, data };
}

export async function uploadContractPdfAttachmentWithAuth({
  user,
  ownerEmail,
  entryId,
  file,
}: {
  user: User;
  ownerEmail: string;
  entryId: string;
  file: File;
}): Promise<ContractAttachmentUploadResponse> {
  const form = new FormData();
  form.set("ownerEmail", ownerEmail);
  form.set("entryId", entryId);
  form.set("file", file);

  return fetchAuthedJsonOrThrow<ContractAttachmentUploadResponse>(
    user,
    "/api/contracts/attachment",
    {
      method: "POST",
      body: form,
    }
  );
}

export async function requestBlobWithAuth({
  user,
  path,
}: {
  user: User;
  path: string;
}): Promise<Response> {
  let token = await user.getIdToken();
  const request = async (idToken: string) =>
    fetch(path, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  return response;
}

const normalizeManagerChainFromApi = (
  rawChain: ManagerSnapshotApiChainEntry[] | null | undefined
): ManagerChainSnapshotEntry[] => {
  if (!Array.isArray(rawChain)) return [];
  return rawChain.map((row) => {
    const email =
      typeof row?.email === "string" && row.email.trim().length > 0
        ? row.email.trim().toLowerCase()
        : null;
    const position = POSITION_ORDER.includes(row?.position as Position)
      ? (row?.position as Position)
      : null;
    const commissionMode =
      row?.commissionMode === "accelerated" || row?.commissionMode === "standard"
        ? row.commissionMode
        : null;

    return {
      email,
      position,
      commissionMode,
    };
  });
};

export async function requestManagerSnapshotWithAuth({
  user,
  signedDateIso,
}: {
  user: User;
  signedDateIso: string | null;
}): Promise<{
  managerEmail: string | null;
  managerPosition: Position | null;
  managerMode: CommissionMode | null;
  managerChain: ManagerChainSnapshotEntry[];
}> {
  let token = await user.getIdToken();
  const requestBody = JSON.stringify({ signedDateIso: signedDateIso ?? null });

  const request = async (idToken: string) =>
    fetch("/api/manager-snapshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
      body: requestBody,
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  const payload = (await response.json().catch(() => null)) as ManagerSnapshotApiResponse | null;
  const apiError =
    payload?.ok === false && typeof payload.error === "string" ? payload.error.trim() : "";
  if (!response.ok || payload?.ok === false) {
    throw new Error(
      apiError || `Nepodařilo se načíst manager snapshot (HTTP ${response.status}).`
    );
  }

  const managerEmail =
    typeof payload?.managerEmail === "string" && payload.managerEmail.trim().length > 0
      ? payload.managerEmail.trim().toLowerCase()
      : null;
  const managerPosition = POSITION_ORDER.includes(payload?.managerPosition as Position)
    ? (payload?.managerPosition as Position)
    : null;
  const managerMode =
    payload?.managerMode === "accelerated" || payload?.managerMode === "standard"
      ? payload.managerMode
      : null;

  const managerChain = normalizeManagerChainFromApi(payload?.managerChain);

  return {
    managerEmail,
    managerPosition,
    managerMode,
    managerChain,
  };
}

export function getContractsMutationError({
  response,
  data,
  fallback,
}: {
  response: Response;
  data: ContractsMutationResponse | null;
  fallback: string;
}): string | null {
  if (!response.ok) {
    const apiError =
      data && data.ok === false && typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "";
    return apiError || `${fallback} (HTTP ${response.status}).`;
  }
  if (data && data.ok === false) {
    return typeof data.error === "string" && data.error.trim()
      ? data.error.trim()
      : fallback;
  }
  if (!data || data.ok !== true) {
    return `${fallback} Server nevrátil potvrzení uložení.`;
  }
  return null;
}
