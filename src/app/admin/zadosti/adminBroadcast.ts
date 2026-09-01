import { nameFromEmail } from "./adminFormatters";
import type { AdminUsersRow } from "./adminUsers";

export const ADMIN_BROADCAST_EMOJI_OPTIONS = [
  "📣",
  "🔔",
  "✅",
  "⚠️",
  "🎉",
  "💡",
  "📄",
  "🔥",
];

export const ADMIN_BROADCAST_TARGETS = [
  { path: "/", label: "Domů" },
  { path: "/?contacts=1&source=contact-notification", label: "Kontakty" },
  { path: "/smlouvy", label: "Smlouvy" },
  { path: "/pomucky", label: "Pomůcky" },
  { path: "/intranet", label: "Intranet" },
  { path: "/muj-tym", label: "Můj tým" },
  { path: "/tipy", label: "Tipy" },
  { path: "/posta", label: "Pošta" },
  { path: "/cashflow", label: "Cashflow" },
  { path: "/nastaveni?tab=notifications", label: "Nastavení notifikací" },
  { path: "/pomucky/dokumenty", label: "Dokumenty" },
  { path: "/pomucky/zprava-tymu", label: "Zpráva týmu" },
] as const;

export const ADMIN_BROADCAST_TOOL_TARGETS = [
  { path: "/pomucky", label: "Přehled pomůcek" },
  { path: "/pomucky/argumenty", label: "Argumenty" },
  { path: "/pomucky/dokumenty", label: "Dokumenty" },
  { path: "/pomucky/zaznam", label: "Záznam z jednání" },
  { path: "/pomucky/vypoved-smlouvy", label: "Výpověď smlouvy" },
  {
    path: "/pomucky/jak-stiham-vypoved-smlouvy",
    label: "Jak stíhám výpověď smlouvy?",
  },
  { path: "/pomucky/nahrada-smlouvy", label: "Náhrada smlouvy" },
  { path: "/pomucky/tvorba", label: "Tvorba PDF" },
  { path: "/pomucky/ai-asistent", label: "AI Asistent" },
  { path: "/nastaveni?tab=onlineCard", label: "Online Vizitka" },
  { path: "/pomucky/hypoteka-vlastni-zdroje", label: "Hypotéka: vlastní zdroje" },
  { path: "/pomucky/statistika", label: "Statistika" },
  { path: "/pomucky/export-produkce", label: "Export produkce" },
  { path: "/pomucky/plan-produkce", label: "Plán produkce" },
  { path: "/pomucky/zlato", label: "Zlato" },
  { path: "/cuzk", label: "Nahlížení do katastru nemovitostí" },
  { path: "/pomucky/proklepka-vozidla", label: "Proklepka vozidla" },
  { path: "/pomucky/ares", label: "ARES" },
  { path: "/pomucky/projekce-vykonu", label: "Projekce výkonu" },
  {
    path: "/pomucky/nastaveni-zivotniho-pojisteni",
    label: "Jak nastavit životní pojištění",
  },
  {
    path: "/pomucky/srovnavac-trvalych-nasledku",
    label: "Srovnávač trvalých následků",
  },
  {
    path: "/pomucky/srovnavac-pracovni-neschopnosti",
    label: "Srovnávač pracovní neschopnosti",
  },
  {
    path: "/pomucky/srovnavac-zivotniho-pojisteni",
    label: "Srovnávač životního pojištění",
  },
  {
    path: "/pomucky/neon-life-vs-metlife-oneguard",
    label: "NEON Life vs. MetLife OneGuard",
  },
] as const;

export const ADMIN_BROADCAST_GROUPS = [
  { id: "advisors", label: "Poradci" },
  { id: "managers", label: "Manažeři" },
  { id: "specialists", label: "Specialisté" },
] as const;

export type AdminBroadcastRecipientMode = "all" | "group" | "single";
export type AdminBroadcastRecipientGroup =
  (typeof ADMIN_BROADCAST_GROUPS)[number]["id"];
export type AdminBroadcastDeliveryMode = "now" | "scheduled";

export type AdminBroadcastRecipientOption = {
  email: string;
  label: string;
  disabled: boolean;
};

export type AdminBroadcastGroupCounts = Record<AdminBroadcastRecipientGroup, number>;

export type AdminBroadcastResponse = {
  ok?: boolean;
  error?: string;
  scheduled?: boolean;
  broadcastId?: string;
  scheduledBroadcastId?: string;
  scheduledAtIso?: string;
  scannedUsers?: number;
  matchedUsers?: number;
  recipients?: number;
  uniqueTokens?: number;
  sent?: number;
  failed?: number;
  skippedPushDisabled?: number;
  skippedNoToken?: number;
  cleanedTokens?: number;
};

export type AdminBroadcastStatus = {
  type: "success" | "error" | "info";
  message: string;
};

export type AdminBroadcastRequestBody = {
  emoji: string;
  title: string;
  message: string;
  targetPath: string;
  targetMode: AdminBroadcastRecipientMode;
  recipientEmail?: string;
  recipientGroup?: AdminBroadcastRecipientGroup;
  scheduledAt: string | null;
};

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const normalizePositionKey = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

const isAdvisorPositionKey = (value: string | null | undefined): boolean =>
  /^poradce\d*$/.test(normalizePositionKey(value));

const isManagerPositionKey = (value: string | null | undefined): boolean =>
  /^(manazer|manažer|manager)\d*$/.test(normalizePositionKey(value));

export const buildAdminBroadcastRecipientOptions = (
  rows: AdminUsersRow[]
): AdminBroadcastRecipientOption[] =>
  rows
    .map((row) => {
      const email = normalizeEmail(row.email);
      if (!email) return null;
      return {
        email,
        label: row.fullName || nameFromEmail(row.email),
        disabled: row.disabled,
      };
    })
    .filter((row): row is AdminBroadcastRecipientOption => row !== null)
    .sort((a, b) => a.label.localeCompare(b.label, "cs"));

export const countAdminBroadcastGroups = (
  rows: AdminUsersRow[]
): AdminBroadcastGroupCounts => ({
  advisors: rows.filter(
    (row) => row.accountType === "advisor" && isAdvisorPositionKey(row.position)
  ).length,
  managers: rows.filter(
    (row) => row.accountType === "advisor" && isManagerPositionKey(row.position)
  ).length,
  specialists: rows.filter(
    (row) => row.specialist === true && row.accountType !== "tipster"
  ).length,
});

export const resolveAdminBroadcastTarget = ({
  targetPath,
  toolTargetPath,
  customTargetPath,
}: {
  targetPath: string;
  toolTargetPath: string;
  customTargetPath: string;
}) => {
  const selected =
    targetPath === "__custom__"
      ? customTargetPath.trim()
      : targetPath === "/pomucky"
        ? toolTargetPath
        : targetPath;
  const effectivePath = selected || "/";

  if (targetPath === "__custom__") {
    return { effectivePath, label: "Vlastní cesta" };
  }
  if (targetPath === "/pomucky") {
    const toolLabel =
      ADMIN_BROADCAST_TOOL_TARGETS.find((target) => target.path === toolTargetPath)
        ?.label ?? "Pomůcky";
    return { effectivePath, label: `Pomůcky: ${toolLabel}` };
  }

  return {
    effectivePath,
    label:
      ADMIN_BROADCAST_TARGETS.find((target) => target.path === targetPath)?.label ??
      "Vybraná stránka",
  };
};

export const resolveAdminBroadcastRecipientLabel = ({
  mode,
  group,
  email,
  options,
  groupCounts,
}: {
  mode: AdminBroadcastRecipientMode;
  group: AdminBroadcastRecipientGroup;
  email: string;
  options: AdminBroadcastRecipientOption[];
  groupCounts: AdminBroadcastGroupCounts;
}): string => {
  if (mode === "all") return "Všichni s aktivním push tokenem";
  if (mode === "group") {
    const groupLabel =
      ADMIN_BROADCAST_GROUPS.find((candidate) => candidate.id === group)?.label ??
      "Vybraná skupina";
    return `${groupLabel} (${groupCounts[group]} účtů)`;
  }

  const normalizedEmail = normalizeEmail(email);
  const selected = options.find((row) => row.email === normalizedEmail);
  if (selected) return `${selected.label} (${selected.email})`;
  return normalizedEmail || "Nevybráno";
};

export const resolveAdminBroadcastSchedule = (
  mode: AdminBroadcastDeliveryMode,
  scheduledAt: string
) => {
  if (mode !== "scheduled" || !scheduledAt) {
    return { scheduledAtMs: null, scheduledAtIso: null };
  }

  const parsed = new Date(scheduledAt).getTime();
  const scheduledAtMs = Number.isFinite(parsed) ? parsed : null;
  return {
    scheduledAtMs,
    scheduledAtIso:
      scheduledAtMs != null ? new Date(scheduledAtMs).toISOString() : null,
  };
};

export const isAdminBroadcastScheduleValid = (
  mode: AdminBroadcastDeliveryMode,
  scheduledAtMs: number | null,
  nowMs: number
): boolean => mode === "now" || (scheduledAtMs != null && scheduledAtMs > nowMs + 30_000);

export const isAdminBroadcastTargetPathValid = (path: string): boolean =>
  path.startsWith("/") && !path.startsWith("//");

export const prepareAdminBroadcastRequest = ({
  emoji,
  title,
  message,
  targetPath,
  recipientMode,
  recipientEmail,
  recipientGroup,
  deliveryMode,
  scheduledAtIso,
  confirmed,
}: {
  emoji: string;
  title: string;
  message: string;
  targetPath: string;
  recipientMode: AdminBroadcastRecipientMode;
  recipientEmail: string;
  recipientGroup: AdminBroadcastRecipientGroup | "";
  deliveryMode: AdminBroadcastDeliveryMode;
  scheduledAtIso: string | null;
  confirmed: boolean;
}):
  | { body: null; error: string }
  | { body: AdminBroadcastRequestBody; error: null } => {
  const normalizedMessage = message.trim();
  const normalizedTitle = title.trim();
  const normalizedTargetPath = targetPath.trim();
  const normalizedEmoji = emoji.trim();
  const normalizedRecipientEmail = normalizeEmail(recipientEmail);
  const normalizedScheduledAt = deliveryMode === "scheduled" ? scheduledAtIso : null;

  if (!normalizedTitle) return { body: null, error: "Vyplň nadpis notifikace." };
  if (!normalizedMessage) return { body: null, error: "Vyplň text notifikace." };
  if (!isAdminBroadcastTargetPathValid(normalizedTargetPath)) {
    return {
      body: null,
      error: "Cílová stránka musí být interní cesta začínající lomítkem.",
    };
  }
  if (recipientMode === "single" && !normalizedRecipientEmail) {
    return {
      body: null,
      error: "Vyber uživatele, kterému chceš testovací notifikaci poslat.",
    };
  }
  if (recipientMode === "group" && !recipientGroup) {
    return { body: null, error: "Vyber skupinu příjemců." };
  }
  if (deliveryMode === "scheduled" && !normalizedScheduledAt) {
    return { body: null, error: "Vyber platný budoucí čas odeslání." };
  }
  if (!confirmed) {
    return {
      body: null,
      error:
        recipientMode === "single"
          ? "Potvrď odeslání notifikace vybranému uživateli."
          : recipientMode === "group"
            ? "Potvrď odeslání notifikace vybrané skupině."
            : "Potvrď, že chceš notifikaci odeslat všem uživatelům.",
    };
  }

  return {
    error: null,
    body: {
      emoji: normalizedEmoji,
      title: normalizedTitle,
      message: normalizedMessage,
      targetPath: normalizedTargetPath,
      targetMode: recipientMode,
      recipientEmail:
        recipientMode === "single" ? normalizedRecipientEmail : undefined,
      recipientGroup:
        recipientMode === "group" ? recipientGroup || undefined : undefined,
      scheduledAt: normalizedScheduledAt,
    },
  };
};

export const canSubmitAdminBroadcast = ({
  isAllowedAdmin,
  sending,
  confirmed,
  title,
  message,
  recipientMode,
  recipientEmail,
  recipientGroup,
  scheduleValid,
  targetPath,
}: {
  isAllowedAdmin: boolean;
  sending: boolean;
  confirmed: boolean;
  title: string;
  message: string;
  recipientMode: AdminBroadcastRecipientMode;
  recipientEmail: string;
  recipientGroup: AdminBroadcastRecipientGroup;
  scheduleValid: boolean;
  targetPath: string;
}): boolean =>
  isAllowedAdmin &&
  !sending &&
  confirmed &&
  title.trim().length > 0 &&
  message.trim().length > 0 &&
  (recipientMode !== "single" || Boolean(normalizeEmail(recipientEmail))) &&
  (recipientMode !== "group" || Boolean(recipientGroup)) &&
  scheduleValid &&
  isAdminBroadcastTargetPathValid(targetPath);

export const formatAdminBroadcastDateTime = (
  value: string | null | undefined
): string => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const toDatetimeLocalInputValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
