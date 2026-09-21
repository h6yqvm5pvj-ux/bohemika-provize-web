import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, inMemoryPersistence, signOut, updateCurrentUser, type Auth, type User } from "firebase/auth";
import { firebaseApp } from "@/app/firebase-app";

type SetupSession = { app: FirebaseApp; auth: Auth };
let pending: SetupSession | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;

async function dispose(session: SetupSession) {
  try { await signOut(session.auth); }
  finally { await deleteApp(session.app); }
}

export async function discardPendingTotpSetupSession(): Promise<void> {
  const session = takePendingTotpSetupSession();
  if (session) await dispose(session);
}

// The verified password sign-in moves to an isolated, memory-only Auth instance.
// Neither credentials nor tokens enter URLs, browser storage, or app cookies.
export async function prepareTotpSetupSession(user: User): Promise<void> {
  await discardPendingTotpSetupSession();
  const app = initializeApp(firebaseApp.options, `totp-setup-${crypto.randomUUID()}`);
  let auth: Auth | undefined;
  try {
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
    await updateCurrentUser(auth, user);
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) throw new Error("Setup sign-in was not transferred.");
    pending = { app, auth };
    expiry = setTimeout(() => { void discardPendingTotpSetupSession().catch(() => {}); }, 60_000);
  } catch (error) {
    if (auth) await signOut(auth).catch(() => {});
    await deleteApp(app).catch(() => {});
    throw error;
  }
}

export function takePendingTotpSetupSession(): SetupSession | null {
  const session = pending;
  pending = null;
  clearTimeout(expiry);
  expiry = undefined;
  return session;
}
