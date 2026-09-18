import { randomUUID } from "node:crypto";
import type { Auth, DecodedIdToken, UpdateRequest } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

// Share the existing account-block document: Firestore's ten-read rule limit
// must still leave room for eight levels of the user hierarchy.
export const TOKEN_REVOCATIONS_COLLECTION = "accountBlocks";
export const TOKEN_GENERATION_CLAIM = "app_auth_generation";
type RevocationState = {
  validAfterSeconds: number;
  generation: string;
  pendingOperations: Record<string, true>;
};
const unavailable = () => Object.assign(new Error("Ověření přihlášení není dostupné."), { code: "auth/revocation-unavailable" });
const revoked = () => Object.assign(new Error("Přihlášení bylo zneplatněno. Přihlas se znovu."), { code: "auth/id-token-revoked" });

function revocationRef(db: Firestore, uid: string) {
  if (!uid || uid.includes("/") || uid.length > 128) throw unavailable();
  return db.collection(TOKEN_REVOCATIONS_COLLECTION).doc(uid);
}

function parseState(value: FirebaseFirestore.DocumentData | undefined): RevocationState {
  if (!value || !Number.isSafeInteger(value.validAfterSeconds) || value.validAfterSeconds < 0 ||
      typeof value.generation !== "string" || !/^[a-f\d-]{36}$/.test(value.generation) ||
      !value.pendingOperations || typeof value.pendingOperations !== "object" || Array.isArray(value.pendingOperations) ||
      Object.entries(value.pendingOperations).some(([key, pending]) => !/^[a-f\d-]{36}$/.test(key) || pending !== true)) {
    throw unavailable();
  }
  return value as RevocationState;
}

export async function readTokenRevocation(db: Firestore, uid: string): Promise<RevocationState | null> {
  const snapshot = await revocationRef(db, uid).get();
  return revocationFromAccountData(snapshot.data());
}

export function revocationFromAccountData(data: FirebaseFirestore.DocumentData | undefined): RevocationState | null {
  return data && Object.prototype.hasOwnProperty.call(data, "revocation") ? parseState(data.revocation) : null;
}

export function isPersistentAccountBlock(data: FirebaseFirestore.DocumentData | undefined): boolean {
  return data !== undefined && (Object.keys(data).length !== 1 || !Object.prototype.hasOwnProperty.call(data, "revocation"));
}

export function isAuthenticationRevoked(state: RevocationState | null, authTime: number): boolean {
  return state !== null && (Object.keys(state.pendingOperations).length > 0 ||
    !Number.isSafeInteger(authTime) || authTime < state.validAfterSeconds);
}

export async function assertTokenNotRevoked(db: Firestore, token: DecodedIdToken): Promise<void> {
  const state = await readTokenRevocation(db, token.uid);
  if (isAuthenticationRevoked(state, token.auth_time) ||
      (state && token.firebase?.sign_in_provider === "custom" && token[TOKEN_GENERATION_CLAIM] !== state.generation)) {
    throw revoked();
  }
}

async function waitForBoundary(validAfterSeconds: number): Promise<void> {
  const delay = validAfterSeconds * 1000 - Date.now();
  // Never accept tokens against a malformed/far-future cutoff or hold a function indefinitely.
  if (delay > 5_000) throw unavailable();
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay + 20));
}

/** Deny old tokens BEFORE the external mutation. Concurrent operations each keep
 * their own pending marker; an early completion cannot reopen the account.
 * A failed final Firestore commit leaves access closed for operator recovery. */
export async function withRevokedAuthentication<T>(db: Firestore, uid: string, operation: () => Promise<T>): Promise<T> {
  const ref = revocationRef(db, uid);
  const operationId = randomUUID();
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const previous = revocationFromAccountData(snapshot.data());
    if (previous && Object.keys(previous.pendingOperations).length >= 20) throw unavailable();
    tx.set(ref, { ...snapshot.data(), revocation: {
      validAfterSeconds: Math.max(previous?.validAfterSeconds ?? 0, Math.floor(Date.now() / 1000) + 1),
      generation: operationId,
      pendingOperations: { ...previous?.pendingOperations, [operationId]: true },
    } });
  });

  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try { outcome = { ok: true, value: await operation() }; }
  catch (error) { outcome = { ok: false, error }; }

  // Even an uncertain external result invalidates all prior authentication.
  // Completing one operation never deletes another operation's marker or cutoff.
  const state = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const current = parseState(snapshot.data()?.revocation);
    if (current.pendingOperations[operationId] !== true) throw unavailable();
    const pendingOperations = { ...current.pendingOperations };
    delete pendingOperations[operationId];
    const next = {
      ...current, pendingOperations,
      validAfterSeconds: Math.max(current.validAfterSeconds, Math.floor(Date.now() / 1000) + 1),
    };
    // Replace the entire nested map so a finished operation's key is deleted;
    // preserve all persistent block fields from this transaction's snapshot.
    tx.set(ref, { ...snapshot.data(), revocation: next });
    return next;
  });
  if (!outcome.ok) throw outcome.error;
  // Replacement cookies and custom-token exchanges must occur in a later second.
  await waitForBoundary(state.validAfterSeconds);
  return outcome.value;
}

const securityUpdate = (properties: UpdateRequest): boolean =>
  ["password", "email", "multiFactor"].some(key => Object.prototype.hasOwnProperty.call(properties, key)) ||
  properties.disabled === true || properties.emailVerified === false;

/** Shared by application handlers and operator scripts. No module-level SDK
 * initialization: emulators and scripts keep their own explicit Auth/Firestore. */
export function withFirestoreTokenRevocation(auth: Auth, db: Firestore): Auth {
  const verifyIdToken: Auth["verifyIdToken"] = async token => {
    const decoded = await auth.verifyIdToken(token, true);
    await assertTokenNotRevoked(db, decoded);
    return decoded;
  };
  const revokeRefreshTokens: Auth["revokeRefreshTokens"] = uid =>
    withRevokedAuthentication(db, uid, () => auth.revokeRefreshTokens(uid));
  const updateUser: Auth["updateUser"] = (uid, properties) => securityUpdate(properties)
    ? withRevokedAuthentication(db, uid, async () => {
      const user = await auth.updateUser(uid, properties);
      await auth.revokeRefreshTokens(uid);
      return user;
    }) : auth.updateUser(uid, properties);
  const setCustomUserClaims: Auth["setCustomUserClaims"] = (uid, claims) =>
    withRevokedAuthentication(db, uid, async () => {
      await auth.setCustomUserClaims(uid, claims);
      await auth.revokeRefreshTokens(uid);
    });
  const deleteUser: Auth["deleteUser"] = uid =>
    withRevokedAuthentication(db, uid, () => auth.deleteUser(uid));
  const createCustomToken: Auth["createCustomToken"] = async (uid, claims) => {
    const state = await readTokenRevocation(db, uid);
    if (state && Object.keys(state.pendingOperations).length > 0) throw unavailable();
    if (state) await waitForBoundary(state.validAfterSeconds);
    // Auth assigns a fresh auth_time when exchanging custom tokens. A generation
    // prevents an old, not-yet-exchanged custom token from surviving revocation.
    return auth.createCustomToken(uid, { ...claims, [TOKEN_GENERATION_CLAIM]: state?.generation ?? "initial" });
  };
  const overrides = { verifyIdToken, revokeRefreshTokens, updateUser, setCustomUserClaims, deleteUser, createCustomToken };
  return new Proxy(auth, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(overrides, property)) return overrides[property as keyof typeof overrides];
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
