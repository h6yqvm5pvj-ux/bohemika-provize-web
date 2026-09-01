import type { Position } from "@/app/types/domain";

export const ADMIN_POSITIONS: { id: Position; label: string }[] = [
  { id: "poradce1", label: "Poradce 1" },
  { id: "poradce2", label: "Poradce 2" },
  { id: "poradce3", label: "Poradce 3" },
  { id: "poradce4", label: "Poradce 4" },
  { id: "poradce5", label: "Poradce 5" },
  { id: "poradce6", label: "Poradce 6" },
  { id: "poradce7", label: "Poradce 7" },
  { id: "poradce8", label: "Poradce 8" },
  { id: "poradce9", label: "Poradce 9" },
  { id: "poradce10", label: "Poradce 10" },
  { id: "manazer4", label: "Manažer 4" },
  { id: "manazer5", label: "Manažer 5" },
  { id: "manazer6", label: "Manažer 6" },
  { id: "manazer7", label: "Manažer 7" },
  { id: "manazer8", label: "Manažer 8" },
  { id: "manazer9", label: "Manažer 9" },
  { id: "manazer10", label: "Manažer 10" },
];

export const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
};

export const formatDateTime = (valueMs: number | null | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs)) return "—";
  return new Date(valueMs).toLocaleString("cs-CZ");
};

export const formatIsoDay = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
};

export const formatAuthDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
};

export const formatAccountTypeLabel = (
  value: string | null | undefined
): string => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "tipster") return "Tipař";
  if (normalized === "advisor") return "Vázaný zástupce";
  return "Bez typu účtu";
};

export const formatPositionLabel = (
  value: string | null | undefined
): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const known = ADMIN_POSITIONS.find((position) => position.id === raw)?.label;
  if (known) return known;

  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const poradceMatch = compact.match(/^poradce(\d+)$/);
  if (poradceMatch?.[1]) return `Poradce ${poradceMatch[1]}`;
  const managerMatch = compact.match(/^(manazer|manažer|manager)(\d+)$/);
  if (managerMatch?.[2]) return `Manažer ${managerMatch[2]}`;

  return raw;
};
