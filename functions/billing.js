"use strict";
const { createHash, timingSafeEqual } = require("node:crypto");
const { failure } = require("./security");

function nextMonth(date) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

async function processInvoice(admin, req, secret) {
  if (typeof secret !== "string" || !secret.trim()) throw failure(503, "WEBHOOK_NOT_CONFIGURED");
  const authorization = req.headers.authorization;
  const digest = value => createHash("sha256").update(value).digest();
  if (typeof authorization !== "string" || !timingSafeEqual(digest(secret), digest(authorization))) throw failure(401, "UNAUTHORIZED");
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) throw failure(415, "JSON_REQUIRED");
  if ((req.rawBody?.length || Buffer.byteLength(JSON.stringify(req.body || {}))) > 65536) throw failure(413, "REQUEST_TOO_LARGE");
  const invoice = req.body?.invoice || req.body?.body?.invoice || req.body;
  if (!invoice || typeof invoice !== "object" || Array.isArray(invoice)) throw failure(400, "INVALID_INVOICE");
  const state = invoice.state || invoice.status || "";
  if (!(typeof state === "string" && state.toLowerCase() === "paid") && !invoice.paid_at && !invoice.paid_on && !invoice.paid) return "Invoice not paid yet, skipping";
  const id = typeof invoice.id === "string" || Number.isSafeInteger(invoice.id) ? String(invoice.id).trim() : "";
  if (!id || id.length > 128) throw failure(400, "INVOICE_ID_REQUIRED");
  const total = Number(invoice.total_with_vat ?? invoice.total ?? invoice.amount ?? 0);
  const plan = [[50,"JRStruktura"],[200,"poradce"],[270,"manazer"]].find(([amount]) => Number.isFinite(total) && Math.abs(total - amount) <= 5)?.[1];
  if (!plan) return "Unknown amount, subscription not updated";
  const clientName = invoice.client_name || invoice.client_full_name || invoice.subject?.name || invoice.subject?.full_name;
  if (typeof clientName !== "string" || !clientName.trim() || clientName.length > 300) throw failure(400, "INVALID_CLIENT_NAME");
  const db = admin.firestore();
  const eventRef = db.collection("billingWebhookInvoices").doc(createHash("sha256").update(`fakturoid:${id}`).digest("hex"));
  return db.runTransaction(async tx => {
    if ((await tx.get(eventRef)).exists) return "Invoice already processed";
    let users = await tx.get(db.collection("users").where("billingName", "==", clientName).limit(2));
    if (users.empty) users = await tx.get(db.collection("users").where("fullName", "==", clientName).limit(2));
    if (users.empty) return "User not found, skipping";
    if (users.docs.length !== 1) throw failure(409, "AMBIGUOUS_CLIENT");
    const user = users.docs[0], data = user.data() || {};
    // Also recognize the most recent invoice processed by the previous version.
    if (String(data.lastInvoiceId ?? "") === id) {
      tx.create(eventRef, { invoiceId: id, userId: user.id, migrated: true, processedAt: admin.firestore.Timestamp.fromDate(new Date()) });
      return "Invoice already processed";
    }
    const now = new Date();
    const paidUntil = data.paidUntil?.toDate?.();
    const base = paidUntil instanceof Date && Number.isFinite(paidUntil.getTime()) && paidUntil > now ? paidUntil : now;
    tx.set(user.ref, { subscriptionStatus: "active", subscriptionPlan: plan,
      paidUntil: admin.firestore.Timestamp.fromDate(nextMonth(base)), lastInvoiceId: invoice.id,
      lastInvoiceTotal: total, lastInvoiceUpdatedAt: admin.firestore.Timestamp.fromDate(now) }, { merge: true });
    tx.create(eventRef, { invoiceId: id, userId: user.id, processedAt: admin.firestore.Timestamp.fromDate(now) });
    return "Subscription updated";
  });
}
module.exports = { processInvoice, nextMonth };
