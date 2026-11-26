import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";
import { toDate } from "@/app/lib/formatters";
import {
  isLifeCommissionReminderEntryId,
  LIFE_COMMISSION_REMINDER_TYPE,
  type LifeCommissionReminderContract,
} from "@/app/lib/lifeCommissionReminder";
import { normalizeLifeCommissionItemCode } from "@/app/lib/lifePremiumIncrease";
import { isLifeProduct, LIFE_PRODUCTS, productLabel } from "@/app/lib/productCatalog";
import { getTodayIsoInPrague } from "@/lib/subscriptionAccess";
import { cashflowCalendarDate } from "./cashflowCalendar";
import { adminAuth, adminDb, adminMessaging } from "./firebaseAdmin";
import { loadIntranetNotificationProfile } from "./intranetNotificationAudience";
import { lifeCommissionReminderId } from "./lifeCommissionReminderId";
import { writeMailboxEntryOnce } from "./mailbox";
import { collectPushTokens, isPermanentInvalidPushTokenCode, removeInvalidPushTokens } from "./pushTokens";

const TITLE = "Blíží se výplata provizí B036 a B048";
const BODY = "Zkontroluj, že jsi u uvedených smluv provedl/a následný servis klienta. Pokud ne, aktualizuj cross-sell a autorizuj kartu klienta. Splnění následného servisu je podmínkou výplaty provize.";
const PUSH_BODY = "Otevři zprávu v Poště a zkontroluj následný servis klientů.";
const PUSH_ORIGIN = "https://bohemka.app";
const OWNER_EMAIL_RE = /^[a-z0-9.!#$&'*+\-=^_`{|}~]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const CONCURRENCY = 8;

const ENTRY_FIELDS = [
  "productKey", "userEmail", "entryType", "rootContractEntryId", "parentContractEntryId",
  "contractNumber", "policyStartDate", "policyEndDate", "contractSignedDate", "createdAt",
  "status", "stornoDate", "durationYears", "durationMonths", "items", "commissionPayouts",
  "commissionPayoutCodeAdjustment", "cashflowPayoutMatches", "isRefresh", "requiresStatementRefresh",
  "refreshCommissionBase", "neonCorrection", "inputAmount", "calculationInputAmount",
  "effectiveInputAmount", "newInputAmount", "previousInputAmount", "premiumDelta", "changeType",
  "mode", "commissionMode", "acquisitionType", "originalAdviserEmail", "transferEffectiveDate",
  "servicingOwnerEmail", "commissionOwnerEmail",
];

export function upcomingLifeCommissionContracts(entries: EntryDoc[], ownerEmail: string, asOf: Date) {
  const today = getTodayIsoInPrague(asOf);
  const month = today.slice(0, 7);
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const eligible = entries.filter(entry => isLifeProduct(entry.productKey) && entry.entryType !== "endorsement" &&
    [entry.policyStartDate, entry.contractSignedDate, entry.createdAt].some(value => toDate(value, { calendar: asOf })))
    .map(entry => ({ ...entry, items: entry.items?.map(item => {
      if (item.code) return item;
      const title = (item.title ?? "").toLowerCase();
      if (title.includes("po 3 letech")) return { ...item, code: "B3601" };
      if (title.includes("po 4 letech")) return { ...item, code: "B4801" };
      return item;
    }) }));
  const reminders = new Map<string, LifeCommissionReminderContract>();
  for (const item of generateCashflow(eligible, 1, ownerEmail, asOf, entries)) {
    if (!item.entryId || !entriesById.has(item.entryId) || item.contractStatus !== "active" ||
      item.payoutStatus === "paid" || item.isStatementOnly || item.isPartialPayoutBalance ||
      (!item.amountUnknown && item.amount <= 0)) continue;
    const code = normalizeLifeCommissionItemCode(item.commissionCode);
    if (code !== "B3601" && code !== "B4801") continue;
    const payoutDay = getTodayIsoInPrague(item.date);
    if (payoutDay < today || !payoutDay.startsWith(month)) continue;
    const commissionCode = code === "B3601" ? "B036" : "B048";
    const key = `${item.entryId}:${commissionCode}`;
    if (reminders.has(key)) continue;
    reminders.set(key, {
      entryId: item.entryId,
      contractNumber: typeof item.contractNumber === "string" ? item.contractNumber : "",
      productLabel: productLabel(entriesById.get(item.entryId)?.productKey),
      code: commissionCode,
      payoutDay,
    });
  }
  return [...reminders.values()].sort((a, b) => a.payoutDay.localeCompare(b.payoutDay) ||
    a.contractNumber.localeCompare(b.contractNumber, "cs") || a.entryId.localeCompare(b.entryId));
}

const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function runLifeCommissionReminders(now = new Date()) {
  const today = getTodayIsoInPrague(now);
  const result = { skippedDay: !today.endsWith("-01"), mailboxWritten: 0, duplicates: 0,
    pushSuccessCount: 0, pushFailureCount: 0, failed: 0 };
  if (result.skippedDay) return result;
  const db = adminDb;
  const auth = adminAuth;
  const asOf = cashflowCalendarDate(now.getTime(), "Europe/Prague");
  if (!db || !auth || !asOf) throw new Error("Life commission reminder services unavailable.");

  const snapshot = await db.collectionGroup("entries").where("productKey", "in", LIFE_PRODUCTS)
    .select(...ENTRY_FIELDS).get();
  const byOwner = new Map<string, EntryDoc[]>();
  for (const doc of snapshot.docs) {
    const [, owner] = doc.ref.path.match(/^users\/([^/]+)\/entries\/[^/]+$/) ?? [];
    if (!owner || owner !== normalizeEmail(owner) || !OWNER_EMAIL_RE.test(owner) || owner.includes("___") ||
      !isLifeCommissionReminderEntryId(doc.id)) continue;
    try {
      const data = doc.data() as Omit<EntryDoc, "id">;
      if (data.userEmail && normalizeEmail(data.userEmail) !== owner) continue;
      const list = byOwner.get(owner) ?? [];
      list.push({ ...data, id: doc.id, originalEntryId: null, userEmail: owner, source: "own" });
      byOwner.set(owner, list);
    } catch {
      result.failed += 1;
    }
  }

  const deliver = async (owner: string, entries: EntryDoc[]) => {
    try {
      const reminders = upcomingLifeCommissionContracts(entries, owner, asOf);
      if (!reminders.length) return;
      const account = await auth.getUserByEmail(owner).catch(error => {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      });
      if (!account || account.disabled || normalizeEmail(account.email) !== owner) return;
      const profile = await loadIntranetNotificationProfile(owner, account.uid);
      if (!profile || (typeof profile.userId === "string" && profile.userId.trim() && profile.userId !== account.uid)) return;

      const entriesRef = db.collection("users").doc(owner).collection("entries");
      const refs = [...new Set(reminders.map(item => item.entryId))].map(id => entriesRef.doc(id));
      const current = await db.getAll(...refs, { fieldMask: ["userEmail"] });
      const ownedIds = new Set(current.filter(doc => {
        const declaredOwner = doc.data()?.userEmail;
        return doc.exists && (!declaredOwner || normalizeEmail(declaredOwner) === owner);
      }).map(doc => doc.id));
      const contracts = reminders.filter(item => ownedIds.has(item.entryId));
      if (!contracts.length) return;

      const entryId = lifeCommissionReminderId(account.uid, today.slice(0, 7));
      const deepLink = `/posta?messageId=${entryId}`;
      const { written } = await writeMailboxEntryOnce({
        recipientEmail: owner, entryId, type: LIFE_COMMISSION_REMINDER_TYPE,
        title: TITLE, body: BODY, deepLink, lifeCommissionContracts: contracts, createdAtMs: now.getTime(),
      });
      if (!written) { result.duplicates += 1; return; }
      result.mailboxWritten += 1;

      if (!adminMessaging || record(record(profile.notificationSettings).channels).push === false) return;
      const tokens = collectPushTokens(profile).slice(0, 30);
      if (!tokens.length) return;
      try {
        const push = await adminMessaging.sendEachForMulticast({
          tokens, notification: { title: TITLE, body: PUSH_BODY },
          data: { type: LIFE_COMMISSION_REMINDER_TYPE, deepLink },
          webpush: {
            fcmOptions: { link: `${PUSH_ORIGIN}${deepLink}` },
            notification: { icon: "/pwa/icon-192.png", badge: "/pwa/icon-192.png", tag: entryId },
          },
        });
        result.pushSuccessCount += push.successCount;
        result.pushFailureCount += push.failureCount;
        const invalid = tokens.filter((_, index) => isPermanentInvalidPushTokenCode(push.responses[index]?.error?.code));
        if (invalid.length) await removeInvalidPushTokens(owner, invalid).catch(() => undefined);
      } catch { result.pushFailureCount += tokens.length; }
    } catch { result.failed += 1; }
  };

  const owners = [...byOwner];
  for (let index = 0; index < owners.length; index += CONCURRENCY) {
    await Promise.all(owners.slice(index, index + CONCURRENCY).map(([owner, entries]) => deliver(owner, entries)));
  }
  return result;
}
