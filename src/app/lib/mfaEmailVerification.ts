import type { User as FirebaseUser } from "firebase/auth";
import { requestVerificationEmail } from "./authEmailRequest";
import { resolveAuthEmailErrorMessage, safeAuthEmailErrorCode } from "@/lib/authEmailMessages";

/** False means the user must open the inbox link before enrollment can continue. */
export async function ensureEmailVerifiedForMfaEnrollment(user: FirebaseUser): Promise<boolean> {
  try {
    // The confirmation usually happens in another tab, so never trust cached state.
    await user.reload();
    if (user.emailVerified) {
      await user.getIdToken(true);
      return true;
    }
    const alreadyVerified = await requestVerificationEmail(user);
    if (alreadyVerified) {
      await user.reload();
      if (user.emailVerified) {
        await user.getIdToken(true);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.warn("[AuthEmail] verification:", safeAuthEmailErrorCode(error));
    throw new Error(resolveAuthEmailErrorMessage(error, "Nepodařilo se vyžádat ověřovací e-mail. Zkus to znovu nebo kontaktuj podporu."));
  }
}
