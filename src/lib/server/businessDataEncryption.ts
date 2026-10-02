import { createHmac } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { FieldValue } from "firebase-admin/firestore";
import { encryptMailboxBytes, decryptMailboxBytes } from "./mailboxEncryption";

// Only presentation/content fields belong here. Ownership, authorization,
// chronology and numerical computation fields retain their existing semantics.
const identity = ["clientName", "clientEmail", "clientPhone", "clientAddress", "contractNumber"];
export const BUSINESS_PRIVATE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  entries: [...identity, "clientSearchKeys", "contractNumberSearchKeys", "duplicateLookupKey",
    "refreshOriginalContractNumber", "refreshCommissionBase", "premiumStatementBaseResolutions",
    "premiumStatementHistory", "commissionPayouts", "cashflowPayoutMatches",
    "tipContractSourceTipTitle", "tipContractSourceTipClientName",
    "carPlate", "carVin", "carTp", "carOrv", "maxxContractDetailUrl", "contractPdfAttachment"],
  clientContractLinks: [...identity, "clientSlug"],
  contractRefs: ["contractNumberRaw", "contractNumberNormalized", "contractNumberLoose"],
  contractNumberClaims: ["contractNumberRaw", "contractNumberNormalized", "contractNumberLoose"],
  commissionStatements: ["html", "fileName", "autoPremiumRows", "autoPremiumContractNumbers", "processingResult"],
  accountingRepairDrafts: [...identity, "detail"],
  externalUpdateTasks: [...identity, "maxxContractDetailUrl"],
  tipPayouts: [...identity, "sourceTipTitle", "sourceTipClientName"],
  tipsterTips: ["linkedContractNumber"],
  advisorTipStatuses: ["linkedContractNumber"],
  _cashflowCandidates: ["context"],
  _cashflowCandidateChunks: ["bytes"],
};

// Equality indexes use a separate, stable secret, independent of rotating
// encryption keys. Never use an unkeyed hash for enumerable names/numbers.
export const BUSINESS_LOOKUP_FIELDS: Readonly<Record<string, readonly string[]>> = {
  entries: ["contractNumber", "duplicateLookupKey"],
  clientContractLinks: ["clientSlug"],
  contractRefs: ["contractNumberNormalized", "contractNumberLoose"],
  commissionStatements: ["autoPremiumContractNumbers"],
};
export const businessEncryptionRequired = () => process.env.BUSINESS_DATA_ENCRYPTION_REQUIRED === "true";
export const businessLookupField = (field: string) => `_businessLookup_${field}`;
export const isBusinessInternalField = (field: string) => field.startsWith("_businessLookup_");
export const isBusinessValue = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && Object.hasOwn(value, "businessEncryption");

export function businessLookupToken(domain: string, value: unknown): string {
  const configured = process.env.BUSINESS_DATA_INDEX_KEY?.trim() ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(configured) || Buffer.from(configured, "base64").length !== 32) {
    throw new Error("Business-data index key is missing or invalid");
  }
  if (typeof value !== "string") throw new Error("Private equality lookup requires a string");
  return createHmac("sha256", Buffer.from(configured, "base64"))
    .update(JSON.stringify(["business-index-v1", domain, value])).digest("hex");
}

export function businessCollection(path: string): string | null {
  const parts = path.split("/");
  const name = parts.at(-2)!;
  if (parts.length === 4 && parts[0] === "users" && name === "entries") return name;
  if (parts.length === 4 && parts[0] === "users" && name === "tipPayouts") return name;
  if (parts.length === 4 && parts[0] === "usersPrivate" && ["commissionStatements", "accountingRepairDrafts", "externalUpdateTasks", "tipPayouts", "tipsterTips", "advisorTipStatuses"].includes(name)) return name;
  if (parts.length === 2 && ["clientContractLinks", "contractRefs", "contractNumberClaims", "_cashflowCandidates", "_cashflowCandidateChunks"].includes(name)) return name;
  return null;
}

function openValue(path: string, field: string, value: unknown): unknown {
  if (!isBusinessValue(value)) {
    if (value != null && businessEncryptionRequired()) throw new Error("Unencrypted business data is no longer accepted");
    return value;
  }
  if (value.businessEncryption !== 1 || !["json", "bytes"].includes(String(value.format)) || !Buffer.isBuffer(value.ciphertext)) throw new Error("Invalid business-data envelope");
  const compressed = decryptMailboxBytes(value.ciphertext, value.encryption, `business:${path}:${field}:${value.format}`);
  const bytes = inflateSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
  if (value.format === "bytes") return bytes;
  try { return JSON.parse(bytes.toString("utf8")); }
  finally { bytes.fill(0); }
}

export function openBusinessRecord(path: string, source: Record<string, unknown>): Record<string, unknown> {
  const collection = businessCollection(path);
  if (!collection) return source;
  const result = { ...source };
  for (const field of BUSINESS_PRIVATE_FIELDS[collection] ?? []) {
    if (Object.hasOwn(source, field)) result[field] = openValue(path, field, source[field]);
  }
  for (const field of Object.keys(result)) if (isBusinessInternalField(field)) delete result[field];
  return result;
}

/** Reading ownership/role metadata must not open unrelated private content.
 * Normal property access/spread after the resource check materializes it. */
export function lazyBusinessRecord(path: string, source: Record<string, unknown>): Record<string, unknown> {
  const collection = businessCollection(path);
  if (!collection) return source;
  const result = { ...source };
  for (const field of Object.keys(result)) if (isBusinessInternalField(field)) delete result[field];
  for (const field of BUSINESS_PRIVATE_FIELDS[collection] ?? []) {
    if (!Object.hasOwn(source, field)) continue;
    let ready = false;
    let content: unknown;
    Object.defineProperty(result, field, { enumerable: true, configurable: true,
      get() { if (!ready) { content = openValue(path, field, source[field]); ready = true; } return content; },
      set(value: unknown) { content = value; ready = true; },
    });
  }
  return result;
}

/** Input is a domain write, never a caller-supplied encryption envelope.
 * All writes at the SDK boundary are sealed, including batches and transfers. */
export function sealBusinessRecord(path: string, source: Record<string, unknown>): Record<string, unknown> {
  const collection = businessCollection(path);
  if (!collection) return source;
  const result = { ...source };
  if (Object.keys(source).some(isBusinessInternalField)) throw new Error("Private lookup fields are server controlled");
  for (const field of BUSINESS_PRIVATE_FIELDS[collection] ?? []) {
    if (Object.keys(source).some(key => key.startsWith(`${field}.`))) throw new Error("Replace the complete private field instead of a nested update");
    if (!Object.hasOwn(source, field)) continue;
    const value = source[field];
    const indexed = BUSINESS_LOOKUP_FIELDS[collection]?.includes(field);
    if (value instanceof FieldValue) {
      if (!value.isEqual(FieldValue.delete())) throw new Error("Transforms are not supported on private fields");
      if (indexed) result[businessLookupField(field)] = FieldValue.delete();
      continue;
    }
    if (value === undefined) throw new Error("Undefined private field");
    if (isBusinessValue(value)) throw new Error("A business write must supply readable content, not ciphertext");
    if (indexed) {
      result[businessLookupField(field)] = value == null ? null : Array.isArray(value)
        ? value.map(item => businessLookupToken(`${collection}:${field}`, item))
        : businessLookupToken(`${collection}:${field}`, value);
    }
    // Null has no private content and remains query-compatible.
    if (value != null) {
      const format = Buffer.isBuffer(value) ? "bytes" : "json";
      const plaintext = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(JSON.stringify(value), "utf8");
      try {
        const encrypted = encryptMailboxBytes(deflateSync(plaintext), `business:${path}:${field}:${format}`);
        result[field] = { businessEncryption: 1, format, ciphertext: encrypted.bytes, encryption: encrypted.encryption };
      } finally { plaintext.fill(0); }
    }
  }
  return result;
}

/** Raw migration input: check authenticated old envelopes, then re-seal only
 * documents with plaintext or missing indexes. Full replacement removes copies. */
export function planBusinessDataMigration(path: string, source: Record<string, unknown>): Record<string, unknown> | null {
  const collection = businessCollection(path);
  if (!collection) return null;
  const readable = { ...source };
  let pending = false;
  for (const field of BUSINESS_PRIVATE_FIELDS[collection] ?? []) {
    if (!Object.hasOwn(source, field) || source[field] == null) continue;
    if (isBusinessValue(source[field])) readable[field] = openValue(path, field, source[field]);
    else pending = true;
  }
  for (const field of BUSINESS_LOOKUP_FIELDS[collection] ?? []) {
    if (readable[field] == null) continue;
    const value = readable[field];
    const expected = Array.isArray(value) ? value.map(item => businessLookupToken(`${collection}:${field}`, item)) : businessLookupToken(`${collection}:${field}`, value);
    if (JSON.stringify(source[businessLookupField(field)]) !== JSON.stringify(expected)) pending = true;
  }
  if (collection === "clientContractLinks" && typeof readable.ownerEmail === "string" && typeof readable.clientSlug === "string") {
    readable.ownerClientKey = businessLookupToken("owner-client", `${readable.ownerEmail}\0${readable.clientSlug}`);
    if (source.ownerClientKey !== readable.ownerClientKey) pending = true;
  }
  if (!pending) return null;
  for (const field of Object.keys(readable)) if (isBusinessInternalField(field)) delete readable[field];
  const sealed = sealBusinessRecord(path, readable);
  if (JSON.stringify(openBusinessRecord(path, sealed)) !== JSON.stringify(readable)) throw new Error("Business-data migration verification failed");
  return sealed;
}

/** Retire old document IDs containing a reversible contract number. The
 * executor must transactionally check the destination before deleting source. */
export function planLegacyClaimMigration(path: string, source: Record<string, unknown>): { path: string; data: Record<string, unknown> } | null {
  if (businessCollection(path) !== "contractNumberClaims" || /^contractNumberClaims\/b1_[a-f0-9]{64}$/.test(path)) return null;
  const readable = { ...source };
  for (const field of BUSINESS_PRIVATE_FIELDS.contractNumberClaims) {
    if (isBusinessValue(source[field])) readable[field] = openValue(path, field, source[field]);
  }
  const number = readable.contractNumberNormalized;
  if (typeof number !== "string" || !number.trim() || typeof readable.entryPath !== "string" || !readable.entryPath) throw new Error("Invalid legacy contract-number claim");
  const destination = `contractNumberClaims/b1_${businessLookupToken("contract-claim", number.replace(/\s+/g, "").toLowerCase())}`;
  return { path: destination, data: sealBusinessRecord(destination, readable) };
}
