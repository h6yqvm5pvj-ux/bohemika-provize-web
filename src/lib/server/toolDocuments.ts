import { Timestamp } from "firebase-admin/firestore";
import {
  DEFAULT_TOOL_DOCUMENT_EMOJI,
  DEFAULT_TOOL_DOCUMENT_TABS,
  DEFAULT_TOOL_DOCUMENTS,
  getDefaultToolDocumentTab,
  isToolDocumentSection,
  isToolDocumentTab,
  normalizeToolDocumentEmoji,
  normalizeToolDocumentTabLabel,
  type ToolDocumentRecord,
  type ToolDocumentSection,
} from "@/app/lib/toolDocuments";
import { resolveAdminRoleFromClaims, adminRoleAtLeast } from "@/lib/adminAccess";
import { isSpecialistProfile } from "@/lib/specialistAccess";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { loadUserProfileForAdvisorSetup } from "@/lib/server/advisorSetupGuard";

export const TOOL_DOCUMENTS_COLLECTION = "toolDocuments";
export const TOOL_DOCUMENTS_STORAGE_PREFIX = "tool-documents";

type StoredToolDocument = {
  section?: unknown;
  tab?: unknown;
  tabLabel?: unknown;
  emoji?: unknown;
  title?: unknown;
  description?: unknown;
  body?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  isImage?: unknown;
  fileSize?: unknown;
  storagePath?: unknown;
  bucketName?: unknown;
  disabled?: unknown;
  invalid?: unknown;
  invalidAt?: unknown;
  invalidByEmail?: unknown;
  deleted?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedByEmail?: unknown;
};

const DEFAULT_BY_ID = new Map(DEFAULT_TOOL_DOCUMENTS.map((doc) => [doc.id, doc]));

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeDocumentId = (value: unknown): string =>
  normalizeText(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
};

const normalizeBody = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 40);
  }
  return normalizeText(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
};

const timestampToIso = (value: unknown): string | null => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const raw = normalizeText(value);
  return raw || null;
};

export const safeToolDocumentId = normalizeDocumentId;

export const getDefaultToolDocument = (id: unknown): ToolDocumentRecord | null =>
  DEFAULT_BY_ID.get(normalizeDocumentId(id)) ?? null;

export const resolveStorageBucketName = (): string | null => {
  const explicit =
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    "";
  if (explicit) return explicit.replace(/^gs:\/\//i, "").replace(/\/+$/, "");

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  return projectId ? `${projectId}.firebasestorage.app` : null;
};

export const storageBucketCandidates = (bucketName?: string | null): string[] => {
  const candidates: string[] = [];
  const append = (value?: string | null) => {
    const normalized = (value ?? "").trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  append(bucketName);
  append(process.env.FIREBASE_STORAGE_BUCKET);
  append(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const primary = candidates[0] ?? "";
  if (primary.endsWith(".firebasestorage.app")) {
    append(primary.replace(/\.firebasestorage\.app$/i, ".appspot.com"));
  } else if (primary.endsWith(".appspot.com")) {
    append(primary.replace(/\.appspot\.com$/i, ".firebasestorage.app"));
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  if (projectId) {
    append(`${projectId}.firebasestorage.app`);
    append(`${projectId}.appspot.com`);
  }

  return candidates;
};

export function storedToolDocumentToPublic(
  id: string,
  stored: StoredToolDocument,
  fallback?: ToolDocumentRecord | null,
  options: { includeInvalid?: boolean } = {}
): ToolDocumentRecord | null {
  if (stored.deleted === true) return null;

  const isInvalid = stored.invalid === true || stored.disabled === true;
  if (isInvalid && !options.includeInvalid) return null;

  const sectionRaw = normalizeText(stored.section) || fallback?.section;
  const tabRaw = normalizeText(stored.tab) || fallback?.tab;
  if (!isToolDocumentSection(sectionRaw) || !isToolDocumentTab(tabRaw)) return null;
  const tabDefaults = getDefaultToolDocumentTab(tabRaw);

  const title = normalizeText(stored.title) || fallback?.title || "";
  const fileName = normalizeText(stored.fileName) || fallback?.fileName || "";
  const contentType = normalizeText(stored.contentType) || fallback?.contentType || "";
  const body =
    Object.prototype.hasOwnProperty.call(stored, "body")
      ? normalizeBody(stored.body)
      : fallback?.body ?? [];
  if (!title || ((!fileName || !contentType) && body.length === 0)) return null;

  return {
    id,
    section: sectionRaw,
    tab: tabRaw,
    tabLabel: normalizeToolDocumentTabLabel(
      stored.tabLabel,
      fallback?.tabLabel || tabDefaults?.label || tabRaw
    ),
    emoji: normalizeToolDocumentEmoji(
      stored.emoji,
      fallback?.emoji || tabDefaults?.emoji || DEFAULT_TOOL_DOCUMENT_EMOJI
    ),
    title,
    description: normalizeText(stored.description) || fallback?.description || "",
    body,
    fileName,
    contentType,
    isImage: typeof stored.isImage === "boolean" ? stored.isImage : fallback?.isImage ?? false,
    fileSize: normalizeNumber(stored.fileSize) ?? fallback?.fileSize ?? null,
    isDefault: fallback?.isDefault ?? false,
    publishedAt:
      timestampToIso(stored.createdAt) ??
      fallback?.publishedAt ??
      timestampToIso(stored.updatedAt) ??
      fallback?.updatedAt ??
      null,
    updatedAt: timestampToIso(stored.updatedAt) ?? fallback?.updatedAt ?? null,
    updatedByEmail: normalizeText(stored.updatedByEmail) || fallback?.updatedByEmail || null,
    isInvalid,
    invalidAt: timestampToIso(stored.invalidAt),
    invalidByEmail: normalizeText(stored.invalidByEmail) || null,
  };
}

export async function loadToolDocuments(
  section: ToolDocumentSection,
  options: { includeInvalid?: boolean } = {}
): Promise<ToolDocumentRecord[]> {
  const defaults = DEFAULT_TOOL_DOCUMENTS.filter((doc) => doc.section === section);
  if (!adminDb) return defaults;

  const snap = await adminDb
    .collection(TOOL_DOCUMENTS_COLLECTION)
    .where("section", "==", section)
    .get();

  const byId = new Map<string, ToolDocumentRecord>();
  defaults.forEach((doc) => byId.set(doc.id, doc));

  snap.docs.forEach((docSnap) => {
    const id = normalizeDocumentId(docSnap.id);
    if (!id) return;
    const fallback = DEFAULT_BY_ID.get(id) ?? null;
    const publicDoc = storedToolDocumentToPublic(
      id,
      docSnap.data() as StoredToolDocument,
      fallback,
      options
    );
    if (publicDoc) {
      byId.set(id, publicDoc);
    } else {
      byId.delete(id);
    }
  });

  return Array.from(byId.values()).sort((a, b) => {
    if (a.tab !== b.tab) {
      const aIndex = DEFAULT_TOOL_DOCUMENT_TABS.findIndex((tab) => tab.id === a.tab);
      const bIndex = DEFAULT_TOOL_DOCUMENT_TABS.findIndex((tab) => tab.id === b.tab);
      const aOrder = aIndex === -1 ? 100 : aIndex;
      const bOrder = bIndex === -1 ? 100 : bIndex;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.tabLabel.localeCompare(b.tabLabel, "cs");
    }
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.title.localeCompare(b.title, "cs");
  });
}

export async function loadStoredToolDocument(id: string): Promise<{
  publicDoc: ToolDocumentRecord | null;
  stored: StoredToolDocument | null;
  fallback: ToolDocumentRecord | null;
}> {
  const safeId = normalizeDocumentId(id);
  if (!safeId) return { publicDoc: null, stored: null, fallback: null };

  const fallback = DEFAULT_BY_ID.get(safeId) ?? null;
  if (!adminDb) return { publicDoc: fallback, stored: null, fallback };

  const snap = await adminDb.collection(TOOL_DOCUMENTS_COLLECTION).doc(safeId).get();
  if (!snap.exists) return { publicDoc: fallback, stored: null, fallback };

  const stored = snap.data() as StoredToolDocument;
  return {
    publicDoc: storedToolDocumentToPublic(safeId, stored, fallback),
    stored,
    fallback,
  };
}

export async function canManageToolDocuments({
  email,
  uid,
  decoded,
}: {
  email: string;
  uid: string;
  decoded: Record<string, unknown>;
}): Promise<boolean> {
  const adminRole = resolveAdminRoleFromClaims(email, decoded);
  if (adminRoleAtLeast(adminRole, "admin")) return true;

  const profile = await loadUserProfileForAdvisorSetup({ email, uid });
  return isSpecialistProfile(profile?.data ?? null);
}
