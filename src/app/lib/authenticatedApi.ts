import type { User as FirebaseUser } from "firebase/auth";

type JsonRecord = Record<string, unknown> | null;

function mergeHeaders(
  base: HeadersInit | undefined,
  authToken: string,
  body: BodyInit | null | undefined
): HeadersInit {
  const headers = new Headers(base ?? {});
  headers.set("Authorization", `Bearer ${authToken}`);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function parseJsonSafe(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return null;
  }
}

export async function fetchAuthedJson<T extends JsonRecord = JsonRecord>(
  user: FirebaseUser,
  input: string,
  init?: RequestInit
): Promise<{ response: Response; data: T }> {
  let token = await user.getIdToken();
  const requestWithToken = async (idToken: string) =>
    fetch(input, {
      ...(init ?? {}),
      headers: mergeHeaders(init?.headers, idToken, init?.body),
      cache: init?.cache ?? "no-store",
    });

  let response = await requestWithToken(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await requestWithToken(token);
  }

  const data = (await parseJsonSafe(response)) as T;
  return { response, data };
}

export async function fetchAuthedJsonOrThrow<T extends JsonRecord = JsonRecord>(
  user: FirebaseUser,
  input: string,
  init?: RequestInit
): Promise<T> {
  const { response, data } = await fetchAuthedJson<T>(user, input, init);
  if (!response.ok) {
    const message =
      (data &&
      typeof data === "object" &&
      typeof (data as Record<string, unknown>).error === "string"
        ? ((data as Record<string, unknown>).error as string)
        : null) || `HTTP ${response.status}`;
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  return data;
}
