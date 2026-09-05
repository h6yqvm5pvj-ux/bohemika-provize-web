export const profileFieldDigits = (value: string): string => value.replace(/\D+/g, "");

const groupDigits = (value: string): string =>
  value.match(/.{1,3}/g)?.join(" ") ?? "";

export function formatProfilePhoneInput(value: string): string {
  const withCountryPrefix = value.trimStart().startsWith("+");
  const digits = profileFieldDigits(value).slice(0, 15);
  if (!digits) return withCountryPrefix ? "+" : "";

  if (!withCountryPrefix) return groupDigits(digits);
  if (digits.length <= 3) return `+${digits}`;
  return `+${digits.slice(0, 3)} ${groupDigits(digits.slice(3))}`.trimEnd();
}

export function isValidProfilePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const digitCount = profileFieldDigits(trimmed).length;
  return digitCount >= 9 && digitCount <= 15;
}

export function isValidProfileIco(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || /^\d{8}$/.test(trimmed);
}
