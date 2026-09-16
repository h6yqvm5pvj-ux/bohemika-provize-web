export const TIP_DETAIL_MESSAGE = "bohemka:tip-detail";

export type TipDetailMessage = {
  type: typeof TIP_DETAIL_MESSAGE;
  id: string;
  action: "changed" | "deleted" | "close" | "busy";
  busy?: boolean;
};

export function isTipDetailMessage(value: unknown, tipId: string): value is TipDetailMessage {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return data.type === TIP_DETAIL_MESSAGE && data.id === tipId && (
    data.action === "changed" || data.action === "deleted" || data.action === "close" ||
    (data.action === "busy" && typeof data.busy === "boolean")
  );
}

export function notifyTipDetailParent(id: string, action: TipDetailMessage["action"], busy?: boolean) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: TIP_DETAIL_MESSAGE, id, action, busy }, window.location.origin);
}
