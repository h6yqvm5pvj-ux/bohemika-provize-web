import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { createEmptyClientCard, parseClientCardDraft } from "@/app/_klienti/clientCardData";
import { clientIdentityKey, clientSlugForName } from "@/app/_klienti/clientIdentity";
import { buildClientDirectory } from "@/app/_klienti/clientDirectory";
import type { ClientContractItem } from "@/app/_klienti/clientCardHelpers";
import { originalAdviserEmailForContract } from "@/app/api/contracts/_lib/contractsApi.transfer";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { parseCppKomplexLines } from "@/app/lib/parseCppKomplexPdf";
import { normalizeStoredContractPdfAttachment } from "./contractPdfStorage";
import { readClientEmailPdfLines } from "./clientEmailPdf";
import { readClientContractLinks } from "./clientContractIndex";

export type ClientCardCompanyIdImportStatus = "saved" | "existing" | "missing" | "conflict" | "stale" | "skipped";

/** Enrich only an empty IČO in the authenticated adviser's private client card.
 * Re-read the verified stored PDF, then protect against concurrent edits or a
 * replacement/transfer of the source contract before committing the identity. */
export async function fillClientCardCompanyIdFromUploadedPdf(
  db: Firestore,
  adviser: { email: string; uid: string },
  entryId: string,
  expectedPdfSha256: string,
): Promise<ClientCardCompanyIdImportStatus> {
  const source = await db.collection("users").doc(adviser.email).collection("entries").doc(entryId).get();
  const contract = source.data() as ContractDoc | undefined;
  if (!adviser.uid || !contract || !["cppPPRbez", "cppPPRs"].includes(contract.productKey ?? "") || contract.entryType === "endorsement" || originalAdviserEmailForContract(contract, adviser.email) !== adviser.email) return "skipped";
  const slug = clientSlugForName(contract.clientName);
  const attachment = normalizeStoredContractPdfAttachment(contract.contractPdfAttachment);
  if (!slug || !attachment || attachment.sha256 !== expectedPdfSha256) return "stale";
  const cardRef = db.collection("clientCardsPrivate").doc(adviser.uid).collection("cards").doc(slug);
  const existing = (await cardRef.get()).data();
  if (typeof existing?.card?.companyId === "string" && existing.card.companyId.trim()) return "existing";
  const parsed = parseCppKomplexLines(await readClientEmailPdfLines(attachment));
  if (!parsed.clientName || clientIdentityKey(parsed.clientName) !== clientIdentityKey(contract.clientName)) return "conflict";
  if (!parsed.companyId) return "missing";

  // Preserve contacts already shown by the client directory when creating the
  // first private card; avoid replacing them with an otherwise empty record.
  const links = await readClientContractLinks(db, adviser.email, [adviser.email], slug, null);
  const ids = [...new Set(links.map(link => link.id).filter(id => id !== entryId))];
  const others = ids.length ? await db.getAll(...ids.map(id => source.ref.parent.doc(id))) : [];
  const sources = [source, ...others.filter(doc => doc.exists)];
  const directory = buildClientDirectory(sources.map(doc => ({ ...doc.data(), id: doc.id, adviserEmail: adviser.email }) as ClientContractItem));
  if (directory.length !== 1 || directory[0].slug !== slug || directory[0].contactConflicts.length) return "conflict";

  return db.runTransaction(async transaction => {
    const saved = (await transaction.get(cardRef)).data();
    const card = saved ? parseClientCardDraft(saved.card) : {
      ...createEmptyClientCard(directory[0].name), phone: directory[0].phone,
      email: directory[0].email, permanentAddress: directory[0].address,
    };
    if (!card || (saved && (saved.ownerUid !== adviser.uid || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || saved.revision >= Number.MAX_SAFE_INTEGER))) throw new Error("Invalid saved client card");
    if (card.companyId) return "existing";
    if (clientSlugForName(card.clientName) !== slug) return "stale";
    const currentSources = await transaction.getAll(...sources.map(doc => doc.ref));
    if (currentSources.some((doc, index) => !doc.exists || !doc.updateTime?.isEqual(sources[index].updateTime!))) return "stale";
    const updated = parseClientCardDraft({ ...card, companyId: parsed.companyId });
    if (!updated) throw new Error("Invalid extracted company ID");
    transaction.set(cardRef, {
      ownerUid: adviser.uid, card: updated, revision: (saved?.revision ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      companyIdSource: {
        kind: "contract-pdf", path: source.ref.path, pdfSha256: attachment.sha256,
        savedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });
    return "saved";
  });
}
