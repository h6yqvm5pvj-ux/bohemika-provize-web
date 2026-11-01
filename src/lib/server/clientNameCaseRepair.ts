import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { formatClientDisplayName } from "@/app/lib/clientNamePresentation";
import { buildDuplicateLookupKey } from "@/app/api/contracts/_lib/contractsApi.identity";
import { contractSearchIndexFieldsForContract } from "@/app/api/contracts/_lib/contractsApi.listFilters";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { withContractHistory } from "./contractHistory";

export type ClientNameCaseRepairSource = {
  path: string;
  clientName: unknown;
  entryType?: unknown;
};

export type ClientNameCaseRepairPlan = {
  path: string;
  beforeName: string;
  clientName: string;
  clientSlug: string;
};

export type ClientNameCaseRepairResult = "updated" | "unchanged" | "stale";

const emailPattern = /^[^\s/@\\]+@[^\s/@\\]+\.[^\s/@\\]+$/;
const isEmail = (value: string) => value.length <= 254 && emailPattern.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
const displayName = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");
const caseKey = (value: string) => displayName(value).toLocaleLowerCase("cs-CZ");
const isName = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 200 && Boolean(value.trim()) && !/[\u0000-\u001f\u007f]/.test(value);

function sourceOwner(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const parts = path.split("/");
  if (parts.length !== 4 || parts[0] !== "users" || parts[2] !== "entries") return null;
  const owner = parts[1];
  if (!isEmail(owner) || owner !== owner.trim().toLowerCase()) return null;
  return /^[A-Za-z0-9_-]{1,200}$/.test(parts[3]) ? owner : null;
}

const isContract = (entryType: unknown): boolean =>
  entryType == null || (typeof entryType === "string" && entryType.trim().toLowerCase() === "contract");

function casingOnlyPlan(source: ClientNameCaseRepairSource): ClientNameCaseRepairPlan | null {
  if (!sourceOwner(source.path) || !isName(source.clientName) || !isContract(source.entryType)) return null;
  const clientName = formatClientDisplayName(source.clientName);
  if (!isName(clientName) || displayName(source.clientName) === displayName(clientName) || caseKey(source.clientName) !== caseKey(clientName)) return null;
  const clientSlug = clientSlugForName(source.clientName);
  if (!clientSlug || clientSlug !== clientSlugForName(clientName)) return null;
  return { path: source.path, beforeName: source.clientName, clientName, clientSlug };
}

/** Only existing case variants within one owner's portfolio are eligible.
 * Accents, titles, company spelling and word order do not establish a match. */
export function planClientNameCaseRepairs(sources: ClientNameCaseRepairSource[]): ClientNameCaseRepairPlan[] {
  const byPath = new Map<string, ClientNameCaseRepairSource>();
  const conflicts = new Set<string>();
  for (const source of sources) {
    if (!sourceOwner(source.path) || !isName(source.clientName) || !isContract(source.entryType)) continue;
    const previous = byPath.get(source.path);
    if (previous && (previous.clientName !== source.clientName || previous.entryType !== source.entryType)) conflicts.add(source.path);
    else byPath.set(source.path, source);
  }
  const groups = new Map<string, ClientNameCaseRepairSource[]>();
  for (const source of byPath.values()) {
    if (conflicts.has(source.path)) continue;
    const key = `${sourceOwner(source.path)}\0${caseKey(source.clientName as string)}`;
    const group = groups.get(key) ?? [];
    group.push(source);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(group => {
    const variants = new Set(group.map(source => displayName(source.clientName as string)));
    return variants.size < 2 ? [] : group.flatMap(source => casingOnlyPlan(source) ?? []);
  }).sort((left, right) => left.path.localeCompare(right.path, "en"));
}

/** Trusted Admin maintenance only; this is not an API authorization boundary.
 * The caller authorizes the operator/project and tracks the cashflow mutation.
 * Every source is re-read and all derived writes share its transaction. */
export async function applyClientNameCaseRepair(
  db: Firestore,
  plan: ClientNameCaseRepairPlan,
  actorEmail: string | null,
): Promise<ClientNameCaseRepairResult> {
  const keys = ["path", "beforeName", "clientName", "clientSlug"];
  if (!plan || typeof plan !== "object" || Object.keys(plan).length !== keys.length || Object.keys(plan).some(key => !keys.includes(key))) {
    throw new Error("Invalid client name repair plan");
  }
  const expected = casingOnlyPlan({ path: plan.path, clientName: plan.beforeName });
  if (!expected || expected.clientName !== plan.clientName || expected.clientSlug !== plan.clientSlug ||
      (actorEmail !== null && (typeof actorEmail !== "string" || !isEmail(actorEmail.trim())))) {
    throw new Error("Invalid client name repair plan");
  }
  const owner = sourceOwner(plan.path)!;
  const actor = actorEmail?.trim().toLowerCase() ?? null;
  const ref = db.doc(plan.path);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.ref.path !== plan.path) return "stale";
    const data = snapshot.data() as ContractDoc | undefined;
    if (!data || !isContract(data.entryType) || !isName(data.clientName)) return "stale";
    if (data.userEmail != null && (typeof data.userEmail !== "string" || data.userEmail.trim().toLowerCase() !== owner)) return "stale";
    if (clientSlugForName(data.clientName) !== plan.clientSlug) return "stale";
    if (data.clientName === plan.clientName) return "unchanged";
    if (data.clientName !== plan.beforeName) return "stale";

    const next = { ...data, clientName: plan.clientName };
    const patch = {
      clientName: plan.clientName,
      duplicateLookupKey: buildDuplicateLookupKey({
        entryType: data.entryType ?? "contract", productKey: data.productKey,
        clientName: plan.clientName, contractSignedDate: data.contractSignedDate,
      }),
      ...contractSearchIndexFieldsForContract(next),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(ref, withContractHistory(transaction, ref, data, patch, {
      actorEmail: actor, title: "Sjednocení zápisu jména klienta",
    }));
    return "updated";
  });
}
