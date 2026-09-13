import { NextRequest } from "next/server";
import { isSubscriptionCashflowOwner } from "@/app/cashflow/subscriptionCashflow";
import { getAdvisorSetupError } from "./advisorSetupGuard";
import { getAdminAuthContext } from "./adminAuth";

const normalizeEmail = (value: unknown): string => typeof value === "string" ? value.trim().toLowerCase() : "";
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Fresh access checks for diagnostic candidate reads, without loading financial
 * source rows. The caller authenticates its own account and allowlist first,
 * then captures a revision BEFORE calling this helper. The returned candidate
 * must still have that same revision after these checks and reconstruction.
 */
export async function authorizeCashflowCandidateRead(
  req: NextRequest,
  identity: { email: string; uid: string },
  tipsterMode: boolean,
): Promise<boolean> {
  if (req.signal.aborted || !identity || typeof identity.email !== "string" ||
    !identity.email || normalizeEmail(identity.email) !== identity.email ||
    typeof identity.uid !== "string" || !identity.uid || identity.uid.trim() !== identity.uid ||
    typeof tipsterMode !== "boolean") return false;
  try {
    const profileRequest = new NextRequest("http://cashflow-candidate.internal/api/user/profile", {
      method: "GET", headers: new Headers(req.headers), signal: req.signal,
    });
    const { GET } = await import("@/app/api/user/profile/route");
    if (req.signal.aborted) return false;
    const response = await GET(profileRequest);
    if (!response.ok || req.signal.aborted) return false;
    const body: unknown = await response.json();
    if (!object(body) || body.ok !== true || body.hasProfile !== true ||
      normalizeEmail(body.email) !== identity.email || !object(body.profile) || req.signal.aborted) return false;
    // Match the account-type resolution used by loadCashflowShadowInputs.
    const role = typeof body.profile.accountType === "string" ? body.profile.accountType
      : typeof body.profile.userRole === "string" ? body.profile.userRole : "";
    if ((role.trim().toLowerCase() === "tipster") !== tipsterMode) return false;

    if (tipsterMode) {
      // Same fresh setup check required by TIP payouts and statements. Do not
      // infer access merely from the role returned by the profile endpoint.
      const setupError = await getAdvisorSetupError(identity);
      return !setupError && !req.signal.aborted;
    }

    const { requireContractsEntryGuard } = await import("@/app/api/contracts/_lib/contractsApi");
    if (req.signal.aborted) return false;
    const contracts = await requireContractsEntryGuard(req, {
      namespace: "api:cashflow:candidate-access", limit: 30, windowMs: 60_000,
    }, { freshCashflowContext: true });
    // This guard also performs fresh setup/MFA checks, known-profile checks,
    // subscription checks and an uncached read of the manager hierarchy.
    if (!contracts.ok || contracts.ctx.accountType !== "advisor" || contracts.ctx.isImpersonating ||
      normalizeEmail(contracts.ctx.email) !== identity.email || contracts.ctx.uid !== identity.uid ||
      req.signal.aborted) return false;

    if (isSubscriptionCashflowOwner(identity.email)) {
      const admin = await getAdminAuthContext(req, {
        minimumRole: "owner", actionLabel: "cashflow předplatného",
      });
      if ("error" in admin || normalizeEmail(admin.adminEmail) !== identity.email || admin.adminUid !== identity.uid) return false;
    }
    return !req.signal.aborted;
  } catch {
    // Upstream errors, incomplete profiles and failed authorization are a miss;
    // neither their details nor a cached financial result leave this boundary.
    return false;
  }
}
