export const ADMIN_IMPERSONATION_HEADER = "x-bohemika-impersonate-email";

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizeImpersonationEmail = (value: unknown): string => {
  const email = normalizeEmail(value);
  return EMAIL_RE.test(email) ? email : "";
};
