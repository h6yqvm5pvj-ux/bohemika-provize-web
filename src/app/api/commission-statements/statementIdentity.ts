export type CommissionStatementIdentityParts = {
  statementId?: unknown;
  statementNumber?: unknown;
  statementPeriod?: unknown;
  statementDate?: unknown;
  advisorNumber?: unknown;
};

const normalizeIdentityPart = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("cs-CZ");

/**
 * A re-upload can have different HTML (and therefore a different content hash),
 * while still representing the very same statement. Prefer the business
 * identity whenever the statement header is complete enough and only fall
 * back to the stored document ID for legacy/incomplete statements.
 */
export const commissionStatementIdentityKey = ({
  statementId,
  statementNumber,
  statementPeriod,
  statementDate,
  advisorNumber,
}: CommissionStatementIdentityParts): string => {
  const number = normalizeIdentityPart(statementNumber);
  const period = normalizeIdentityPart(statementPeriod);
  const date = normalizeIdentityPart(statementDate);
  const advisor = normalizeIdentityPart(advisorNumber);

  if (number && (period || date)) {
    return `statement:${number}|${period}|${date}|${advisor}`;
  }

  const id = normalizeIdentityPart(statementId);
  return id ? `id:${id}` : "";
};

