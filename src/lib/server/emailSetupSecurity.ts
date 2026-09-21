import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { isAuthenticationRevoked, isPersistentAccountBlock, revocationFromAccountData } from "./tokenRevocation";

const denied = () => Object.assign(new Error("Pro ověření e-mailu se přihlas znovu."), { code: "auth/invalid-user-token" });

/** Only authorizes sending an inbox link, never an application session or data access. */
export async function getEmailSetupUser(auth: Auth, db: Firestore, token: string) {
  const decoded = await auth.verifyIdToken(token, true);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (decoded.firebase?.sign_in_provider !== "password" ||
      !Number.isSafeInteger(decoded.auth_time) || decoded.auth_time > nowSeconds + 60 ||
      nowSeconds - decoded.auth_time > 10 * 60 || !decoded.email ||
      !decoded.uid || decoded.uid.includes("/") || decoded.uid.length > 128) throw denied();

  const user = await auth.getUser(decoded.uid);
  if (user.disabled || !user.email || user.email.trim().toLowerCase() !== decoded.email.trim().toLowerCase()) throw denied();

  const data = (await db.collection("accountBlocks").doc(user.uid).get()).data();
  if (isAuthenticationRevoked(revocationFromAccountData(data), decoded.auth_time) ||
      (isPersistentAccountBlock(data) && data?.reason !== "missing-totp")) throw denied();

  return { uid: user.uid, email: user.email, emailVerified: user.emailVerified };
}
