import { normalizeText } from "./statementParsing";

export const statementClientNameForCalculator = (value: string | null | undefined): string => {
  const name = normalizeText(value);
  if (!name) return "";
  if (
    /\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.|firma|obec|město|mesto|úřad|urad)\b/i.test(
      name
    )
  ) {
    return name;
  }

  const commaParts = name
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaParts.length === 2) return `${commaParts[1]} ${commaParts[0]}`;

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return name;
  const [surname, ...givenNames] = parts;
  return [...givenNames, surname].join(" ");
};
