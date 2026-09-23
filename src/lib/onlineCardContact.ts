export type OnlineCardContactMethod = "phone" | "email";

export const isValidOnlineCardEmail = (value: string): boolean =>
  value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const isValidOnlineCardPhone = (value: string): boolean => {
  const digits = value.replace(/\D/g, "");
  return /^\+?[\d\s()./-]+$/.test(value.trim()) && digits.length >= 6 && digits.length <= 15;
};
