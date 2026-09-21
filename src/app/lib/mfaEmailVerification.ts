import type { User as FirebaseUser } from "firebase/auth";
import { requestVerificationEmail } from "./authEmailRequest";
import { resolveAuthEmailErrorMessage, safeAuthEmailErrorCode } from "@/lib/authEmailMessages";

/** Always read the current Firebase state before creating or enrolling a factor. */
export async function refreshEmailVerificationForMfa(user: FirebaseUser): Promise<boolean> {
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}

/** False means the user must open the inbox link before enrollment can continue. */
export async function ensureEmailVerifiedForMfaEnrollment(user: FirebaseUser): Promise<boolean> {
  try {
    // The confirmation usually happens in another tab, so never trust cached state.
    if (await refreshEmailVerificationForMfa(user)) return true;
    const alreadyVerified = await requestVerificationEmail(user);
    return alreadyVerified ? await refreshEmailVerificationForMfa(user) : false;
  } catch (error) {
    console.warn("[AuthEmail] verification:", safeAuthEmailErrorCode(error));
    throw new Error(resolveAuthEmailErrorMessage(error, "Nepodařilo se vyžádat ověřovací e-mail. Zkus to znovu nebo kontaktuj podporu."));
  }
}
