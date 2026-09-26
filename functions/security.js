"use strict";

const { createHash } = require("node:crypto");
const { runtimeOptions } = require("./runtime");
const emailKey = value => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = value => /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(value) && value.length <= 254;
const failure = (status, code) => Object.assign(new Error(code), { status, code });

function assertRevocation(data, token) {
  if (!data) return;
  if (Object.keys(data).length !== 1 || !Object.hasOwn(data, "revocation")) throw failure(403, "ACCOUNT_BLOCKED");
  const r = data.revocation;
  if (!r || !Number.isSafeInteger(r.validAfterSeconds) || r.validAfterSeconds < 0 ||
      typeof r.generation !== "string" || !/^[a-f\d-]{36}$/.test(r.generation) ||
      !r.pendingOperations || typeof r.pendingOperations !== "object" || Array.isArray(r.pendingOperations) ||
      Object.entries(r.pendingOperations).some(([key, value]) => !/^[a-f\d-]{36}$/.test(key) || value !== true)) {
    throw failure(503, "SECURITY_CHECK_UNAVAILABLE");
  }
  if (Object.keys(r.pendingOperations).length || !Number.isSafeInteger(token.auth_time) ||
      token.auth_time < r.validAfterSeconds ||
      (token.firebase?.sign_in_provider === "custom" && token.app_auth_generation !== r.generation)) {
    throw failure(401, "TOKEN_REVOKED");
  }
}

async function authenticate(admin, req) {
  const header = req.headers.authorization;
  const match = typeof header === "string" && header.match(/^Bearer ([^\s]+)$/i);
  if (!match || match[1].length > 16384) throw failure(401, "UNAUTHENTICATED");
  let token, user;
  try {
    token = await admin.auth().verifyIdToken(match[1], true);
    user = await admin.auth().getUser(token.uid);
  } catch (error) {
    const invalid = new Set(["auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"]);
    throw failure(invalid.has(error.code) ? 401 : 503, invalid.has(error.code) ? "UNAUTHENTICATED" : "SECURITY_CHECK_UNAVAILABLE");
  }
  const email = emailKey(token.email);
  const mfa = token.firebase?.sign_in_second_factor === "totp" ||
    (token.firebase?.sign_in_provider === "custom" && token.app_totp_enrolled === true);
  if (user.disabled || !user.emailVerified || !token.email_verified || !mfa ||
      !user.multiFactor?.enrolledFactors?.some(f => f.factorId === "totp") ||
      !validEmail(email) || email !== emailKey(user.email) || !token.uid || token.uid.includes("/")) {
    throw failure(403, "ACCOUNT_SECURITY_REQUIRED");
  }
  const db = admin.firestore();
  const [block, profile] = await Promise.all([
    db.collection("accountBlocks").doc(token.uid).get(), db.collection("users").doc(email).get(),
  ]);
  assertRevocation(block.data(), token);
  if (!profile.exists || profile.data()?.userId !== token.uid) throw failure(403, "PROFILE_REQUIRED");
  return { ...token, email };
}

async function consumeRate(db, namespace, uid, limit, now = Date.now()) {
  const key = createHash("sha256").update(`functions:${namespace}:${uid}`).digest("hex");
  const ref = db.collection("_rateLimits").doc(key);
  const result = await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    const active = Number.isSafeInteger(data?.resetAtMs) && data.resetAtMs > now;
    const count = active && Number.isSafeInteger(data.count) ? data.count : 0;
    const resetAtMs = active ? data.resetAtMs : now + 60_000;
    if (count >= limit) return { allowed: false, resetAtMs, remaining: 0 };
    tx.set(ref, { count: count + 1, resetAtMs, expiresAt: new Date(resetAtMs) });
    return { allowed: true, resetAtMs, remaining: limit - count - 1 };
  });
  return result;
}

function securedRequest(admin, onRequest, name, options, handler) {
  const limits = { aiAssistant: 30, sendTeamMessage: 20, sendTestPush: 5, cuzkSuggestAddress: 60, cuzkLookupByAddress: 30, cuzkLookupByAdresniMisto: 30, rsvVehicleLookup: 40 };
  const method = ["aiAssistant", "sendTeamMessage", "sendTestPush"].includes(name) ? "POST" : "GET";
  return onRequest({ ...options, ...runtimeOptions(name) }, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", `${method}, OPTIONS`);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== method) return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    try {
      const identity = await authenticate(admin, req);
      if (method === "POST" && !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) throw failure(415, "JSON_REQUIRED");
      if ((req.rawBody?.length || Buffer.byteLength(JSON.stringify(req.body || {}))) > 65536 ||
          Buffer.byteLength(req.originalUrl || "") > 8192) throw failure(413, "REQUEST_TOO_LARGE");
      const rate = await consumeRate(admin.firestore(), name, identity.uid, limits[name]);
      res.set("X-RateLimit-Limit", String(limits[name]));
      res.set("X-RateLimit-Remaining", String(rate.remaining));
      if (!rate.allowed) {
        res.set("Retry-After", String(Math.max(1, Math.ceil((rate.resetAtMs - Date.now()) / 1000))));
        throw failure(429, "RATE_LIMITED");
      }
      req.verifiedIdentity = identity;
      return await handler(req, res);
    } catch (error) {
      const status = [400,401,403,413,415,429,503].includes(error.status) ? error.status : 503;
      return res.status(status).json({ ok: false, error: error.status ? error.code : "SECURITY_CHECK_UNAVAILABLE" });
    }
  });
}

// Verify every selected recipient before any message is sent. Follow only the
// recipient's parent chain, bounded at the same eight levels as database rules.
async function authorizeRecipients(db, manager, emails) {
  const unique = [...new Set(emails.map(emailKey))];
  if (!unique.length || unique.length > 500 || unique.some(e => !validEmail(e))) throw failure(400, "INVALID_RECIPIENTS");
  const cache = new Map();
  const load = async email => {
    if (!cache.has(email)) cache.set(email, db.collection("users").doc(email).get());
    return cache.get(email);
  };
  const authorized = [];
  for (const email of unique) {
    let current = email, accepted = false;
    const visited = new Set([email]);
    const recipient = await load(email);
    for (let depth = 0; depth < 8 && current !== manager; depth++) {
      const snap = await load(current);
      if (!snap.exists) break;
      const parent = emailKey(snap.data()?.managerEmail);
      if (parent === manager) { accepted = true; break; }
      if (!validEmail(parent) || visited.has(parent)) break;
      visited.add(parent); current = parent;
    }
    if (!accepted || !recipient.exists) throw failure(403, "RECIPIENT_FORBIDDEN");
    const privateProfile = await db.collection("usersPrivate").doc(email).get();
    authorized.push({ email, data: { ...recipient.data(), ...privateProfile.data() } });
  }
  return authorized;
}

module.exports = { authenticate, assertRevocation, consumeRate, securedRequest, authorizeRecipients, emailKey, validEmail, failure };
