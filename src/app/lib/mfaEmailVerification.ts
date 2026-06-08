import type { User as FirebaseUser } from "firebase/auth";

type ConfirmEmailForMfaResponse = {
  ok?: boolean;
  error?: string;
};

export async function confirmEmailForMfaEnrollment(user: FirebaseUser): Promise<void> {
  const token = await user.getIdToken(true);
  const response = await fetch("/api/auth/confirm-email-for-mfa", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response
    .json()
    .catch(() => null)) as ConfirmEmailForMfaResponse | null;
  if (!response.ok) {
    throw new Error(
      payload?.error || `Nepodařilo se potvrdit e-mail pro zapnutí 2FA (HTTP ${response.status}).`
    );
  }
  await user.reload();
}
