import { PRODUCT_ORDER } from "./productCatalog";

export type EndorsementCommissionPlanEntry = {
  id?: string | null;
  originalEntryId?: string | null;
  userEmail?: string | null;
  adviserEmail?: string | null;
  productKey?: string | null;
  entryType?: string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  policyStartDate?: unknown;
  inputAmount?: number | null;
  effectiveInputAmount?: number | null;
  calculationInputAmount?: number | null;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
  premiumDelta?: number | null;
  changeType?: string | null;
};

export type EndorsementCommissionAdjustment = {
  amount: number;
  originalAmount: number;
  effectiveDate: string;
  endorsementEntryId: string;
};

type PlanNode = {
  id: string;
  owner: string;
  product: string;
  root: string;
  parent: string | null;
  start: string | null;
  kind: "contract" | "increase" | "decrease" | "same" | "invalid";
  previous: number | null;
  premium: number | null;
};

const PRODUCTS = new Set<string>(PRODUCT_ORDER.filter(product => product !== "comfortcc" && product !== "conseqzenit"));
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const pragueDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
});
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const money = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const nodeKey = (owner: string, product: string, id: string) => JSON.stringify([owner, product, id]);

function validDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match || Number(match[1]) < 1000) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** Date-only values keep their calendar day; instants use the policy's Czech calendar. */
export function endorsementCommissionDay(value: unknown): string | null {
  if (typeof value === "string" && DAY_PATTERN.test(value)) return validDay(value) ? value : null;
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === "number" && Number.isFinite(value)) date = new Date(value);
  else if (typeof value === "object" && value !== null && "seconds" in value &&
    typeof value.seconds === "number" && Number.isFinite(value.seconds)) {
    date = new Date(value.seconds * 1000);
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    validDay(value.slice(0, 10)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)) date = new Date(value);
  else return null;
  if (!Number.isFinite(date.getTime())) return null;
  const parts = pragueDay.formatToParts(date);
  const day = ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  return validDay(day) ? day : null;
}

function normalize(entry: EndorsementCommissionPlanEntry): PlanNode | null {
  if (entry.entryType != null && entry.entryType !== "contract" && entry.entryType !== "endorsement") return null;
  if (entry.entryType != null && entry.entryType !== "contract" && entry.entryType !== "endorsement") return null;
  const id = text(entry.originalEntryId) || text(entry.id);
  const owner = (text(entry.userEmail) || text(entry.adviserEmail)).toLowerCase();
  const product = text(entry.productKey);
  if (!id || !owner || !PRODUCTS.has(product)) return null;
  const endorsement = entry.entryType === "endorsement";
  const root = text(entry.rootContractEntryId) || (endorsement ? "" : id);
  const parent = endorsement ? text(entry.parentContractEntryId) : null;
  if (!root || (endorsement && (!parent || root === id || parent === id)) || (!endorsement && root !== id)) return null;
  const previous = money(entry.previousInputAmount);
  const premium = endorsement
    ? money(entry.newInputAmount ?? entry.effectiveInputAmount)
    : money(entry.effectiveInputAmount ?? entry.newInputAmount ?? entry.inputAmount);
  let kind: PlanNode["kind"] = "contract";
  if (endorsement) {
    kind = previous === null || premium === null ? "invalid"
      : premium < previous ? "decrease" : premium > previous ? "increase" : "same";
    if ((entry.changeType && entry.changeType !== kind) ||
      (entry.premiumDelta != null && (typeof entry.premiumDelta !== "number" ||
        !Number.isFinite(entry.premiumDelta) || previous === null || premium === null ||
        Math.abs(entry.premiumDelta - (premium - previous)) > 0.01))) kind = "invalid";
  }
  return { id, owner, product, root, parent, start: endorsementCommissionDay(entry.policyStartDate), kind, previous, premium };
}

/**
 * A read-only projection: stored calculations and statement payouts remain unchanged.
 * Premium increases are separate positive commission tranches. A later decrease scales
 * every earlier tranche proportionally, retaining its original rates and schedule.
 * Callers decide which unpaid amounts to project and supply the entitlement period.
 */
export function createEndorsementCommissionPlan(entries: readonly EndorsementCommissionPlanEntry[]) {
  const nodes = new Map<string, PlanNode>();
  const conflicts = new Set<string>();
  for (const entry of entries) {
    const node = normalize(entry);
    if (!node) continue;
    const key = nodeKey(node.owner, node.product, node.id);
    const previous = nodes.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(node)) conflicts.add(key);
    else nodes.set(key, node);
  }
  const children = new Map<string, PlanNode[]>();
  for (const node of nodes.values()) {
    if (!node.parent) continue;
    const key = nodeKey(node.owner, node.product, node.parent);
    const siblings = children.get(key) ?? [];
    siblings.push(node);
    children.set(key, siblings);
  }
  const chains = new Map<string, PlanNode[]>();
  for (const root of nodes.values()) {
    if (root.kind !== "contract" || !root.start || root.premium === null ||
      conflicts.has(nodeKey(root.owner, root.product, root.id))) continue;
    const chain = [root];
    let parent = root;
    const visited = new Set([root.id]);
    while (true) {
      const candidates = (children.get(nodeKey(root.owner, root.product, parent.id)) ?? [])
        .filter(node => node.root === root.id);
      // Branches cannot establish which premium change supersedes the other.
      if (candidates.length !== 1) break;
      const next = candidates[0];
      if (visited.has(next.id) || conflicts.has(nodeKey(next.owner, next.product, next.id)) ||
        !next.start || next.start < parent.start! || next.kind === "invalid" ||
        next.previous === null || next.premium === null ||
        Math.abs(next.previous - parent.premium!) > 0.01) break;
      visited.add(next.id);
      chain.push(next);
      parent = next;
    }
    chains.set(nodeKey(root.owner, root.product, root.id), chain);
  }

  const resolve = (entry: EndorsementCommissionPlanEntry) => {
    const node = normalize(entry);
    if (!node) return null;
    const chain = chains.get(nodeKey(node.owner, node.product, node.root));
    if (!chain) return null;
    const index = chain.findIndex(candidate => candidate.id === node.id);
    return index < 0 ? null : { chain, index };
  };

  return {
    adjust(entry: EndorsementCommissionPlanEntry, amount: number, commissionPeriod: unknown): EndorsementCommissionAdjustment | null {
      if (!Number.isFinite(amount) || amount <= 0) return null;
      const period = endorsementCommissionDay(commissionPeriod);
      const resolved = period ? resolve(entry) : null;
      if (!resolved || !period) return null;
      const { chain, index } = resolved;
      const source = chain[index];
      if ((source.kind !== "contract" && source.kind !== "increase") || !source.premium || period < source.start!) return null;
      let factor = 1;
      let latest: PlanNode | null = null;
      for (const next of chain.slice(index + 1)) {
        if (next.start! > period) break;
        if (next.kind !== "decrease" || !next.previous) continue;
        factor *= next.premium! / next.previous;
        latest = next;
      }
      if (!latest) return null;
      const adjusted = amount * factor;
      if (!Number.isFinite(adjusted * 100)) return null;
      return {
        amount: Math.round((adjusted + Number.EPSILON) * 100) / 100,
        originalAmount: amount,
        effectiveDate: latest.start!,
        endorsementEntryId: latest.id,
      };
    },
    currentPremium(entry: EndorsementCommissionPlanEntry, asOf: unknown): number | null {
      const day = endorsementCommissionDay(asOf);
      const resolved = day ? resolve(entry) : null;
      if (!resolved || !day) return null;
      let premium: number | null = null;
      for (const node of resolved.chain) {
        if (node.start! > day) break;
        premium = node.premium;
      }
      return premium;
    },
  };
}
