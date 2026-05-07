const MAX_TOKEN_LEN = 4096;

const TOKEN_ARRAY_KEYS = ["fcmTokens", "pushTokens", "notificationTokens"] as const;
const TOKEN_MAP_KEYS = ["fcmTokensByDevice", "pushTokensByDevice"] as const;
const TOKEN_SINGLE_KEYS = ["fcmToken", "pushToken", "notificationToken"] as const;

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
