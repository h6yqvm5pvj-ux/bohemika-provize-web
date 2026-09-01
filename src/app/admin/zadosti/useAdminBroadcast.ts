import { useCallback, useEffect, useMemo, useState } from "react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  buildAdminBroadcastRecipientOptions,
  canSubmitAdminBroadcast,
  countAdminBroadcastGroups,
  formatAdminBroadcastDateTime,
  isAdminBroadcastScheduleValid,
  prepareAdminBroadcastRequest,
  resolveAdminBroadcastRecipientLabel,
  resolveAdminBroadcastSchedule,
  resolveAdminBroadcastTarget,
  toDatetimeLocalInputValue,
  type AdminBroadcastDeliveryMode,
  type AdminBroadcastRecipientGroup,
  type AdminBroadcastRecipientMode,
  type AdminBroadcastResponse,
  type AdminBroadcastStatus,
} from "./adminBroadcast";
import type { AdminUsersRow } from "./adminUsers";

export function useAdminBroadcast({
  isAllowedAdmin,
  users,
  usersLoading,
}: {
  isAllowedAdmin: boolean;
  users: AdminUsersRow[];
  usersLoading: boolean;
}) {
  const [emoji, setEmoji] = useState("📣");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipientMode, setRecipientMode] =
    useState<AdminBroadcastRecipientMode>("all");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientGroup, setRecipientGroup] =
    useState<AdminBroadcastRecipientGroup>("advisors");
  const [targetPath, setTargetPath] = useState("/");
  const [toolTargetPath, setToolTargetPath] = useState("/pomucky");
  const [customTargetPath, setCustomTargetPath] = useState("");
  const [deliveryMode, setDeliveryMode] =
    useState<AdminBroadcastDeliveryMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<AdminBroadcastStatus | null>(null);

  const recipientOptions = useMemo(
    () => buildAdminBroadcastRecipientOptions(users),
    [users]
  );
  const groupCounts = useMemo(() => countAdminBroadcastGroups(users), [users]);
  const target = useMemo(
    () =>
      resolveAdminBroadcastTarget({
        targetPath,
        toolTargetPath,
        customTargetPath,
      }),
    [customTargetPath, targetPath, toolTargetPath]
  );
  const recipientLabel = useMemo(
    () =>
      resolveAdminBroadcastRecipientLabel({
        mode: recipientMode,
        group: recipientGroup,
        email: recipientEmail,
        options: recipientOptions,
        groupCounts,
      }),
    [groupCounts, recipientEmail, recipientGroup, recipientMode, recipientOptions]
  );
  const schedule = useMemo(
    () => resolveAdminBroadcastSchedule(deliveryMode, scheduledAt),
    [deliveryMode, scheduledAt]
  );
  const scheduleValid = isAdminBroadcastScheduleValid(
    deliveryMode,
    schedule.scheduledAtMs,
    Date.now()
  );
  const scheduleMinValue = useMemo(
    () => toDatetimeLocalInputValue(new Date(Date.now() + 60_000)),
    []
  );
  const deliveryLabel =
    deliveryMode === "scheduled" && schedule.scheduledAtIso
      ? `Naplánováno na ${formatAdminBroadcastDateTime(schedule.scheduledAtIso)}`
      : "Odeslat hned";
  const titleTrimmed = title.trim();
  const messageTrimmed = message.trim();
  const canSubmit = canSubmitAdminBroadcast({
    isAllowedAdmin,
    sending,
    confirmed,
    title,
    message,
    recipientMode,
    recipientEmail,
    recipientGroup,
    scheduleValid,
    targetPath: target.effectivePath,
  });

  useEffect(() => {
    if (recipientMode !== "single") return;
    if (recipientEmail.trim().toLowerCase()) return;
    const first = recipientOptions.find((row) => !row.disabled) ?? recipientOptions[0];
    if (first) setRecipientEmail(first.email);
  }, [recipientEmail, recipientMode, recipientOptions]);

  const updateEmoji = (value: string) => {
    setEmoji(value.slice(0, 12));
    setStatus(null);
  };

  const updateTitle = (value: string) => {
    setTitle(value.slice(0, 80));
    setStatus(null);
  };

  const updateMessage = (value: string) => {
    setMessage(value.slice(0, 220));
    setStatus(null);
  };

  const updateRecipientMode = (value: AdminBroadcastRecipientMode) => {
    setRecipientMode(value);
    setConfirmed(false);
    setStatus(null);
  };

  const updateRecipientGroup = (value: AdminBroadcastRecipientGroup) => {
    setRecipientGroup(value);
    setConfirmed(false);
    setStatus(null);
  };

  const updateRecipientEmail = (value: string) => {
    setRecipientEmail(value);
    setConfirmed(false);
    setStatus(null);
  };

  const updateTargetPath = (value: string) => {
    setTargetPath(value);
    setStatus(null);
  };

  const updateToolTargetPath = (value: string) => {
    setToolTargetPath(value);
    setStatus(null);
  };

  const updateCustomTargetPath = (value: string) => {
    setCustomTargetPath(value);
    setStatus(null);
  };

  const updateDeliveryMode = (value: AdminBroadcastDeliveryMode) => {
    setDeliveryMode(value);
    if (value === "scheduled" && !scheduledAt) {
      setScheduledAt(toDatetimeLocalInputValue(new Date(Date.now() + 10 * 60 * 1000)));
    }
    setConfirmed(false);
    setStatus(null);
  };

  const updateScheduledAt = (value: string) => {
    setScheduledAt(value);
    setConfirmed(false);
    setStatus(null);
  };

  const updateConfirmed = (value: boolean) => {
    setConfirmed(value);
    setStatus(null);
  };

  const send = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) return;

    const prepared = prepareAdminBroadcastRequest({
      emoji,
      title,
      message,
      targetPath: target.effectivePath,
      recipientMode,
      recipientEmail,
      recipientGroup,
      deliveryMode,
      scheduledAtIso: schedule.scheduledAtIso,
      confirmed,
    });
    if (prepared.body === null) {
      setStatus({ type: "error", message: prepared.error });
      return;
    }
    const requestBody = prepared.body;

    setSending(true);
    setStatus(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<AdminBroadcastResponse>(
        user,
        "/api/admin/broadcast-notification",
        {
          method: "POST",
          body: JSON.stringify(requestBody),
        }
      );

      if (payload?.scheduled) {
        setStatus({
          type: "success",
          message: `Notifikace naplánována pro ${recipientLabel} na ${formatAdminBroadcastDateTime(
            payload.scheduledAtIso ?? requestBody.scheduledAt
          )}.`,
        });
        setTitle("");
        setMessage("");
        setConfirmed(false);
        setDeliveryMode("now");
        setScheduledAt("");
        return;
      }

      const sent = typeof payload?.sent === "number" ? payload.sent : 0;
      const failed = typeof payload?.failed === "number" ? payload.failed : 0;
      const matched =
        typeof payload?.matchedUsers === "number" ? payload.matchedUsers : null;
      const recipients =
        typeof payload?.recipients === "number" ? payload.recipients : null;
      const tokens =
        typeof payload?.uniqueTokens === "number" ? payload.uniqueTokens : null;
      const skippedNoToken =
        typeof payload?.skippedNoToken === "number" ? payload.skippedNoToken : null;
      const skippedPushDisabled =
        typeof payload?.skippedPushDisabled === "number"
          ? payload.skippedPushDisabled
          : null;

      const details = [
        matched != null && recipientMode === "group" ? `skupina ${matched}` : null,
        recipients != null ? `příjemci ${recipients}` : null,
        tokens != null ? `tokeny ${tokens}` : null,
        failed > 0 ? `chyby ${failed}` : null,
        skippedNoToken != null ? `bez tokenu ${skippedNoToken}` : null,
        skippedPushDisabled != null ? `push vypnutý ${skippedPushDisabled}` : null,
      ].filter(Boolean);

      setStatus({
        type: "success",
        message:
          details.length > 0
            ? `Notifikace odeslána ${recipientLabel}. Doručeno ${sent}. ${details.join(
                ", "
              )}.`
            : `Notifikace odeslána ${recipientLabel}. Doručeno ${sent}.`,
      });
      setTitle("");
      setMessage("");
      setConfirmed(false);
    } catch (sendError) {
      setStatus({
        type: "error",
        message:
          sendError instanceof Error
            ? sendError.message
            : "Hromadnou notifikaci se nepodařilo odeslat.",
      });
    } finally {
      setSending(false);
    }
  }, [
    confirmed,
    deliveryMode,
    emoji,
    isAllowedAdmin,
    message,
    recipientEmail,
    recipientGroup,
    recipientLabel,
    recipientMode,
    schedule.scheduledAtIso,
    target.effectivePath,
    title,
  ]);

  return {
    emoji,
    title,
    message,
    recipientMode,
    recipientEmail,
    recipientGroup,
    targetPath,
    toolTargetPath,
    customTargetPath,
    deliveryMode,
    scheduledAt,
    confirmed,
    sending,
    status,
    usersLoading,
    recipientOptions,
    groupCounts,
    effectiveTargetPath: target.effectivePath,
    targetLabel: target.label,
    recipientLabel,
    deliveryLabel,
    scheduleMinValue,
    titleTrimmed,
    messageTrimmed,
    canSubmit,
    updateEmoji,
    updateTitle,
    updateMessage,
    updateRecipientMode,
    updateRecipientGroup,
    updateRecipientEmail,
    updateTargetPath,
    updateToolTargetPath,
    updateCustomTargetPath,
    updateDeliveryMode,
    updateScheduledAt,
    updateConfirmed,
    send,
  };
}

export type AdminBroadcastController = ReturnType<typeof useAdminBroadcast>;
