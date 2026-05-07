import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { clampMessage, collectPushTokens, normalizeToken } from "@/lib/server/pushTokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_PUSH_RATE_LIMIT = 20;
const TEST_PUSH_RATE_LIMIT_WINDOW_MS = 60_000;
const TEST_PUSH_MAX_MESSAGE_LEN = 200;
const MAX_TEST_PUSH_TARGETS = 30;

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  return null;
}

function parseMessage(raw: unknown): string {
  const fallback = "Test push z Nastavení";
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  return clampMessage((raw as Record<string, unknown>).message, fallback, TEST_PUSH_MAX_MESSAGE_LEN);
}

async function loadUserPushTokens(email: string): Promise<string[]> {
  if (!adminDb) return [];

  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(email).get(),
    adminDb.collection("usersPrivate").doc(email).get(),
  ]);

  const mergedProfile = {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };

  return collectPushTokens(mergedProfile).slice(0, MAX_TEST_PUSH_TARGETS);
}

async function removeInvalidTokens(email: string, invalidTokens: string[]) {
  if (!adminDb) return;
  const uniqueTokens = [...new Set(invalidTokens.map((token) => normalizeToken(token)).filter(Boolean))];
  if (uniqueTokens.length === 0) return;

  const privateRef = adminDb.collection("usersPrivate").doc(email);
  const publicRef = adminDb.collection("users").doc(email);
  const [privateSnap, publicSnap] = await Promise.all([privateRef.get(), publicRef.get()]);

  if (privateSnap.exists) {
    const data = (privateSnap.data() as Record<string, unknown> | undefined) ?? {};
    const privatePatch: Record<string, unknown> = {
      fcmTokens: FieldValue.arrayRemove(...uniqueTokens),
      pushTokens: FieldValue.arrayRemove(...uniqueTokens),
      notificationTokens: FieldValue.arrayRemove(...uniqueTokens),
      pushTokenUpdatedAt: FieldValue.serverTimestamp(),
    };

    const byDeviceKeys = ["fcmTokensByDevice", "pushTokensByDevice", "pushTokenMetaByDevice"] as const;
    byDeviceKeys.forEach((key) => {
      const raw = data[key];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const filtered = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).filter(([mapKey, mapValue]) => {
          if (key === "pushTokenMetaByDevice") {
            const meta = mapValue as Record<string, unknown> | null;
            const tokenCandidate = normalizeToken(meta?.token);
            if (tokenCandidate && uniqueTokens.includes(tokenCandidate)) return false;
            const fcmFromDeviceMap = data.fcmTokensByDevice;
            if (
              fcmFromDeviceMap &&
              typeof fcmFromDeviceMap === "object" &&
              !Array.isArray(fcmFromDeviceMap)
            ) {
              const tokenFromFcmMap = normalizeToken(
                (fcmFromDeviceMap as Record<string, unknown>)[mapKey]
              );
              if (tokenFromFcmMap && uniqueTokens.includes(tokenFromFcmMap)) return false;
            }
            return true;
          }
          const tokenCandidate = normalizeToken(mapValue);
          return !tokenCandidate || !uniqueTokens.includes(tokenCandidate);
        })
      );
      privatePatch[key] = filtered;
    });

    if (uniqueTokens.includes(normalizeToken(data.fcmToken))) {
      privatePatch.fcmToken = FieldValue.delete();
    }
    if (uniqueTokens.includes(normalizeToken(data.pushToken))) {
      privatePatch.pushToken = FieldValue.delete();
    }
    if (uniqueTokens.includes(normalizeToken(data.notificationToken))) {
      privatePatch.notificationToken = FieldValue.delete();
    }

    await privateRef.set(privatePatch, { merge: true });
  }

  if (publicSnap.exists) {
    const data = (publicSnap.data() as Record<string, unknown> | undefined) ?? {};
    const publicPatch: Record<string, unknown> = {
      pushTokenUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (uniqueTokens.includes(normalizeToken(data.fcmToken))) {
      publicPatch.fcmToken = FieldValue.delete();
    }
    await publicRef.set(publicPatch, { merge: true });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:test-push:post",
    limit: TEST_PUSH_RATE_LIMIT,
    windowMs: TEST_PUSH_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const message = parseMessage(body);
  if (!adminDb || !adminMessaging) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Messaging)." },
        { status: 500 }
      ),
      ctx
    );
  }

  try {
    const tokens = await loadUserPushTokens(ctx.email);
    if (tokens.length === 0) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error:
              "Pro účet není uložený žádný push token. Aktivuj push v Nastavení na tomto zařízení.",
          },
          { status: 409 }
        ),
        ctx
      );
    }

    const webPushLink = `${req.nextUrl.protocol}//${req.nextUrl.host}/nastaveni`;

    const multicast = await adminMessaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "Bohemika SmartApp",
        body: message,
      },
      data: {
        type: "test_push",
        message,
        createdAt: new Date().toISOString(),
      },
      webpush: {
        fcmOptions: {
          link: webPushLink,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          requireInteraction: false,
          tag: "bohemika-test-push",
        },
      },
    });

    const invalidTokens: string[] = [];
    multicast.responses.forEach((row, index) => {
      if (row.success) return;
      const code = row.error?.code ?? "";
      if (INVALID_TOKEN_CODES.has(code)) {
        const token = tokens[index];
        if (token) invalidTokens.push(token);
      }
    });

    if (invalidTokens.length > 0) {
      await removeInvalidTokens(ctx.email, invalidTokens);
    }

    if (multicast.successCount === 0) {
      const firstError =
        readError(multicast.responses.find((row) => !row.success)?.error) ||
        "Žádný token nepřijal testovací notifikaci.";
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: firstError },
          { status: 502 }
        ),
        ctx
      );
    }

    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: true,
          sent: multicast.successCount,
          failed: multicast.failureCount,
          cleanedTokens: invalidTokens.length,
        }
      ),
      ctx
    );
  } catch (err) {
    console.error("Test push selhal:", err);
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: "Nepodařilo se odeslat testovací push notifikaci.",
        },
        { status: 502 }
      ),
      ctx
    );
  }
}
