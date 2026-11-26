import { isAutoProduct, isRecordOnlyProduct } from "./productCatalog";
import type { Product } from "@/app/types/domain";

export function isVehicleOverlapProduct(product?: Product | null): product is Product {
  return isAutoProduct(product) && !isRecordOnlyProduct(product);
}

export function vehicleRegistrationForMatch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const plate = value.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{3,15}$/.test(plate) && /\d/.test(plate) ? plate : null;
}

export function matchesVehicleRegistration(
  contract: { productKey?: Product | null; carPlate?: string | null },
  normalizedPlate?: string | null,
): boolean {
  return Boolean(normalizedPlate && isAutoProduct(contract.productKey) &&
    vehicleRegistrationForMatch(contract.carPlate) === normalizedPlate);
}

export function vehicleVinForMatch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const vin = value.toUpperCase().replace(/\s/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

export function hasVehicleIdentifierForMatch(entry: Record<string, unknown>): boolean {
  return Boolean(vehicleRegistrationForMatch(entry.carPlate) || vehicleVinForMatch(entry.carVin));
}

export type VehicleOverlapMatch = {
  plate: string | null;
  matchedBy: "plate" | "vin" | "plate-and-vin";
  ownerEmail: string;
  entryId: string;
  productKey: Product;
  contractNumber: string | null;
  policyStart: string | null;
  policyEnd: string | null;
  vinMismatch: boolean;
};

export type VehicleOverlapResult = { matches: VehicleOverlapMatch[]; truncated: boolean };

export type VehicleOverlapDraft = {
  ownerEmail: string;
  productKey: Product;
  plate: string;
  vin: string;
  contractNumber: string;
  policyStart: string;
  policyEnd: string;
};

export type VehicleOverlapCheck =
  | { status: "checked"; result: VehicleOverlapResult }
  | { status: "failed" };

export function isVehicleOverlapResult(value: unknown): value is VehicleOverlapResult {
  if (!value || typeof value !== "object") return false;
  const { matches, truncated } = value as Partial<VehicleOverlapResult>;
  const nullableString = (field: unknown) => field === null || typeof field === "string";
  return typeof truncated === "boolean" && Array.isArray(matches) && matches.length <= 30 && matches.every(match =>
    match && typeof match === "object" && isVehicleOverlapProduct(match.productKey) &&
    typeof match.ownerEmail === "string" && typeof match.entryId === "string" &&
    ["plate", "vin", "plate-and-vin"].includes(match.matchedBy) && typeof match.vinMismatch === "boolean" &&
    [match.plate, match.contractNumber, match.policyStart, match.policyEnd].every(nullableString)
  );
}
