import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/firebaseAdmin";

const MAX_TOKEN_LEN = 4096;

const TOKEN_ARRAY_KEYS = ["fcmTokens", "pushTokens", "notificationTokens"] as const;
const TOKEN_MAP_KEYS = ["fcmTokensByDevice", "pushTokensByDevice"] as const;
const TOKEN_SINGLE_KEYS = ["fcmToken", "pushToken", "notificationToken"] as const;

const PERMANENT_INVALID_PUSH_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function normalizeToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  if (!token || token.length > MAX_TOKEN_LEN) return "";
  return token;
}

export function collectPushTokens(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return [];
  const out = new Set<string>();

  const push = (value: unknown) => {
    const token = normalizeToken(value);
    if (token) out.add(token);
  };

  TOKEN_SINGLE_KEYS.forEach((key) => push(data[key]));

  TOKEN_ARRAY_KEYS.forEach((key) => {
    const raw = data[key];
    if (!Array.isArray(raw)) return;
    raw.forEach((item) => push(item));
  });

  TOKEN_MAP_KEYS.forEach((key) => {
    const raw = data[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    Object.values(raw).forEach((item) => push(item));
  });

  return [...out];
}

export function isPermanentInvalidPushTokenCode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    PERMANENT_INVALID_PUSH_TOKEN_CODES.has(value.trim())
  );
}

const buildInvalidTokenCleanupPatch = (
  data: Record<string, unknown>,
  invalidTokens: string[]
): Record<string, unknown> => {
  const invalidSet = new Set(invalidTokens);
  const patch: Record<string, unknown> = {
    pushTokenUpdatedAt: FieldValue.serverTimestamp(),
  };

  TOKEN_ARRAY_KEYS.forEach((key) => {
    if (Array.isArray(data[key])) {
      patch[key] = FieldValue.arrayRemove(...invalidTokens);
    }
  });

  const fcmByDevice = isPlainObject(data.fcmTokensByDevice)
    ? data.fcmTokensByDevice
    : {};
  const pushByDevice = isPlainObject(data.pushTokensByDevice)
    ? data.pushTokensByDevice
    : {};

  TOKEN_MAP_KEYS.forEach((key) => {
    const raw = data[key];
    if (!isPlainObject(raw)) return;
    patch[key] = Object.fromEntries(
      Object.entries(raw).filter(
        ([, mapValue]) => !invalidSet.has(normalizeToken(mapValue))
      )
    );
  });

  if (isPlainObject(data.pushTokenMetaByDevice)) {
    patch.pushTokenMetaByDevice = Object.fromEntries(
      Object.entries(data.pushTokenMetaByDevice).filter(([deviceId, mapValue]) => {
        const metadataToken = isPlainObject(mapValue)
          ? normalizeToken(mapValue.token)
          : "";
        const deviceToken =
          normalizeToken(fcmByDevice[deviceId]) ||
          normalizeToken(pushByDevice[deviceId]);
        return !invalidSet.has(metadataToken) && !invalidSet.has(deviceToken);
      })
    );
  }

  TOKEN_SINGLE_KEYS.forEach((key) => {
    if (invalidSet.has(normalizeToken(data[key]))) {
      patch[key] = FieldValue.delete();
    }
  });

  return patch;
};

export async function removeInvalidPushTokens(
  email: string,
  invalidTokens: string[]
): Promise<number> {
  if (!adminDb) return 0;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return 0;

  const uniqueTokens = [
    ...new Set(invalidTokens.map((token) => normalizeToken(token)).filter(Boolean)),
  ];
  if (uniqueTokens.length === 0) return 0;

  const privateRef = adminDb.collection("usersPrivate").doc(normalizedEmail);
  const publicRef = adminDb.collection("users").doc(normalizedEmail);
  const [privateSnap, publicSnap] = await Promise.all([
    privateRef.get(),
    publicRef.get(),
  ]);
  const writes: Promise<FirebaseFirestore.WriteResult>[] = [];

  if (privateSnap.exists) {
    const privateData =
      (privateSnap.data() as Record<string, unknown> | undefined) ?? {};
    writes.push(
      privateRef.set(buildInvalidTokenCleanupPatch(privateData, uniqueTokens), {
        merge: true,
      })
    );
  }
  if (publicSnap.exists) {
    const publicData =
      (publicSnap.data() as Record<string, unknown> | undefined) ?? {};
    writes.push(
      publicRef.set(buildInvalidTokenCleanupPatch(publicData, uniqueTokens), {
        merge: true,
      })
    );
  }

  await Promise.all(writes);
  return uniqueTokens.length;
}

export function clampMessage(value: unknown, fallback: string, maxLen: number): string {
  if (typeof value !== "string") return fallback;
  const message = value.trim();
  if (!message) return fallback;
  return message.slice(0, maxLen);
}

export function normalizeDeviceId(value: unknown): string {
  if (typeof value !== "string") return "";
  const deviceId = value.trim();
  if (!deviceId) return "";
  if (deviceId.length > 120) return "";
  if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) return "";
  return deviceId;
}

export function sanitizeUserAgent(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 240);
}
