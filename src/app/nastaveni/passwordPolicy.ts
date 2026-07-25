export const PASSWORD_MIN_LENGTH = 8;

type PasswordPolicyInput = {
  password: string;
  confirmPassword: string;
  userFullName: string;
  userEmail: string;
};

export type PasswordPolicyCheck = {
  id: "length" | "uppercase" | "digit" | "symbol" | "identity" | "match";
  label: string;
  passed: boolean;
  message: string;
};

const normalizeForPasswordPolicy = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const passwordIdentityTokens = (fullName: string, email: string): string[] => {
  const emailLocalPart = email.split("@")[0] ?? "";
  const source = `${fullName} ${emailLocalPart}`;
  const tokens = normalizeForPasswordPolicy(source)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return Array.from(new Set(tokens));
};

const containsIdentityToken = (
  password: string,
  fullName: string,
  email: string
): boolean => {
  const normalizedPassword = normalizeForPasswordPolicy(password);
  if (!normalizedPassword) return false;
  return passwordIdentityTokens(fullName, email).some((token) =>
    normalizedPassword.includes(token)
  );
};

export const getPasswordPolicyChecks = ({
  password,
  confirmPassword,
  userFullName,
  userEmail,
}: PasswordPolicyInput): PasswordPolicyCheck[] => [
  {
    id: "length",
    label: `Alespoň ${PASSWORD_MIN_LENGTH} znaků`,
    passed: password.length >= PASSWORD_MIN_LENGTH,
    message: `Nové heslo musí mít alespoň ${PASSWORD_MIN_LENGTH} znaků.`,
  },
  {
    id: "uppercase",
    label: "Alespoň jedno velké písmeno",
    passed: /\p{Lu}/u.test(password),
    message: "Nové heslo musí obsahovat alespoň jedno velké písmeno.",
  },
  {
    id: "digit",
    label: "Alespoň jednu číslici",
    passed: /\d/.test(password),
    message: "Nové heslo musí obsahovat alespoň jednu číslici.",
  },
  {
    id: "symbol",
    label: "Alespoň jeden speciální znak",
    passed: /[^\p{L}\p{N}\s]/u.test(password),
    message: "Nové heslo musí obsahovat alespoň jeden speciální znak.",
  },
  {
    id: "identity",
    label: "Nesmí obsahovat jméno ani příjmení",
    passed: password.length > 0 && !containsIdentityToken(password, userFullName, userEmail),
    message: "Nové heslo nesmí obsahovat jméno ani příjmení uživatele.",
  },
  {
    id: "match",
    label: "Potvrzení hesla se shoduje",
    passed: password.length > 0 && password === confirmPassword,
    message: "Nové heslo a potvrzení se neshodují.",
  },
];

export const getPasswordPolicyFailure = (
  input: PasswordPolicyInput
): string | null =>
  getPasswordPolicyChecks(input).find((check) => !check.passed)?.message ?? null;
