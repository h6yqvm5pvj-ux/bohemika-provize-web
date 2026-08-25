import type { NextRequest } from "next/server";

import {
  ADMIN_IMPERSONATION_HEADER,
  hasImpersonationHeaderValue,
  normalizeImpersonationEmail,
} from "@/lib/adminImpersonationShared";
import {
  adminRoleAtLeast,
  resolveAdminRoleFromClaims,
} from "@/lib/adminAccess";
import { adminAuth } from "@/lib/server/firebaseAdmin";

export type ServerImpersonationContext = {
  actorEmail: string;
  actorUid: string;
  actorRole: ReturnType<typeof resolveAdminRoleFromClaims>;
  targetEmail: string;
  targetUid: string;
  targetDisplayName: string | null;
};

export type ServerImpersonationResult =
  | { ok: true; impersonation: ServerImpersonationContext | null }
  | { ok: false; error: string; status: number };

export async function resolveServerImpersonation({
  req,
  actorEmail,
  actorUid,
  decoded,
}: {
  req: NextRequest;
  actorEmail: string;
  actorUid: string;
  decoded: Record<string, unknown>;
}): Promise<ServerImpersonationResult> {
  const rawTargetEmail = req.headers.get(ADMIN_IMPERSONATION_HEADER);
  const targetEmail = normalizeImpersonationEmail(rawTargetEmail);
  if (hasImpersonationHeaderValue(rawTargetEmail) && !targetEmail) {
    return {
      ok: false,
      error: "Cílový e-mail pro administrátorské zastoupení není platný.",
      status: 400,
    };
  }
  if (!targetEmail) {
    return { ok: true, impersonation: null };
  }

  const normalizedActorEmail = normalizeImpersonationEmail(actorEmail);
  if (!normalizedActorEmail || targetEmail === normalizedActorEmail) {
    return { ok: true, impersonation: null };
  }

  if (!adminAuth) {
    return {
      ok: false,
      error: "Server není správně nakonfigurován (Firebase Admin).",
      status: 500,
    };
  }

  const actorRole = resolveAdminRoleFromClaims(normalizedActorEmail, decoded);
  if (!adminRoleAtLeast(actorRole, "admin")) {
    return {
      ok: false,
      error: "Nemáš oprávnění přepnout se za jiného uživatele.",
      status: 403,
    };
  }

  const targetUser = await adminAuth.getUserByEmail(targetEmail).catch((error: { code?: string }) => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  if (!targetUser) {
    return {
      ok: false,
      error: "Cílový uživatel pro přepnutí nebyl nalezen.",
      status: 404,
    };
  }
  if (targetUser.disabled) {
    return {
      ok: false,
      error: "Nelze se přepnout za deaktivovaný účet.",
      status: 403,
    };
  }

  const targetRole = resolveAdminRoleFromClaims(
    targetEmail,
    (targetUser.customClaims ?? {}) as Record<string, unknown>
  );
  if (targetRole) {
    return {
      ok: false,
      error: "Nelze se přepnout za administrátorský účet.",
      status: 403,
    };
  }

  return {
    ok: true,
    impersonation: {
      actorEmail: normalizedActorEmail,
      actorUid,
      actorRole,
      targetEmail,
      targetUid: targetUser.uid,
      targetDisplayName: targetUser.displayName || null,
    },
  };
}
