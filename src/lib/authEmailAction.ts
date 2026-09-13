export const AUTH_EMAIL_ACTION_PATH = "/ucet/akce";
export type AuthEmailAction = { mode: "resetPassword" | "verifyEmail"; code: string };

/** Ignore any supplied API key, email or redirect; the app uses its own Firebase project. */
export function parseAuthEmailAction(search: string, hash: string): AuthEmailAction | null {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const hasFragment = fragment.has("mode") || fragment.has("oobCode");
  if (hasFragment && (query.has("mode") || query.has("oobCode"))) return null;
  const params = hasFragment ? fragment : query;
  const mode = params.get("mode");
  const code = params.get("oobCode");
  if (params.getAll("mode").length !== 1 || params.getAll("oobCode").length !== 1 ||
      (mode !== "resetPassword" && mode !== "verifyEmail") ||
      !code || code.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(code)) return null;
  return { mode, code };
}

/** A fragment is not sent in HTTP requests or Referer headers. Never persist the code. */
export function createAuthEmailActionUrl(action: AuthEmailAction): string {
  const url = new URL(AUTH_EMAIL_ACTION_PATH, "https://bohemka.app");
  url.hash = new URLSearchParams({ mode: action.mode, oobCode: action.code, lang: "cs" }).toString();
  return url.toString();
}
