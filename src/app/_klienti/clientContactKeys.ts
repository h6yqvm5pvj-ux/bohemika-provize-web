const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export const clientPhoneKey = (value: unknown) => {
  const raw = text(value);
  if (!/^[+\d\s()./-]+$/.test(raw)) return "";
  let digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (!/^\d{9,15}$/.test(digits) || /^(\d)\1+$/.test(digits)) return "";
  if (digits.length === 9) digits = `420${digits}`;
  return digits;
};
export const clientEmailKey = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value)) ? text(value).toLowerCase() : "";
