export async function confirmPasswordReset(code: string, password: string): Promise<void> {
  const response = await fetch("/api/auth/password-reset/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, password }), cache: "no-store", credentials: "same-origin",
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) {
    throw Object.assign(new Error("Potvrzení změny hesla selhalo."), { code: result?.code ?? "auth/reset-unavailable" });
  }
}
