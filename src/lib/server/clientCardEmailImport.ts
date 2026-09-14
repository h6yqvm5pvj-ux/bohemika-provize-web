import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { originalAdviserEmailForContract } from "@/app/api/contracts/_lib/contractsApi.transfer";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { normalizeStoredContractPdfAttachment } from "./contractPdfStorage";
import { readClientContractLinks } from "./clientContractIndex";
import { planClientCardEmail, saveClientCardEmail } from "./clientCardEmailBackfill";
import { readClientEmailFromStoredPdf } from "./clientEmailPdf";

export type ClientCardEmailImportStatus = "saved" | "existing" | "missing" | "conflict" | "stale" | "skipped";

/** Called after a successful PDF upload. Never changes an existing email and
 * never makes an upload fail because the PDF lacks a readable client contact. */
export async function fillClientCardEmailFromUploadedPdf(
  db: Firestore,
  adviser: { email: string; uid: string },
  entryId: string,
  expectedPdfSha256: string,
): Promise<ClientCardEmailImportStatus> {
  const source = await db.collection("users").doc(adviser.email).collection("entries").doc(entryId).get();
  const contract = source.data() as ContractDoc | undefined;
  if (!contract || contract.productKey !== "cppAuto" || contract.entryType === "endorsement" || originalAdviserEmailForContract(contract, adviser.email) !== adviser.email) return "skipped";
  const slug = clientSlugForName(contract.clientName);
  const attachment = normalizeStoredContractPdfAttachment(contract.contractPdfAttachment);
  if (!slug || !attachment || attachment.sha256 !== expectedPdfSha256) return "stale";
  const saved = (await db.collection("clientCardsPrivate").doc(adviser.uid).collection("cards").doc(slug).get()).data();
  if (typeof saved?.card?.email === "string" && saved.card.email.trim()) return "existing";

  // Read only this client's own indexed links, preserving existing phone and
  // address when creating a card. Never enumerate the entire portfolio here.
  const links = await readClientContractLinks(db, adviser.email, [adviser.email], slug, null);
  const ids = [...new Set(links.map(link => link.id).filter(id => id !== entryId))];
  const others: DocumentSnapshot[] = ids.length ? await db.getAll(...ids.map(id => source.ref.parent.doc(id))) : [];
  const result = await readClientEmailFromStoredPdf(attachment, contract.clientName!);
  if (result.status === "ambiguous") return "conflict";
  if (result.status !== "found") return "missing";
  const decision = planClientCardEmail([
    { snapshot: source, result },
    ...others.filter(doc => doc.exists).map(snapshot => ({ snapshot, result: null })),
  ], adviser.email);
  if (decision.status !== "ready") return decision.status;
  return saveClientCardEmail(db, adviser, decision.plan);
}
