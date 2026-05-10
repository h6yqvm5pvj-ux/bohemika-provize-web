import { NextResponse, type NextRequest } from "next/server";

import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntries } from "@/lib/server/mailbox";
import { collectPushTokens } from "@/lib/server/pushTokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAM_MESSAGE_URL =
  process.env.SEND_TEAM_MESSAGE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SEND_TEAM_MESSAGE_URL?.trim() ||
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/sendTeamMessage";

const TEAM_MESSAGE_RATE_LIMIT = 20;
const TEAM_MESSAGE_RATE_LIMIT_WINDOW_MS = 60_000;
const TEAM_MESSAGE_MAX_LEN = 200;
const TEAM_MESSAGE_MAX_RECIPIENTS = 500;
const TEAM_MESSAGE_MAX_TOKENS_PER_USER = 10;
const TEAM_MESSAGE_MAX_TOKENS_PER_MULTICAST = 500;
const TEAM_MESSAGE_MAX_USERS_SCAN = 8_000;

type TargetMode = "all" | "selected";

type ParsedPayload = {
  managerEmail: string;
  message: string;
  target: TargetMode;
  recipients?: string[];
};

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  const cap = (s: string) =>
    s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return parts.map(cap).join(" ");
}

function isTeamPushEnabled(profile: Record<string, unknown>): boolean {
  const settingsRaw = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  if (!settingsRaw) return true;

  const typesRaw = isPlainObject(settingsRaw.types) ? settingsRaw.types : null;
  const channelsRaw = isPlainObject(settingsRaw.channels)
    ? settingsRaw.channels
    : null;

  const teamTypeRaw = typesRaw?.team;
  const pushChannelRaw = channelsRaw?.push;
  const teamTypeEnabled =
    typeof teamTypeRaw === "boolean" ? teamTypeRaw : true;
  const pushChannelEnabled =
    typeof pushChannelRaw === "boolean" ? pushChannelRaw : true;
  return teamTypeEnabled && pushChannelEnabled;
}

function parsePayload(raw: unknown): ParsedPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const managerEmail = normalizeEmail(row.managerEmail);
  const message =
    typeof row.message === "string" ? row.message.trim().slice(0, TEAM_MESSAGE_MAX_LEN) : "";
  const target = row.target === "selected" ? "selected" : "all";
  const recipientsRaw = Array.isArray(row.recipients) ? row.recipients : [];
  const recipients = recipientsRaw
    .map((item) => normalizeEmail(item))
    .filter((email) => email.length > 0);

  if (!managerEmail || !message) return null;
  if (target === "selected" && recipients.length === 0) return null;

  return {
    managerEmail,
    message,
    target,
    ...(target === "selected" ? { recipients } : {}),
  };
}

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  return null;
}

type TeamHierarchyContext = {
  descendantEmails: string[];
  descendantSet: Set<string>;
  childrenByManager: Map<string, string[]>;
};

async function loadTeamHierarchyContext(
  managerEmail: string
): Promise<TeamHierarchyContext> {
  if (!adminDb) {
    return {
      descendantEmails: [],
      descendantSet: new Set<string>(),
      childrenByManager: new Map<string, string[]>(),
    };
  }

  const usersSnap = await adminDb
    .collection("users")
    .limit(TEAM_MESSAGE_MAX_USERS_SCAN)
    .get();

  const childrenByManager = new Map<string, string[]>();

  usersSnap.docs.forEach((docSnap) => {
    const profile =
      (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(profile.email) || normalizeEmail(docSnap.id);
    const directManagerEmail = normalizeEmail(profile.managerEmail);
    if (!email || !directManagerEmail || email === directManagerEmail) return;

    const arr = childrenByManager.get(directManagerEmail) ?? [];
    arr.push(email);
    childrenByManager.set(directManagerEmail, arr);
  });

  const visited = new Set<string>();
  const queue = [...(childrenByManager.get(managerEmail) ?? [])];

  while (queue.length > 0 && visited.size < TEAM_MESSAGE_MAX_RECIPIENTS) {
    const email = queue.shift() ?? "";
    if (!email || visited.has(email) || email === managerEmail) continue;
    visited.add(email);

    const children = childrenByManager.get(email) ?? [];
    children.forEach((child) => {
      if (child && !visited.has(child)) queue.push(child);
    });
  }

  return {
    descendantEmails: [...visited],
    descendantSet: visited,
    childrenByManager,
  };
}

function expandRootsToHierarchy(
  roots: string[],
  descendantSet: Set<string>,
  childrenByManager: Map<string, string[]>
): string[] {
  const uniqueRoots = [...new Set(roots.map((email) => normalizeEmail(email)).filter(Boolean))];
  const visited = new Set<string>();
  const queue = uniqueRoots.filter((email) => descendantSet.has(email));

  while (queue.length > 0 && visited.size < TEAM_MESSAGE_MAX_RECIPIENTS) {
    const email = queue.shift() ?? "";
    if (!email || visited.has(email) || !descendantSet.has(email)) continue;
    visited.add(email);

    const children = childrenByManager.get(email) ?? [];
    children.forEach((child) => {
      if (child && !visited.has(child)) queue.push(child);
    });
  }

  return [...visited];
}

async function resolveDispatchRecipients(
  payload: ParsedPayload
): Promise<
  | { ok: true; recipients: string[] }
  | { ok: false; status: number; error: string }
> {
  const hierarchy = await loadTeamHierarchyContext(payload.managerEmail);
  if (hierarchy.descendantEmails.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Nemáš žádné podřízené pro odeslání týmové zprávy.",
    };
  }

  const recipients =
    payload.target === "all"
      ? hierarchy.descendantEmails
      : expandRootsToHierarchy(
          payload.recipients ?? [],
          hierarchy.descendantSet,
          hierarchy.childrenByManager
        );

  if (recipients.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Vybraní příjemci nejsou mezi tvými podřízenými.",
    };
  }

  return { ok: true, recipients };
}

type TeamPushRecipient = {
  email: string;
  name: string;
  tokens: string[];
};

async function loadTeamPushRecipients(
  recipientEmails: string[]
): Promise<TeamPushRecipient[]> {
  if (!adminDb) return [];
  const privateCol = adminDb.collection("usersPrivate");
  const usersCol = adminDb.collection("users");

  const rows = await Promise.all(
    recipientEmails.map(async (email) => {
      const [publicSnap, privateSnap] = await Promise.all([
        usersCol.doc(email).get(),
        privateCol.doc(email).get(),
      ]);
      const publicProfile =
        (publicSnap.data() as Record<string, unknown> | undefined) ?? {};
      const privateProfile =
        (privateSnap.data() as Record<string, unknown> | undefined) ?? {};
      const merged = { ...publicProfile, ...privateProfile };

      if (!isTeamPushEnabled(merged)) return null;

      const tokens = collectPushTokens(merged).slice(
        0,
        TEAM_MESSAGE_MAX_TOKENS_PER_USER
      );
      if (tokens.length === 0) return null;

      const nameRaw = merged.name;
      const name =
        typeof nameRaw === "string" && nameRaw.trim().length > 0
          ? nameRaw.trim()
          : nameFromEmail(email);

      return { email, name, tokens } satisfies TeamPushRecipient;
    })
  );

  return rows.filter((row): row is TeamPushRecipient => row !== null);
}

type LocalTeamMessageResult =
  | {
      ok: true;
      recipients: number;
      sent: number;
    }
  | { ok: false; error: string };

async function sendTeamMessageViaPush({
  req,
  managerEmail,
  message,
  recipients,
}: {
  req: NextRequest;
  managerEmail: string;
  message: string;
  recipients: string[];
}): Promise<LocalTeamMessageResult> {
  if (!adminDb) {
    return {
      ok: false,
      error: "Server není správně nakonfigurován (Firebase Admin).",
    };
  }

  const deepLink = "/pomucky/zprava-tymu";
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const webPushLink = `${baseUrl}${deepLink}`;
  const createdAtIso = new Date().toISOString();
  const cleanMessage = message.slice(0, TEAM_MESSAGE_MAX_LEN);

  try {
    await writeMailboxEntries({
      recipientEmails: recipients,
      type: "team_message",
      title: "Zpráva od nadřízeného",
      body: cleanMessage,
      deepLink,
      metadata: { managerEmail },
    });
  } catch (error) {
    console.error("Writing mailbox notification for team message failed:", error);
  }

  if (!adminMessaging) {
    return {
      ok: true,
      recipients: recipients.length,
      sent: recipients.length,
    };
  }

  const pushRecipients = await loadTeamPushRecipients(recipients);
  if (pushRecipients.length === 0) {
    return {
      ok: true,
      recipients: recipients.length,
      sent: recipients.length,
    };
  }

  const tokenSet = new Set<string>();
  pushRecipients.forEach((recipient) => {
    recipient.tokens.forEach((token) => tokenSet.add(token));
  });
  const tokens = [...tokenSet];
  if (tokens.length === 0) {
    return {
      ok: true,
      recipients: recipients.length,
      sent: recipients.length,
    };
  }

  let successCount = 0;
  let firstErrorMessage: string | null = null;

  for (
    let i = 0;
    i < tokens.length;
    i += TEAM_MESSAGE_MAX_TOKENS_PER_MULTICAST
  ) {
    const chunk = tokens.slice(i, i + TEAM_MESSAGE_MAX_TOKENS_PER_MULTICAST);
    const multicast = await adminMessaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: "Zpráva od nadřízeného",
        body: cleanMessage,
      },
      data: {
        type: "team_message",
        managerEmail,
        message: cleanMessage,
        createdAt: createdAtIso,
        deepLink,
      },
      webpush: {
        fcmOptions: {
          link: webPushLink,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: "bohemika-team-message",
          requireInteraction: false,
        },
      },
    });

    successCount += multicast.successCount;
    if (!firstErrorMessage && multicast.failureCount > 0) {
      firstErrorMessage =
        readError(multicast.responses.find((row) => !row.success)?.error) ??
        null;
    }
  }

  if (successCount <= 0) {
    return {
      ok: false,
      error: firstErrorMessage || "Nepodařilo se doručit push notifikaci.",
    };
  }

  return {
    ok: true,
    recipients: pushRecipients.length,
    sent: successCount,
  };
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:team-message:post",
    limit: TEAM_MESSAGE_RATE_LIMIT,
    windowMs: TEAM_MESSAGE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const payload = parsePayload(body);
  if (!payload) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný payload pro odeslání týmové zprávy." },
        { status: 400 }
      ),
      ctx
    );
  }

  if (payload.managerEmail !== ctx.email) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "managerEmail musí odpovídat přihlášenému účtu." },
        { status: 403 }
      ),
      ctx
    );
  }

  const resolved = await resolveDispatchRecipients(payload);
  if (!resolved.ok) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status }),
      ctx
    );
  }

  const dispatchPayload = {
    managerEmail: payload.managerEmail,
    message: payload.message,
    target: "selected" as const,
    recipients: resolved.recipients,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const upstream = await fetch(TEAM_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.token}`,
      },
      body: JSON.stringify(dispatchPayload),
      signal: controller.signal,
      cache: "no-store",
    });

    const upstreamPayload = await upstream.json().catch(() => null);
    if (
      !upstream.ok ||
      (upstreamPayload as { ok?: boolean } | null)?.ok === false
    ) {
      const errorMessage =
        readError(upstreamPayload) ||
        `Odeslání zprávy selhalo (HTTP ${upstream.status}).`;

      if (upstream.status >= 500) {
        const localResult = await sendTeamMessageViaPush({
          req,
          managerEmail: payload.managerEmail,
          message: payload.message,
          recipients: resolved.recipients,
        });
        if (localResult.ok) {
          return withRateLimitHeaders(
            NextResponse.json({
              ok: true,
              message:
                localResult.sent === 1
                  ? "Zpráva byla odeslána 1 příjemci."
                  : `Zpráva byla odeslána ${localResult.sent} příjemcům.`,
              delivery: "local-push-fallback",
            }),
            ctx
          );
        }

        const response = NextResponse.json(
          { ok: false, error: localResult.error || errorMessage },
          { status: upstream.ok ? 502 : upstream.status }
        );
        return withRateLimitHeaders(response, ctx);
      }

      const response = NextResponse.json(
        { ok: false, error: errorMessage },
        { status: upstream.ok ? 502 : upstream.status }
      );
      return withRateLimitHeaders(response, ctx);
    }

    return withRateLimitHeaders(
      NextResponse.json(
        upstreamPayload && typeof upstreamPayload === "object"
          ? upstreamPayload
          : { ok: true }
      ),
      ctx
    );
  } catch (err: any) {
    const localResult = await sendTeamMessageViaPush({
      req,
      managerEmail: payload.managerEmail,
      message: payload.message,
      recipients: resolved.recipients,
    });
    if (localResult.ok) {
      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          message:
            localResult.sent === 1
              ? "Zpráva byla odeslána 1 příjemci."
              : `Zpráva byla odeslána ${localResult.sent} příjemcům.`,
          delivery: "local-push-fallback",
        }),
        ctx
      );
    }

    const isTimeout = err?.name === "AbortError";
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: isTimeout
            ? "Odeslání týmové zprávy timeoutovalo."
            : localResult.error ||
              "Nepodařilo se spojit se službou pro týmové zprávy.",
        },
        { status: 504 }
      ),
      ctx
    );
  } finally {
    clearTimeout(timeout);
  }
}
