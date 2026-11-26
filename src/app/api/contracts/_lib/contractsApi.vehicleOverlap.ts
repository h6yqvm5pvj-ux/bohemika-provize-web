import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { AUTO_PRODUCTS } from "@/app/lib/productCatalog";
import {
  isVehicleOverlapProduct, vehicleRegistrationForMatch, vehicleVinForMatch, type VehicleOverlapDraft, type VehicleOverlapMatch, type VehicleOverlapResult,
} from "@/app/lib/vehicleOverlap";
import { hasContractAccess } from "./contractsApi.access";
import { normalizeContractNumber } from "./contractsApi.identity";
import type { ContractDoc } from "./contractsApi.types";

const projection = ["carPlate", "carVin", "contractNumber", "entryType", "productKey",
  "status", "policyStartDate", "policyEndDate", "autoPremiumAmendment"];
const products = AUTO_PRODUCTS.filter(isVehicleOverlapProduct);
const PAGE_SIZE = 250;
const MAX_MATCHES = 30;

function activeVehiclePolicy(contract: ContractDoc, today: string) {
  const productKey = contract.productKey;
  if (!isVehicleOverlapProduct(productKey) || contract.entryType === "endorsement" ||
      contract.autoPremiumAmendment || contractLifecycleStatus({ status: contract.status }) !== "active") return null;
  const end = endorsementCommissionDay(contract.policyEndDate);
  if (end && end < today) return null;
  const plate = vehicleRegistrationForMatch(contract.carPlate);
  const vin = vehicleVinForMatch(contract.carVin);
  if (!plate && !vin) return null;
  return { plate, vin, productKey, start: endorsementCommissionDay(contract.policyStartDate), end };
}

type VehiclePolicy = NonNullable<ReturnType<typeof activeVehiclePolicy>> & { number: string; order: number };
type LookupScope = {
  db: Firestore;
  viewerEmail: string;
  accessibleOwners: string[];
  signal?: AbortSignal;
  now?: Date;
};

export async function readVehicleOverlaps({ db, ownerEmail, entryIds, viewerEmail, accessibleOwners, signal, now = new Date() }: {
  ownerEmail: string;
  entryIds: string[];
} & LookupScope): Promise<VehicleOverlapResult> {
  if (ownerEmail !== viewerEmail && !accessibleOwners.includes(ownerEmail)) throw new Error("Unauthorized vehicle lookup scope");
  const today = endorsementCommissionDay(now)!;
  const savedRefs = entryIds.map(id => db.collection("users").doc(ownerEmail).collection("entries").doc(id));
  const saved = await db.getAll(...savedRefs, { fieldMask: projection });
  const entryOrder = new Map(entryIds.map((id, index) => [id, index]));
  const sources: VehiclePolicy[] = [];
  for (const doc of saved) {
    const contract = doc.data() as ContractDoc | undefined;
    if (!contract) continue;
    const policy = activeVehiclePolicy(contract, today);
    if (!policy) continue;
    const order = entryOrder.get(doc.id);
    if (order === undefined) continue;
    sources.push({ ...policy, order,
      number: typeof contract.contractNumber === "string" ? normalizeContractNumber(contract.contractNumber) : "" });
  }
  return findActiveVehicleOverlaps({ db, ownerEmail, entryOrder, viewerEmail, accessibleOwners, signal, today, sources });
}

export async function readVehicleOverlapPreview({ draft, now = new Date(), ...scope }: LookupScope & { draft: VehicleOverlapDraft }) {
  if (draft.ownerEmail !== scope.viewerEmail && !scope.accessibleOwners.includes(draft.ownerEmail)) {
    throw new Error("Unauthorized vehicle lookup scope");
  }
  const today = endorsementCommissionDay(now)!;
  const policy = activeVehiclePolicy({ productKey: draft.productKey, status: "active",
    carPlate: draft.plate, carVin: draft.vin, policyStartDate: draft.policyStart, policyEndDate: draft.policyEnd }, today);
  const sources = policy ? [{ ...policy, order: 0, number: normalizeContractNumber(draft.contractNumber) }] : [];
  return findActiveVehicleOverlaps({ ...scope, ownerEmail: draft.ownerEmail, entryOrder: new Map(), today, sources });
}

async function findActiveVehicleOverlaps({ db, ownerEmail, entryOrder, viewerEmail, accessibleOwners, signal, today, sources }: LookupScope & {
  ownerEmail: string;
  entryOrder: Map<string, number>;
  today: string;
  sources: VehiclePolicy[];
}): Promise<VehicleOverlapResult> {
  const policiesByPlate = new Map<string, VehiclePolicy[]>();
  const policiesByVin = new Map<string, VehiclePolicy[]>();
  for (const source of sources) {
    if (source.plate) policiesByPlate.set(source.plate, [...(policiesByPlate.get(source.plate) ?? []), source]);
    if (source.vin) policiesByVin.set(source.vin, [...(policiesByVin.get(source.vin) ?? []), source]);
  }
  if (!policiesByPlate.size && !policiesByVin.size) return { matches: [], truncated: false };

  const owners = [...new Set([viewerEmail, ...accessibleOwners])];
  const matches: VehicleOverlapMatch[] = [];
  const deadline = Date.now() + 12_000;
  signal?.throwIfAborted();
  const visitOwner = async (candidateOwner: string) => {
    const base = db.collection("users").doc(candidateOwner).collection("entries")
      .where("productKey", "in", products).select(...projection).limit(PAGE_SIZE);
    let last: QueryDocumentSnapshot | undefined;
    while (matches.length <= MAX_MATCHES) {
      signal?.throwIfAborted();
      if (Date.now() >= deadline) throw new Error("Vehicle lookup timed out");
      const page = await (last ? base.startAfter(last) : base).get();
      for (const doc of page.docs) {
        if (matches.length > MAX_MATCHES) return;
        const contract = doc.data() as ContractDoc;
        if (!hasContractAccess({ viewerEmail, teamEmails: accessibleOwners, ownerEmail: candidateOwner, contract })) continue;
        const policy = activeVehiclePolicy(contract, today);
        if (!policy) continue;
        const samePlate = policy.plate ? policiesByPlate.get(policy.plate) ?? [] : [];
        const sameVin = policy.vin ? policiesByVin.get(policy.vin) ?? [] : [];
        if (!samePlate.length && !sameVin.length) continue;
        const contractNumber = typeof contract.contractNumber === "string" ? contract.contractNumber.trim() : "";
        const number = normalizeContractNumber(contractNumber);
        const candidateIndex = candidateOwner === ownerEmail ? entryOrder.get(doc.id) : undefined;
        const overlapping = [...new Set([...samePlate, ...sameVin])].filter(source =>
          // During bulk import, show a pair of newly saved entries only once.
          (candidateIndex === undefined || candidateIndex < source.order) &&
          !(number && source.number === number && source.productKey === policy.productKey) &&
          !(source.start && policy.end && policy.end < source.start) &&
          !(source.end && policy.start && source.end < policy.start)
        );
        if (!overlapping.length) continue;
        const vinMatches = policy.vin ? overlapping.filter(source => source.vin === policy.vin) : [];
        const bothMatch = policy.plate && vinMatches.some(source => source.plate === policy.plate);
        matches.push({
          plate: policy.plate, matchedBy: bothMatch ? "plate-and-vin" : vinMatches.length ? "vin" : "plate",
          ownerEmail: candidateOwner, entryId: doc.id, productKey: policy.productKey,
          contractNumber: contractNumber || null, policyStart: policy.start, policyEnd: policy.end,
          vinMismatch: Boolean(policy.vin && overlapping.every(source => source.vin && source.vin !== policy.vin)),
        });
      }
      if (page.docs.length < PAGE_SIZE) return;
      last = page.docs.at(-1);
    }
  };
  for (let index = 0; index < owners.length && matches.length <= MAX_MATCHES; index += 5) {
    await Promise.all(owners.slice(index, index + 5).map(visitOwner));
  }
  matches.sort((a, b) => Number(a.vinMismatch) - Number(b.vinMismatch) || (a.plate ?? "").localeCompare(b.plate ?? "") ||
    (b.policyStart ?? "").localeCompare(a.policyStart ?? "") || a.entryId.localeCompare(b.entryId));
  return { matches: matches.slice(0, MAX_MATCHES), truncated: matches.length > MAX_MATCHES };
}
