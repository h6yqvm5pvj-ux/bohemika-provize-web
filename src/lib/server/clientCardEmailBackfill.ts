import { FieldValue, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { createEmptyClientCard, parseClientCardDraft } from "@/app/_klienti/clientCardData";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { buildClientDirectory, type ClientDirectoryItem } from "@/app/_klienti/clientDirectory";
import type { ClientContractItem } from "@/app/_klienti/clientCardHelpers";
import { originalAdviserEmailForContract } from "@/app/api/contracts/_lib/contractsApi.transfer";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import type { ClientPdfEmailResult } from "@/app/lib/extractClientEmailFromPdf";

export type ClientEmailSource = { snapshot: DocumentSnapshot; result: ClientPdfEmailResult | null };
export type ClientEmailPlan = { email: string; directory: ClientDirectoryItem; sources: ClientEmailSource[] };
const normalizeEmail = (value: unknown) => typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : "";

/** Conflicting contacts cannot be resolved by taking the newest PDF or the
 * first email found. Only one agreed address is eligible for permanent save. */
export function planClientCardEmail(sources: ClientEmailSource[], adviserEmail: string): { status: "ready"; plan: ClientEmailPlan } | { status: "conflict" | "missing" } {
  const contracts = sources.map(({ snapshot }) => ({ ...snapshot.data(), id: snapshot.id, adviserEmail }) as ClientContractItem);
  const directory = buildClientDirectory(contracts);
  if (directory.length !== 1 || directory[0].contactConflicts.some(field => field === "telefon" || field === "e-mail") || sources.some(source => source.result?.status === "ambiguous")) return { status: "conflict" };
  const emails = new Set(sources.flatMap(({ snapshot, result }) => [normalizeEmail(snapshot.data()?.clientEmail), result?.status === "found" ? normalizeEmail(result.email) : ""]).filter(Boolean));
  if (emails.size > 1) return { status: "conflict" };
  if (emails.size === 0) return { status: "missing" };
  return { status: "ready", plan: { email: [...emails][0], directory: directory[0], sources } };
}

/** Target only the adviser's own private cards and personally concluded
 * contracts. Recheck every source snapshot and the saved card in a transaction
 * so a PDF replacement, transfer or manual edit cannot be overwritten. */
export async function saveClientCardEmail(db: Firestore, adviser: { email: string; uid: string }, plan: ClientEmailPlan): Promise<"saved" | "existing" | "stale"> {
  const slug = plan.directory.slug;
  if (!plan.sources.length || !normalizeEmail(plan.email) || !adviser.uid) throw new Error("Invalid email backfill plan");
  const ref = db.collection("clientCardsPrivate").doc(adviser.uid).collection("cards").doc(slug);
  return db.runTransaction(async transaction => {
    const saved = (await transaction.get(ref)).data();
    const card = saved ? parseClientCardDraft(saved.card) : {
      ...createEmptyClientCard(plan.directory.name), phone: plan.directory.phone, permanentAddress: plan.directory.address,
    };
    if (!card || (saved && (saved.ownerUid !== adviser.uid || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || saved.revision >= Number.MAX_SAFE_INTEGER))) throw new Error("Invalid saved client card");
    if (card.email.trim()) return "existing";
    if (clientSlugForName(card.clientName) !== slug) return "stale";
    const sources = await transaction.getAll(...plan.sources.map(source => source.snapshot.ref));
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index], expected = plan.sources[index].snapshot;
      const data = source.data();
      if (!source.exists || !source.updateTime?.isEqual(expected.updateTime!) || !data) return "stale";
      if (source.ref.parent.parent?.id !== adviser.email || data.entryType === "endorsement" || originalAdviserEmailForContract(data as ContractDoc, adviser.email) !== adviser.email || clientSlugForName(data.clientName) !== slug) return "stale";
    }
    const updated = parseClientCardDraft({ ...card, email: plan.email });
    if (!updated) throw new Error("Invalid extracted client email");
    transaction.set(ref, {
      ownerUid: adviser.uid, card: updated, revision: (saved?.revision ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      emailSource: {
        kind: "contract-email-backfill", version: 1, savedAt: FieldValue.serverTimestamp(),
        contracts: plan.sources.filter(source => source.result?.status === "found" || normalizeEmail(source.snapshot.data()?.clientEmail)).map(source => ({
          path: source.snapshot.ref.path,
          pdfSha256: source.result?.status === "found" ? source.snapshot.data()?.contractPdfAttachment?.sha256 ?? null : null,
        })),
      },
    }, { merge: true });
    return "saved";
  });
}
