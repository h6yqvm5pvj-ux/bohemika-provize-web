export const IDENTITY_DOCUMENT_TYPE_VALUES = [
  "identity-card",
  "passport",
  "permanent-residence",
  "long-term-residence",
  "temporary-residence-confirmation",
] as const;

export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPE_VALUES)[number];

export type ClientIdentityDocument = {
  id: string;
  type: IdentityDocumentType;
  validFrom: string;
  validTo: string;
  number: string;
  issuedBy: string;
};

export type ClientCardDraft = {
  clientName: string;
  birthNumber: string;
  birthDate: string;
  phone: string;
  email: string;
  permanentAddress: string;
  correspondenceAddress: string;
  occupation: string;
  employerName: string;
  partnerName: string;
  identityDocuments: ClientIdentityDocument[];
};

export type ClientCardResponse = {
  ok: true;
  card: ClientCardDraft | null;
  revision: number;
};

export const createEmptyClientCard = (clientName = ""): ClientCardDraft => ({
  clientName,
  birthNumber: "",
  birthDate: "",
  phone: "",
  email: "",
  permanentAddress: "",
  correspondenceAddress: "",
  occupation: "",
  employerName: "",
  partnerName: "",
  identityDocuments: [],
});

const TEXT_LIMITS = {
  clientName: 200,
  birthNumber: 20,
  birthDate: 10,
  phone: 50,
  email: 254,
  permanentAddress: 500,
  correspondenceAddress: 500,
  occupation: 200,
  employerName: 200,
  partnerName: 200,
} as const;

export const MAX_CLIENT_IDENTITY_DOCUMENTS = 10;
export const MAX_CLIENT_CARD_REQUEST_BYTES = 32_768;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isDateOrEmpty = (value: string): boolean => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function parseClientCardDraft(value: unknown): ClientCardDraft | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set([...Object.keys(TEXT_LIMITS), "identityDocuments"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;

  const card = createEmptyClientCard();
  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    const field = key as keyof typeof TEXT_LIMITS;
    const raw = value[field];
    if (typeof raw !== "string" || raw.length > limit || /[\u0000-\u001f\u007f]/.test(raw)) {
      return null;
    }
    card[field] = raw.trim();
  }
  if (!card.clientName || !isDateOrEmpty(card.birthDate)) return null;
  if (card.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(card.email)) return null;
  if (!Array.isArray(value.identityDocuments) || value.identityDocuments.length > MAX_CLIENT_IDENTITY_DOCUMENTS) {
    return null;
  }

  const ids = new Set<string>();
  for (const raw of value.identityDocuments) {
    if (!isRecord(raw)) return null;
    const limits = { id: 100, type: 40, validFrom: 10, validTo: 10, number: 80, issuedBy: 200 };
    if (Object.keys(raw).some((key) => !Object.prototype.hasOwnProperty.call(limits, key))) return null;
    for (const [key, limit] of Object.entries(limits)) {
      if (typeof raw[key] !== "string" || raw[key].length > limit || /[\u0000-\u001f\u007f]/.test(raw[key])) return null;
    }
    const document = Object.fromEntries(
      Object.keys(limits).map((key) => [key, (raw[key] as string).trim()]),
    ) as ClientIdentityDocument;
    if (!document.id || ids.has(document.id)) return null;
    if (!(IDENTITY_DOCUMENT_TYPE_VALUES as readonly string[]).includes(document.type)) return null;
    if (!isDateOrEmpty(document.validFrom) || !isDateOrEmpty(document.validTo)) return null;
    ids.add(document.id);
    card.identityDocuments.push(document);
  }
  return card;
}
