export const INTRANET_UNREAD_EVENT = "intranet:unread-changed";
export const INTRANET_UNREAD_STORAGE_KEY = "intranet_unread_changed";

export function notifyIntranetUnreadChanged(email: string) {
  const account = email.trim().toLowerCase();
  window.dispatchEvent(new CustomEvent(INTRANET_UNREAD_EVENT, { detail: account }));
  try {
    localStorage.setItem(INTRANET_UNREAD_STORAGE_KEY, JSON.stringify({ email: account, at: Date.now(), nonce: Math.random() }));
  } catch {
    // The current tab still updates when storage is unavailable.
  }
}
