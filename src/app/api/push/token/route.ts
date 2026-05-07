import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { normalizeDeviceId, normalizeToken, sanitizeUserAgent } from "@/lib/server/pushTokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUSH_TOKEN_RATE_LIMIT = 60;
const PUSH_TOKEN_RATE_LIMIT_WINDOW_MS = 60_000;

type PushTokenPayload = {
  token: string | null;
  deviceId: string;
  userAgent: string;
};

function parseBody(raw: unknown): PushTokenPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const token = normalizeToken(row.token);
  const deviceId = normalizeDeviceId(row.deviceId);
  const userAgent = sanitizeUserAgent(row.userAgent);
  if (!deviceId) return null;
  return { token: token || null, deviceId, userAgent };
}

async function saveToken({
  email,
  token,
  deviceId,
  userAgent,
}: {
  email: string;
  token: string;
  deviceId: string;
  userAgent: string;
}) {
  if (!adminDb) {
    throw new Error("Server není správně nakonfigurován (Firebase Admin).");
  }

  const privateRef = adminDb.collection("usersPrivate").doc(email);
  const publicRef = adminDb.collection("users").doc(email);

  const tokenMaps = { [deviceId]: token };
  const tokenMetaByDevice = {
    [deviceId]: {
      token,
      updatedAt: FieldValue.serverTimestamp(),
      userAgent,
    },
  };

  await Promise.all([
    privateRef.set(
      {
        fcmToken: token,
        pushToken: token,
        notificationToken: token,
        fcmTokens: FieldValue.arrayUnion(token),
        pushTokens: FieldValue.arrayUnion(token),
        notificationTokens: FieldValue.arrayUnion(token),
        fcmTokensByDevice: tokenMaps,
        pushTokensByDevice: tokenMaps,
        pushTokenMetaByDevice: tokenMetaByDevice,
        pushTokenUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    publicRef.set(
      {
        fcmToken: token,
        pushTokenUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
  ]);
}

async function removeToken({
  email,
  token,
  deviceId,
}: {
  email: string;
  token: string | null;
  deviceId: string;
}) {
  if (!adminDb) {
    throw new Error("Server není správně nakonfigurován (Firebase Admin).");
  }

  const privateRef = adminDb.collection("usersPrivate").doc(email);
  const publicRef = adminDb.collection("users").doc(email);
  const [privateSnap, publicSnap] = await Promise.all([privateRef.get(), publicRef.get()]);

  if (privateSnap.exists) {
    const privateData = (privateSnap.data() as Record<string, unknown> | undefined) ?? {};
    const tokenFromFcmMap = normalizeToken(
      (
        privateData.fcmTokensByDevice as Record<string, unknown> | undefined
      )?.[deviceId]
    );
    const tokenFromPushMap = normalizeToken(
      (
        privateData.pushTokensByDevice as Record<string, unknown> | undefined
      )?.[deviceId]
    );
    const effectiveToken = token || tokenFromFcmMap || tokenFromPushMap || null;
    const privatePatch: Record<string, unknown> = {
      pushTokenUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (effectiveToken) {
      privatePatch.fcmTokens = FieldValue.arrayRemove(effectiveToken);
      privatePatch.pushTokens = FieldValue.arrayRemove(effectiveToken);
      privatePatch.notificationTokens = FieldValue.arrayRemove(effectiveToken);
    }

    const fcmTokensByDeviceRaw = privateData.fcmTokensByDevice;
    if (fcmTokensByDeviceRaw && typeof fcmTokensByDeviceRaw === "object" && !Array.isArray(fcmTokensByDeviceRaw)) {
      const filtered = Object.fromEntries(
        Object.entries(fcmTokensByDeviceRaw as Record<string, unknown>).filter(([key, value]) => {
          if (key === deviceId) return false;
          if (!effectiveToken) return true;
          return normalizeToken(value) !== effectiveToken;
        })
      );
      privatePatch.fcmTokensByDevice = filtered;
    }

    const pushTokensByDeviceRaw = privateData.pushTokensByDevice;
    if (pushTokensByDeviceRaw && typeof pushTokensByDeviceRaw === "object" && !Array.isArray(pushTokensByDeviceRaw)) {
      const filtered = Object.fromEntries(
        Object.entries(pushTokensByDeviceRaw as Record<string, unknown>).filter(([key, value]) => {
          if (key === deviceId) return false;
          if (!effectiveToken) return true;
          return normalizeToken(value) !== effectiveToken;
        })
      );
      privatePatch.pushTokensByDevice = filtered;
    }

    const pushTokenMetaByDeviceRaw = privateData.pushTokenMetaByDevice;
    if (
      pushTokenMetaByDeviceRaw &&
      typeof pushTokenMetaByDeviceRaw === "object" &&
      !Array.isArray(pushTokenMetaByDeviceRaw)
    ) {
      const filtered = Object.fromEntries(
        Object.entries(pushTokenMetaByDeviceRaw as Record<string, unknown>).filter(([key]) => key !== deviceId)
      );
      privatePatch.pushTokenMetaByDevice = filtered;
    }

    if (effectiveToken && normalizeToken(privateData.fcmToken) === effectiveToken) {
      privatePatch.fcmToken = FieldValue.delete();
    }
    if (effectiveToken && normalizeToken(privateData.pushToken) === effectiveToken) {
      privatePatch.pushToken = FieldValue.delete();
    }
    if (effectiveToken && normalizeToken(privateData.notificationToken) === effectiveToken) {
      privatePatch.notificationToken = FieldValue.delete();
    }

    await privateRef.set(privatePatch, { merge: true });
  }

  if (publicSnap.exists) {
    const publicData = (publicSnap.data() as Record<string, unknown> | undefined) ?? {};
    const effectiveToken = token || normalizeToken(publicData.fcmToken) || null;
    const publicPatch: Record<string, unknown> = {
      pushTokenUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (effectiveToken && normalizeToken(publicData.fcmToken) === effectiveToken) {
      publicPatch.fcmToken = FieldValue.delete();
    }
    await publicRef.set(publicPatch, { merge: true });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:push-token:post",
    limit: PUSH_TOKEN_RATE_LIMIT,
    windowMs: PUSH_TOKEN_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = parseBody(body);
  if (!parsed || !parsed.token) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný payload. Očekávám token + deviceId." },
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    await saveToken({
      email: ctx.email,
      token: parsed.token,
      deviceId: parsed.deviceId,
      userAgent: parsed.userAgent,
    });
    return withRateLimitHeaders(
      NextResponse.json({ ok: true, tokenStored: true }),
      ctx
    );
  } catch (error) {
    console.error("Uložení push tokenu selhalo:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Push token se nepodařilo uložit." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:push-token:delete",
    limit: PUSH_TOKEN_RATE_LIMIT,
    windowMs: PUSH_TOKEN_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = parseBody(body);
  if (!parsed) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný payload. Očekávám minimálně deviceId." },
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    await removeToken({
      email: ctx.email,
      token: parsed.token,
      deviceId: parsed.deviceId,
    });
    return withRateLimitHeaders(
      NextResponse.json({ ok: true, tokenRemoved: true }),
      ctx
    );
  } catch (error) {
    console.error("Odhlášení push tokenu selhalo:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Push token se nepodařilo odhlásit." },
        { status: 500 }
      ),
      ctx
    );
  }
}
