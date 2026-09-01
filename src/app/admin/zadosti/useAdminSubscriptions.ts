import { useCallback, useEffect, useMemo, useState } from "react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { formatIsoDay } from "./adminFormatters";
import {
  filterAdminSubscriptionDirectory,
  formatMoneyCzk,
  isPaidSubscriptionPlanValue,
  prepareAdminSubscriptionPaymentUpdate,
  summarizeAdminSubscriptionDirectory,
  type AdminSubscriptionDirectoryFilter,
  type AdminSubscriptionDirectoryResponse,
  type AdminSubscriptionDirectoryRow,
  type AdminSubscriptionLookupResponse,
  type AdminSubscriptionPaymentRow,
  type AdminSubscriptionStatus,
  type PaidSubscriptionPlanValue,
  type SubscriptionPlanValue,
} from "./adminSubscriptions";

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

export function useAdminSubscriptions({
  active,
  isOwnerAdmin,
}: {
  active: boolean;
  isOwnerAdmin: boolean;
}) {
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupStatus, setLookupStatus] = useState<AdminSubscriptionStatus | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryRows, setDirectoryRows] = useState<AdminSubscriptionDirectoryRow[]>([]);
  const [directoryFilter, setDirectoryFilter] =
    useState<AdminSubscriptionDirectoryFilter>("all");
  const [directorySearch, setDirectorySearch] = useState("");
  const [planDraft, setPlanDraft] = useState<SubscriptionPlanValue>("monthly");
  const [fromDraft, setFromDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [editPlan, setEditPlan] =
    useState<PaidSubscriptionPlanValue>("monthly");
  const [editPeriodFrom, setEditPeriodFrom] = useState("");
  const [editPeriodUntil, setEditPeriodUntil] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [data, setData] = useState<AdminSubscriptionLookupResponse | null>(null);

  const filteredDirectoryRows = useMemo(
    () =>
      filterAdminSubscriptionDirectory(
        directoryRows,
        directoryFilter,
        directorySearch
      ),
    [directoryFilter, directoryRows, directorySearch]
  );
  const directoryStats = useMemo(
    () => summarizeAdminSubscriptionDirectory(directoryRows),
    [directoryRows]
  );
  const normalizedLookupEmail = normalizeEmail(lookupEmail);

  const loadDirectory = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isOwnerAdmin) {
      setDirectoryRows([]);
      setDirectoryError(null);
      setDirectoryLoading(false);
      return;
    }

    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<AdminSubscriptionDirectoryResponse>(
        user,
        "/api/admin/subscriptions?scope=list",
        { method: "GET" }
      );
      setDirectoryRows(Array.isArray(payload?.users) ? payload.users : []);
    } catch (loadError) {
      setDirectoryRows([]);
      setDirectoryError(
        loadError instanceof Error
          ? loadError.message
          : "Nepodařilo se načíst seznam uživatelů pro předplatné."
      );
    } finally {
      setDirectoryLoading(false);
    }
  }, [isOwnerAdmin]);

  useEffect(() => {
    if (!active) return;
    void loadDirectory();
  }, [active, loadDirectory]);

  const loadForEmail = useCallback(
    async (emailInput?: string) => {
      const user = auth.currentUser;
      if (!user || !isOwnerAdmin) return;

      const email = normalizeEmail(emailInput ?? lookupEmail);
      if (!email) {
        setLookupError("Zadej e-mail uživatele.");
        setData(null);
        return;
      }

      setLookupLoading(true);
      setLookupError(null);
      setLookupStatus(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<AdminSubscriptionLookupResponse>(
          user,
          `/api/admin/subscriptions?email=${encodeURIComponent(email)}`,
          { method: "GET" }
        );
        setLookupEmail(email);
        setData(payload);
        setEditingPaymentId(null);
        setSavingPaymentId(null);
        setDeletingPaymentId(null);
      } catch (loadError) {
        setData(null);
        setLookupError(
          loadError instanceof Error
            ? loadError.message
            : "Nepodařilo se načíst předplatné uživatele."
        );
      } finally {
        setLookupLoading(false);
      }
    },
    [isOwnerAdmin, lookupEmail]
  );

  useEffect(() => {
    if (!active) return;
    if (directoryRows.length === 0) return;
    if (lookupLoading) return;

    const hasSelection = normalizedLookupEmail
      ? directoryRows.some((row) => row.email === normalizedLookupEmail)
      : false;
    if (hasSelection) return;

    const first = directoryRows[0];
    if (!first) return;
    setLookupEmail(first.email);
    void loadForEmail(first.email);
  }, [
    active,
    directoryRows,
    loadForEmail,
    lookupLoading,
    normalizedLookupEmail,
  ]);

  const selectUser = (email: string) => {
    setLookupEmail(email);
    setLookupError(null);
    setLookupStatus(null);
    void loadForEmail(email);
  };

  const addPayment = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isOwnerAdmin) return;
    const email = normalizeEmail(lookupEmail);
    if (!email) {
      setLookupError("Zadej e-mail uživatele.");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupStatus(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({
          action: "addPayment",
          email,
          plan: planDraft,
          periodFrom: fromDraft || undefined,
          note: noteDraft || undefined,
        }),
      });
      const successMessage =
        planDraft === "unlimited"
          ? "Tarif Neomezený byl nastavený a účet je aktivní bez časového omezení."
          : "Platba byla zapsaná a předplatné aktivované.";
      setNoteDraft("");
      await loadForEmail(email);
      await loadDirectory();
      setLookupStatus({ type: "success", message: successMessage });
    } catch (saveError) {
      setLookupError(
        saveError instanceof Error
          ? saveError.message
          : "Tarif nebo platbu se nepodařilo uložit."
      );
    } finally {
      setLookupLoading(false);
    }
  }, [
    fromDraft,
    isOwnerAdmin,
    loadDirectory,
    loadForEmail,
    lookupEmail,
    noteDraft,
    planDraft,
  ]);

  const setUnpaid = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isOwnerAdmin) return;
    const email = normalizeEmail(lookupEmail);
    if (!email) {
      setLookupError("Zadej e-mail uživatele.");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupStatus(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({
          action: "setUnpaid",
          email,
          note: noteDraft || undefined,
        }),
      });
      await loadForEmail(email);
      await loadDirectory();
      setLookupStatus({ type: "info", message: "Účet byl označen jako nezaplacený." });
    } catch (saveError) {
      setLookupError(
        saveError instanceof Error
          ? saveError.message
          : "Změnu stavu se nepodařilo uložit."
      );
    } finally {
      setLookupLoading(false);
    }
  }, [isOwnerAdmin, loadDirectory, loadForEmail, lookupEmail, noteDraft]);

  const startPaymentEdit = useCallback((payment: AdminSubscriptionPaymentRow) => {
    const plan = isPaidSubscriptionPlanValue(payment.plan) ? payment.plan : "monthly";
    setEditingPaymentId(payment.id);
    setEditPlan(plan);
    setEditPeriodFrom(payment.periodFrom || "");
    setEditPeriodUntil(payment.periodUntil || "");
    setEditAmount(payment.amountCzk ? String(payment.amountCzk) : "");
    setEditNote(payment.note ?? "");
    setLookupError(null);
    setLookupStatus(null);
  }, []);

  const cancelPaymentEdit = useCallback(() => {
    setEditingPaymentId(null);
    setEditPlan("monthly");
    setEditPeriodFrom("");
    setEditPeriodUntil("");
    setEditAmount("");
    setEditNote("");
  }, []);

  const updatePayment = useCallback(
    async (paymentId: string) => {
      const user = auth.currentUser;
      if (!user || !isOwnerAdmin) return;
      const email = normalizeEmail(lookupEmail);
      if (!email) {
        setLookupError("Zadej e-mail uživatele.");
        return;
      }

      const prepared = prepareAdminSubscriptionPaymentUpdate({
        email,
        paymentId,
        plan: editPlan,
        amount: editAmount,
        periodFrom: editPeriodFrom,
        periodUntil: editPeriodUntil,
        note: editNote,
      });
      if (prepared.body === null) {
        setLookupError(prepared.error);
        return;
      }

      setSavingPaymentId(paymentId);
      setLookupError(null);
      setLookupStatus(null);
      try {
        await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
          method: "PATCH",
          body: JSON.stringify(prepared.body),
        });
        cancelPaymentEdit();
        await loadForEmail(email);
        await loadDirectory();
        setLookupStatus({ type: "success", message: "Platba byla upravena." });
      } catch (saveError) {
        setLookupError(
          saveError instanceof Error ? saveError.message : "Platbu se nepodařilo upravit."
        );
      } finally {
        setSavingPaymentId(null);
      }
    },
    [
      cancelPaymentEdit,
      editAmount,
      editNote,
      editPeriodFrom,
      editPeriodUntil,
      editPlan,
      isOwnerAdmin,
      loadDirectory,
      loadForEmail,
      lookupEmail,
    ]
  );

  const deletePayment = useCallback(
    async (payment: AdminSubscriptionPaymentRow) => {
      const user = auth.currentUser;
      if (!user || !isOwnerAdmin) return;
      const email = normalizeEmail(lookupEmail);
      if (!email) {
        setLookupError("Zadej e-mail uživatele.");
        return;
      }

      const label = `${formatMoneyCzk(payment.amountCzk || 0)} za ${formatIsoDay(
        payment.periodFrom
      )} - ${formatIsoDay(payment.periodUntil)}`;
      if (!window.confirm(`Opravdu smazat platbu ${label}?`)) return;

      setDeletingPaymentId(payment.id);
      setLookupError(null);
      setLookupStatus(null);
      try {
        await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
          method: "PATCH",
          body: JSON.stringify({
            action: "deletePayment",
            email,
            paymentId: payment.id,
          }),
        });
        if (editingPaymentId === payment.id) cancelPaymentEdit();
        await loadForEmail(email);
        await loadDirectory();
        setLookupStatus({ type: "success", message: "Platba byla smazána." });
      } catch (deleteError) {
        setLookupError(
          deleteError instanceof Error
            ? deleteError.message
            : "Platbu se nepodařilo smazat."
        );
      } finally {
        setDeletingPaymentId(null);
      }
    },
    [
      cancelPaymentEdit,
      editingPaymentId,
      isOwnerAdmin,
      loadDirectory,
      loadForEmail,
      lookupEmail,
    ]
  );

  return {
    lookupEmail,
    normalizedLookupEmail,
    lookupLoading,
    lookupError,
    lookupStatus,
    directoryLoading,
    directoryError,
    directoryRows,
    directoryFilter,
    directorySearch,
    filteredDirectoryRows,
    directoryStats,
    planDraft,
    fromDraft,
    noteDraft,
    editingPaymentId,
    savingPaymentId,
    deletingPaymentId,
    editPlan,
    editPeriodFrom,
    editPeriodUntil,
    editAmount,
    editNote,
    data,
    loadDirectory,
    loadForEmail,
    selectUser,
    setDirectoryFilter,
    setDirectorySearch,
    setPlanDraft,
    setFromDraft,
    setNoteDraft,
    setEditPlan,
    setEditPeriodFrom,
    setEditPeriodUntil,
    setEditAmount,
    setEditNote,
    addPayment,
    setUnpaid,
    startPaymentEdit,
    cancelPaymentEdit,
    updatePayment,
    deletePayment,
  };
}

export type AdminSubscriptionsController = ReturnType<typeof useAdminSubscriptions>;
