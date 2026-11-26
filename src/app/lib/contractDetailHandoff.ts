import { privateMemory } from "./privateMemory";

type DetailTarget = { ownerEmail: string; entryId: string };
const prefix = "doc-";
const key = (uid: string, scope: string) => `contract-detail-handoff:${uid}:${scope}`;

export function contractDetailHandoffPath(uid: string, scope: string, target: DetailTarget): string {
  const id = `${prefix}${crypto.randomUUID()}`;
  privateMemory.setItem(key(uid, scope), JSON.stringify({ id, ...target }));
  return `/smlouvy/${id}`;
}

export function isContractDetailHandoffId(id: string): boolean {
  return /^doc-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id);
}

export function readContractDetailHandoff(id: string, uid: string, scope: string): DetailTarget | null {
  const raw = privateMemory.getItem(key(uid, scope));
  if (!raw) return null;
  const record = JSON.parse(raw) as DetailTarget & { id: string };
  return record.id === id ? { ownerEmail: record.ownerEmail, entryId: record.entryId } : null;
}
