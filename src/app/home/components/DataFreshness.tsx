import styles from "./dataFreshness.module.css";

export function DataFreshness({ updatedAt, refreshing = false, error = null, dark = false }: {
  updatedAt?: number | null; refreshing?: boolean; error?: string | null; dark?: boolean;
}) {
  const date = typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt <= 8.64e15 ? new Date(updatedAt) : null;
  if (!date && !error) return null;
  return <p className={`${styles.status} ${dark ? styles.dark : ""} ${error ? styles.warning : ""}`} role={error ? "alert" : "status"}>
    {error ? date ? "Obnovení se nezdařilo. Poslední známé údaje z " : error
      : refreshing ? "Aktualizuji… Poslední údaje z " : "Aktualizováno "}
    {date && <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)}</time>}
  </p>;
}
