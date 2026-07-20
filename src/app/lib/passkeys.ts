import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type { User as FirebaseUser } from "firebase/auth";
import { signInWithCustomToken } from "firebase/auth";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

export type PasskeyCredentialSummary = {
  credentialId: string;
  name: string;
  createdAtMs: number;
  lastUsedAtMs: number | null;
  transports: string[];
  credentialDeviceType: "singleDevice" | "multiDevice";
  credentialBackedUp: boolean;
};

type ApiErrorResponse = {
  ok?: boolean;
  error?: string;
};

type RegistrationOptionsResponse = {
  ok: true;
  options: PublicKeyCredentialCreationOptionsJSON;
};

type RegistrationFinishResponse = {
  ok: true;
  credential: PasskeyCredentialSummary;
};

type AuthenticationOptionsResponse = {
  ok: true;
  options: PublicKeyCredentialRequestOptionsJSON;
};

type AuthenticationFinishResponse = {
  ok: true;
  customToken: string;
  uid: string;
  email: string;
};

type CredentialsListResponse = {
  ok: true;
  credentials: PasskeyCredentialSummary[];
};

let passkeyBrowserRuntimePromise:
  | Promise<typeof import("@simplewebauthn/browser")>
  | null = null;

function loadPasskeyBrowserRuntime(): Promise<
  typeof import("@simplewebauthn/browser")
> {
  if (!passkeyBrowserRuntimePromise) {
    passkeyBrowserRuntimePromise = import("@simplewebauthn/browser");
  }
  return passkeyBrowserRuntimePromise;
}

async function parseJsonSafe(response: Response): Promise<ApiErrorResponse | null> {
  try {
    return (await response.json()) as ApiErrorResponse;
  } catch {
    return null;
  }
}

async function fetchJsonOrThrow<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(input, {
    ...(init ?? {}),
    headers,
    cache: init?.cache ?? "no-store",
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

export async function getPasskeyAvailability(): Promise<{
  supported: boolean;
  platformAvailable: boolean;
}> {
  if (typeof window === "undefined" || typeof window.PublicKeyCredential !== "function") {
    return { supported: false, platformAvailable: false };
  }

  const platformAvailable =
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
    "function"
      ? await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(
          () => false
        )
      : false;
  return { supported: true, platformAvailable };
}

export function resolvePasskeyErrorMessage(
  error: unknown,
  fallback: string
): string {
  const err = error as { name?: string; message?: string };
  if (err?.name === "NotAllowedError") {
    return "Ověření bylo zrušené nebo vypršel časový limit.";
  }
  if (err?.name === "InvalidStateError") {
    return "Tento přístupový klíč už je pro účet uložený.";
  }
  if (err?.name === "NotSupportedError") {
    return "Tento prohlížeč nebo zařízení přístupové klíče nepodporuje.";
  }
  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message.trim();
  }
  return fallback;
}

export async function createPasskeyForUser(
  user: FirebaseUser,
  name: string
): Promise<PasskeyCredentialSummary> {
  const optionsPayload =
    await fetchAuthedJsonOrThrow<RegistrationOptionsResponse>(
      user,
      "/api/auth/passkeys/registration-options",
      { method: "POST", body: JSON.stringify({}) }
    );

  const { startRegistration } = await loadPasskeyBrowserRuntime();
  const attestation = await startRegistration({
    optionsJSON: optionsPayload.options,
  });

  const finishPayload =
    await fetchAuthedJsonOrThrow<RegistrationFinishResponse>(
      user,
      "/api/auth/passkeys/registration",
      {
        method: "POST",
        body: JSON.stringify({ response: attestation, name }),
      }
    );

  return finishPayload.credential;
}

export async function signInWithPasskey(): Promise<void> {
  const optionsPayload = await fetchJsonOrThrow<AuthenticationOptionsResponse>(
    "/api/auth/passkeys/authentication-options",
    { method: "POST", body: JSON.stringify({}) }
  );

  const { startAuthentication } = await loadPasskeyBrowserRuntime();
  const assertion = await startAuthentication({
    optionsJSON: optionsPayload.options,
  });

  const finishPayload = await fetchJsonOrThrow<AuthenticationFinishResponse>(
    "/api/auth/passkeys/authentication",
    {
      method: "POST",
      body: JSON.stringify({ response: assertion }),
    }
  );

  await signInWithCustomToken(auth, finishPayload.customToken);
}

export async function listPasskeysForUser(
  user: FirebaseUser
): Promise<PasskeyCredentialSummary[]> {
  const payload = await fetchAuthedJsonOrThrow<CredentialsListResponse>(
    user,
    "/api/auth/passkeys/credentials"
  );
  return Array.isArray(payload.credentials) ? payload.credentials : [];
}

export async function deletePasskeyForUser(
  user: FirebaseUser,
  credentialId: string
): Promise<void> {
  await fetchAuthedJsonOrThrow(user, "/api/auth/passkeys/credentials", {
    method: "DELETE",
    body: JSON.stringify({ credentialId }),
  });
}
