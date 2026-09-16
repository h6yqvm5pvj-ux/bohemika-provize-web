import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type { User as FirebaseUser, UserCredential } from "firebase/auth";
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

type CredentialRenameResponse = {
  ok: true;
  credential: PasskeyCredentialSummary;
};

export type PasskeySignInStage = "preparation" | "verification" | "session";
export const PASSKEY_REQUEST_TIMEOUT_MS = 15_000;
const PASSKEY_PROMPT_TIMEOUT_MS = 60_000;

function passkeyTimeoutError(): Error {
  return Object.assign(new Error("Přihlášení trvá příliš dlouho. Zkontroluj připojení a zkus to znovu."), { code: "auth/timeout" });
}

// Aborting must settle the caller even if a browser/API promise ignores its
// signal. A late response must never continue to the next sign-in step.
function runPasskeyStep<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal | null,
  timeoutMs = PASSKEY_REQUEST_TIMEOUT_MS,
  onAbort?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const controller = new AbortController();
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      settle();
    };
    const abort = (reason: unknown) => {
      if (settled) return;
      finish(() => {
        controller.abort(reason);
        onAbort?.();
        reject(reason);
      });
    };
    const cancel = () => abort(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(() => abort(passkeyTimeoutError()), timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    }).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

let passkeyBrowserRuntimePromise:
  | Promise<typeof import("@simplewebauthn/browser")>
  | null = null;

function loadPasskeyBrowserRuntime(): Promise<
  typeof import("@simplewebauthn/browser")
> {
  if (!passkeyBrowserRuntimePromise) {
    passkeyBrowserRuntimePromise = import("@simplewebauthn/browser").catch(error => {
      passkeyBrowserRuntimePromise = null;
      throw error;
    });
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
  return runPasskeyStep(async signal => {
    let response: Response;
    try {
      response = await fetch(input, {
        ...(init ?? {}), headers, signal,
        cache: init?.cache ?? "no-store",
      });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw Object.assign(new Error("Server přihlášení není dostupný. Zkontroluj připojení a zkus to znovu."), { code: "auth/network-request-failed", cause: error });
    }
    const payload = await parseJsonSafe(response);
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    if (payload?.ok !== true) throw new Error("Server vrátil neplatnou odpověď přihlášení. Zkus to znovu.");
    return payload as T;
  }, init?.signal);
}

export async function getPasskeyAvailability(): Promise<{
  supported: boolean;
  platformAvailable: boolean;
}> {
  if (typeof window === "undefined" || typeof window.PublicKeyCredential !== "function") {
    return { supported: false, platformAvailable: false };
  }

  // Fetch the small browser runtime before the click where possible.
  void loadPasskeyBrowserRuntime().catch(() => {});

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
  if (err?.name === "AbortError") {
    return "Přihlášení přístupovým klíčem bylo zrušeno.";
  }
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

export async function signInWithPasskey({ signal, onStage }: {
  signal?: AbortSignal;
  onStage?: (stage: PasskeySignInStage) => void;
} = {}): Promise<UserCredential> {
  signal?.throwIfAborted();
  onStage?.("preparation");
  const optionsPayload = await fetchJsonOrThrow<AuthenticationOptionsResponse>(
    "/api/auth/passkeys/authentication-options",
    { method: "POST", body: JSON.stringify({}), signal }
  );

  const { startAuthentication, WebAuthnAbortService } = await runPasskeyStep(() => loadPasskeyBrowserRuntime(), signal);
  signal?.throwIfAborted();
  onStage?.("verification");
  const assertion = await runPasskeyStep(() => startAuthentication({
    optionsJSON: optionsPayload.options,
  }), signal, PASSKEY_PROMPT_TIMEOUT_MS, () => WebAuthnAbortService.cancelCeremony());

  signal?.throwIfAborted();
  onStage?.("session");
  const finishPayload = await fetchJsonOrThrow<AuthenticationFinishResponse>(
    "/api/auth/passkeys/authentication",
    {
      method: "POST",
      body: JSON.stringify({ response: assertion }),
      signal,
    }
  );

  signal?.throwIfAborted();
  return signInWithCustomToken(auth, finishPayload.customToken);
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

export async function renamePasskeyForUser(
  user: FirebaseUser,
  credentialId: string,
  name: string
): Promise<PasskeyCredentialSummary> {
  const payload = await fetchAuthedJsonOrThrow<CredentialRenameResponse>(
    user,
    "/api/auth/passkeys/credentials",
    {
      method: "PATCH",
      body: JSON.stringify({ credentialId, name }),
    }
  );
  return payload.credential;
}
