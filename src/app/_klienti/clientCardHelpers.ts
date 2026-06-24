import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { productLabel } from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";

export type ClientContractItem = {
  id: string;
  adviserEmail?: string | null;
  userEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;
  productKey?: Product | string | null;
  status?: string | null;
  stornoDate?: number | string | Date | null;
  policyStartDate?: number | string | Date | null;
  policyEndDate?: number | string | Date | null;
  contractSignedDate?: number | string | Date | null;
  createdAt?: number | string | Date | null;
  durationYears?: number | null;
  durationMonths?: number | null;
  inputAmount?: number | null;
  frequencyRaw?: string | null;
  domexDetail?: { address?: string | null } | null;
  maxdomovDetail?: { address?: string | null } | null;
};

export type ClientContractsResponse = {
  ok?: boolean;
  contracts?: ClientContractItem[];
  teamContracts?: ClientContractItem[];
};

export const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object") {
    const maybeTimestamp = value as { seconds?: unknown };
    if (typeof maybeTimestamp.seconds === "number") {
      const date = new Date(maybeTimestamp.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
};

export const formatDate = (value: unknown): string => {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const contractOwnerEmail = (contract: ClientContractItem): string =>
  (contract.adviserEmail ?? contract.userEmail ?? "").trim().toLowerCase();

export const contractDetailHref = (contract: ClientContractItem): string => {
  const ownerEmail = contractOwnerEmail(contract);
  if (!ownerEmail || !contract.id) return "/smlouvy";
  return `/smlouvy/${encodeURIComponent(`${ownerEmail}___${contract.id}`)}?from=list`;
};

export const clientContractProductLabel = (contract: ClientContractItem): string =>
  productLabel(contract.productKey as Product | null, "Neznámý produkt");

export const clientContractStatus = (
  contract: ClientContractItem
): "active" | "storno" | "dozita" =>
  contractLifecycleStatus(contract as Parameters<typeof contractLifecycleStatus>[0]);

export const clientContractStatusLabel = (contract: ClientContractItem): string => {
  const status = clientContractStatus(contract);
  if (status === "storno") return "Stornovaná";
  if (status === "dozita") return "Dožitá";
  return "Aktivní";
};

export const splitClientContracts = (contracts: ClientContractItem[]) => ({
  active: contracts.filter((contract) => clientContractStatus(contract) === "active"),
  archived: contracts.filter((contract) => clientContractStatus(contract) !== "active"),
});

export const uniqueContracts = (contracts: ClientContractItem[]): ClientContractItem[] => {
  const seen = new Set<string>();
  const out: ClientContractItem[] = [];
  contracts.forEach((contract) => {
    const key = `${contractOwnerEmail(contract)}___${contract.id}`;
    if (!contract.id || seen.has(key)) return;
    seen.add(key);
    out.push(contract);
  });
  return out;
};

export const bestClientAddress = (contracts: ClientContractItem[]): string => {
  for (const contract of contracts) {
    const address =
      contract.clientAddress?.trim() ||
      contract.domexDetail?.address?.trim() ||
      contract.maxdomovDetail?.address?.trim() ||
      "";
    if (address) return address;
  }
  return "";
};

export const bestClientEmail = (contracts: ClientContractItem[]): string => {
  for (const contract of contracts) {
    const email = contract.clientEmail?.trim() || "";
    if (email) return email;
  }
  return "";
};

export const bestClientPhone = (contracts: ClientContractItem[]): string => {
  for (const contract of contracts) {
    const phone = contract.clientPhone?.trim() || "";
    if (phone) return phone;
  }
  return "";
};

export const collectAddressSuggestions = (contracts: ClientContractItem[]): string[] => {
  const seen = new Set<string>();
  contracts.forEach((contract) => {
    [
      contract.clientAddress,
      contract.domexDetail?.address,
      contract.maxdomovDetail?.address,
    ].forEach((value) => {
      const address = (value ?? "").trim();
      if (address) seen.add(address);
    });
  });
  return Array.from(seen).slice(0, 12);
};

export const parseBirthNumberDate = (value: string): string => {
  const digits = value.replace(/\D+/g, "");
  if (digits.length < 6) return "";

  const yy = Number(digits.slice(0, 2));
  let mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return "";

  if (mm > 70) mm -= 70;
  else if (mm > 50) mm -= 50;
  else if (mm > 20) mm -= 20;

  const now = new Date();
  let year = 2000 + yy;
  if (year > now.getFullYear() || now.getFullYear() - year < 15) {
    year = 1900 + yy;
  }

  const date = new Date(year, mm - 1, dd);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return "";
  }

  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
};

export const formatBirthDateLabel = (isoDate: string): string => {
  if (!isoDate) return "Zatím neuvedeno";
  return formatDate(`${isoDate}T00:00:00`);
};
