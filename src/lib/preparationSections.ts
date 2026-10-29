type PreparationSection = "clients" | "statements";

/** Controls page availability; API authorization still determines data access. */
export function canAccessPreparationSection(
  userEmail: string | null | undefined,
  section: PreparationSection
): boolean {
  const email = (userEmail ?? "").trim().toLowerCase();
  if (section === "clients") return Boolean(email);
  const localPart = email.split("@")[0] ?? "";
  if (localPart === "jakub.rauscher") return true;
  return section === "statements" && email === "jindra.hajek@bohemika.eu";
}
