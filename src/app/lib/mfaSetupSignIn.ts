import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import { clearServerSession, createServerSessionFromToken } from "./authSession";

/** Only call with the proof returned after successful inbox + TOTP enrollment. */
export async function signInAfterMfaSetup(signInToken: string | null): Promise<void> {
  if (!signInToken) throw new Error("2FA je nastavené. Přihlas se heslem a kódem z Authenticatoru.");
  try {
    const credential = await signInWithCustomToken(auth, signInToken);
    await createServerSessionFromToken(await credential.user.getIdToken());
  } catch (error) {
    await Promise.allSettled([clearServerSession(), signOut(auth)]);
    throw error;
  }
}
