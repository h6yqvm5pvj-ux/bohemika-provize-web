import { useCallback, useEffect, useState } from "react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type {
  AdminSecurityFilter,
  AdminSecurityResponse,
  AdminSecurityUserRow,
} from "./adminSecurity";

export function useAdminSecurity({
  active,
  isAllowedAdmin,
}: {
  active: boolean;
  isAllowedAdmin: boolean;
}) {
  const [rows, setRows] = useState<AdminSecurityUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AdminSecurityFilter>("all");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<AdminSecurityResponse>(
        user,
        "/api/admin/security",
        { method: "GET" }
      );
      setRows(Array.isArray(payload?.users) ? payload.users : []);
    } catch (loadError) {
      setRows([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nepodařilo se načíst zabezpečení uživatelů."
      );
    } finally {
      setLoading(false);
    }
  }, [isAllowedAdmin]);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  return {
    rows,
    loading,
    error,
    filter,
    search,
    refresh,
    setFilter,
    setSearch,
  };
}
