export const normalizeCzechBirthNumber = (
  value: string | null | undefined
): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length === 9 || digits.length === 10 ? digits : null;
};

export const birthDateFromCzechBirthNumber = (
  value: string | null | undefined
): string | null => {
  const birthNumber = normalizeCzechBirthNumber(value);
  if (!birthNumber) return null;

  const yearSuffix = Number(birthNumber.slice(0, 2));
  const rawMonth = Number(birthNumber.slice(2, 4));
  const day = Number(birthNumber.slice(4, 6));
  if (!Number.isInteger(yearSuffix) || !Number.isInteger(day) || day < 1) return null;

  let month = rawMonth;
  if (rawMonth >= 71 && rawMonth <= 82) {
    month -= 70;
  } else if (rawMonth >= 51 && rawMonth <= 62) {
    month -= 50;
  } else if (rawMonth >= 21 && rawMonth <= 32) {
    month -= 20;
  }
  if (month < 1 || month > 12) return null;

  const currentYearSuffix = new Date().getFullYear() % 100;
  const year =
    birthNumber.length === 9
      ? 1900 + yearSuffix
      : yearSuffix <= currentYearSuffix
        ? 2000 + yearSuffix
        : 1900 + yearSuffix;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
};
