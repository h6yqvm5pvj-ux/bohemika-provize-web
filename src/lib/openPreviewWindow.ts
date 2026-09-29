/** Pre-open during the user gesture, before an authenticated fetch can expire it. */
export function openPreviewWindow(): Window | null {
  // `noopener` in window.open returns null even when the browser opens the tab.
  // Detach the opener on the empty same-origin page before assigning any content.
  const preview = window.open("", "_blank");
  if (preview) {
    preview.opener = null;
    const referrer = preview.document.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    preview.document.head.appendChild(referrer);
  }
  return preview;
}
