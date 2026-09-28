import { isPrivateValue, openPrivateValue, sealPrivateValue } from "./privateEncryption";

/** Query/authorization fields stay readable. Content is authenticated to its
 * exact record and field; callers must authorize before opening a record. */
export function privateRecordFields(path: string, data: Record<string, unknown>): readonly string[] {
  if (/^users\/[^/]+\/entries\/[^/]+\/contractNotes\/[^/]+$/.test(path)) return ["text", "clientName", "contractNumber"];
  if (/^users\/[^/]+\/entries\/[^/]+$/.test(path)) return ["note"];
  if (/^contractHistories\/[^/]+\/events\/[^/]+$/.test(path)) return ["title", "changes"];
  if (/^anniversaryReviews\/[^/]+$/.test(path)) return ["note", "meetingAt", "contractNumber"];
  if (/^anniversaryReviewHistories\/[^/]+\/events\/[^/]+$/.test(path)) return ["note", "meetingAt"];
  if (/^userRequests\/[^/]+$/.test(path)) return ["message", "feedback", "requestedCorporateEmail", "requestedFullName", "requestedAgencyNumber", "requestedManagerEmail", "requestedPosition", "requestedCommissionMode"];
  if (/^mailboxSharedPayloads\/[^/]+$/.test(path)) return ["snapshot", "noteText", "senderName", "recipientName", "previewHtml"];
  if (/^usersPrivate\/[^/]+\/mailbox\/[^/]+$/.test(path) && isPrivateSystemMessage(data.type)) return ["title", "body", "metadata"];
  return [];
}

export const isPrivateSystemMessage = (type: unknown) =>
  ["contract_note_reminder", "production_plan_share", "production_export_share"].includes(String(type));

export function privateRecordContext(path: string, data: Record<string, unknown>, field: string): string {
  if (/^anniversaryReviews\/[^/]+$/.test(path) && typeof data.privateReviewPath === "string" && /^anniversaryReviews\/[^/]+$/.test(data.privateReviewPath)) {
    return `${data.privateReviewPath}:${field}`;
  }
  // Notes follow the contract across owner transfers without moving the original
  // notes collection. Reuse that stable location for the older inline note too.
  const base = field === "note" && /^users\/[^/]+\/entries\/[^/]+$/.test(path)
    && typeof data.contractNotesPath === "string" && /^users\/[^/]+\/entries\/[^/]+$/.test(data.contractNotesPath)
    ? data.contractNotesPath : path;
  return `${base}:${field}`;
}

export function sealPrivateRecord(path: string, data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  if (/^anniversaryReviews\/[^/]+$/.test(path) && !result.privateReviewPath) result.privateReviewPath = path;
  for (const field of privateRecordFields(path, data)) {
    if (!Object.hasOwn(data, field)) continue;
    const context = privateRecordContext(path, data, field);
    if (isPrivateValue(data[field])) openPrivateValue(data[field], context);
    else result[field] = sealPrivateValue(data[field], context);
  }
  return result;
}

export function openPrivateRecord(path: string, data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  for (const field of privateRecordFields(path, data)) {
    if (Object.hasOwn(data, field)) result[field] = openPrivateValue(data[field], privateRecordContext(path, data, field));
  }
  return result;
}
