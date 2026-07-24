import { adminDb } from "@/lib/server/firebaseAdmin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProductionShareUser = {
  email: string;
  name: string;
  managerEmail: string | null;
};

export const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const clampText = (value: unknown, maxLen: number): string => {
  const text = normalizeText(value);
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
};

export const isValidEmail = (email: string): boolean => Boolean(email && EMAIL_RE.test(email));

export const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
};

const parseFiniteNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(",", ".").trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

export const parseNonNegativeInt = (value: unknown): number => {
  const parsed = parseFiniteNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export const parseNonNegativeNumber = (value: unknown): number => {
  const parsed = parseFiniteNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

export const formatMoney = (value: number): string => {
  try {
    return new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} Kč`;
  }
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export const pickDisplayName = (
  raw: Record<string, unknown> | null,
  email: string
): string => {
  if (!raw) return nameFromEmail(email);
  const fullName = normalizeText(raw.fullName);
  if (fullName) return fullName;
  const name = normalizeText(raw.name);
  if (name) return name;
  return nameFromEmail(email);
};

export const loadUserByEmail = async (
  email: string
): Promise<ProductionShareUser | null> => {
  if (!adminDb) return null;
  const usersCol = adminDb.collection("users");

  const directSnap = await usersCol.doc(email).get();
  if (directSnap.exists) {
    const data = (directSnap.data() as Record<string, unknown> | undefined) ?? {};
    return {
      email,
      name: pickDisplayName(data, email),
      managerEmail: normalizeEmail(data.managerEmail) || null,
    };
  }

  const byEmailSnap = await usersCol.where("email", "==", email).limit(1).get();
  if (!byEmailSnap.empty) {
    const first = byEmailSnap.docs[0];
    const data = (first?.data() as Record<string, unknown> | undefined) ?? {};
    const resolvedEmail = normalizeEmail(data.email) || normalizeEmail(first?.id) || email;
    return {
      email: resolvedEmail,
      name: pickDisplayName(data, resolvedEmail),
      managerEmail: normalizeEmail(data.managerEmail) || null,
    };
  }

  return null;
};

export const resolveSenderName = async (
  senderEmail: string,
  senderUid: string
): Promise<string> => {
  if (!adminDb) return nameFromEmail(senderEmail);
  const usersCol = adminDb.collection("users");

  const directSnap = await usersCol.doc(senderEmail).get();
  if (directSnap.exists) {
    const name = pickDisplayName(
      (directSnap.data() as Record<string, unknown> | undefined) ?? null,
      senderEmail
    );
    if (name) return name;
  }

  const byEmailSnap = await usersCol.where("email", "==", senderEmail).limit(1).get();
  if (!byEmailSnap.empty) {
    const first = byEmailSnap.docs[0];
    const name = pickDisplayName(
      (first?.data() as Record<string, unknown> | undefined) ?? null,
      senderEmail
    );
    if (name) return name;
  }

  if (senderUid) {
    const byUidSnap = await usersCol.where("userId", "==", senderUid).limit(1).get();
    if (!byUidSnap.empty) {
      const first = byUidSnap.docs[0];
      const name = pickDisplayName(
        (first?.data() as Record<string, unknown> | undefined) ?? null,
        senderEmail
      );
      if (name) return name;
    }
  }

  return nameFromEmail(senderEmail);
};
