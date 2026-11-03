import { STATEMENT_TOGGLE_SCRIPT } from "./previewScripts";

export const buildInteractiveStatementHtml = (html: string): string => {
  const previewStyle = `<style>
html {
  background: #ffffff !important;
}
body {
  width: 715px !important;
  max-width: 100% !important;
  margin: 0 auto !important;
  box-sizing: border-box !important;
  background: #ffffff !important;
}
body > table.vypis_table {
  margin: 0 auto !important;
}
a[href^="javascript:toggleLayer"] {
  cursor: pointer;
}
</style>`;
  // Client navigation retains the initial document's CSP. Read its live nonce,
  // rather than the nonce or route-specific hashes from a later RSC response.
  // Only our fixed script receives it; imported HTML never supplies this value.
  const documentNonce = typeof document === "undefined"
    ? ""
    : document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "";
  const nonceAttribute = /^[A-Za-z0-9+/_-]+={0,2}$/.test(documentNonce)
    ? ` nonce="${documentNonce}"`
    : "";
  const toggleScript = `<script${nonceAttribute}>${STATEMENT_TOGGLE_SCRIPT}</script>`;
  const htmlWithStyle = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${previewStyle}</head>`)
    : `${previewStyle}${html}`;

  if (/<\/body>/i.test(htmlWithStyle)) {
    return htmlWithStyle.replace(/<\/body>/i, `${toggleScript}</body>`);
  }
  return `${htmlWithStyle}${toggleScript}`;
};
