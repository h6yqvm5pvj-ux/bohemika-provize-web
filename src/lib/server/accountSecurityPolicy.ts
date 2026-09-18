import type { Auth, DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { ACCOUNT_BLOCKED_CODE, ACCOUNT_BLOCKED_MESSAGE, hasTotpFactor, MFA_REAUTH_REQUIRED_CODE, MFA_REAUTH_REQUIRED_MESSAGE, TOTP_CUSTOM_TOKEN_CLAIM } from "@/lib/accountSecurity";

export function assertAccountSecurity(user: UserRecord): void {
  if (user.disabled || !user.emailVerified || !hasTotpFactor(user)) {
    throw Object.assign(new Error(ACCOUNT_BLOCKED_MESSAGE), { code: ACCOUNT_BLOCKED_CODE });
  }
}

function hasMfaProof(token: DecodedIdToken): boolean {
  return token.firebase?.sign_in_second_factor === "totp" ||
    (token.firebase?.sign_in_provider === "custom" && token[TOTP_CUSTOM_TOKEN_CLAIM] === true);
}

// All application API handlers share this Auth facade. Never cache account
// eligibility: removing TOTP or disabling an account must stop the next request.
// Preserve the SDK instance and bind its remaining methods to the original Auth.
export function withAccountSecurityPolicy(auth: Auth, isBlocked: (uid: string) => Promise<boolean>): Auth {
  const assertUnblocked = async (uid: string) => {
    if (await isBlocked(uid)) {
      throw Object.assign(new Error(ACCOUNT_BLOCKED_MESSAGE), { code: ACCOUNT_BLOCKED_CODE });
    }
  };
  const verifyIdToken: Auth["verifyIdToken"] = async token => {
    const decoded = await auth.verifyIdToken(token, true);
    const user = await auth.getUser(decoded.uid);
    assertAccountSecurity(user);
    await assertUnblocked(decoded.uid);
    if (!decoded.email_verified || !hasMfaProof(decoded)) {
      throw Object.assign(new Error(MFA_REAUTH_REQUIRED_MESSAGE), { code: MFA_REAUTH_REQUIRED_CODE });
    }
    return decoded;
  };
  const createCustomToken: Auth["createCustomToken"] = async (uid, claims) => {
    assertAccountSecurity(await auth.getUser(uid));
    await assertUnblocked(uid);
    // Only issued after the caller verifies WebAuthn or recent password + TOTP.
    // This proof is scoped to custom sign-in; normal password tokens cannot use it.
    return auth.createCustomToken(uid, { ...claims, [TOTP_CUSTOM_TOKEN_CLAIM]: true });
  };
  return new Proxy(auth, {
    get(target, property) {
      if (property === "verifyIdToken") return verifyIdToken;
      if (property === "createCustomToken") return createCustomToken;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
