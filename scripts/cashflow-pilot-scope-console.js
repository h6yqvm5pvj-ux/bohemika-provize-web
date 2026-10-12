// Paste the whole expression into the cashflow page's browser console.
// Changes only the scope filter and its optional diagnostic; no business writes.
(async () => {
  const key = "cashflow_server_pilot_last_result";
  if (sessionStorage.getItem("cashflow_server_pilot_mode") !== "compare") {
    throw new Error("V této kartě není zapnutý režim compare.");
  }
  const group = document.querySelector('[role="group"][aria-label="Smlouvy"]');
  const buttons = [...(group?.querySelectorAll("button") ?? [])];
  const selected = () => buttons.find(button => button.getAttribute("aria-pressed") === "true")?.textContent.trim();
  const before = selected();
  const label = before === "Vlastní" ? "Týmové" : "Vlastní";
  const target = buttons.find(button => button.textContent.trim() === label);
  if (!before || !target || target.disabled) {
    throw new Error("Tlačítka filtrů nejsou připravená. Počkej na načtení cashflow.");
  }
  const started = performance.now();
  sessionStorage.removeItem(key);
  target.click();
  let comparison = null;
  do {
    await new Promise(resolve => setTimeout(resolve, 250));
    comparison = JSON.parse(sessionStorage.getItem(key) ?? "null");
  } while (!comparison && performance.now() - started < 30_000);
  const result = {
    predtim: before,
    pozadovanyFiltr: label,
    aktualniFiltr: selected(),
    cekaniMs: Math.round(performance.now() - started),
    porovnani: comparison,
    novePozadavky: performance.getEntriesByType("resource")
      .filter(entry => entry.startTime >= started && new URL(entry.name).pathname === "/api/cashflow/view")
      .map(entry => ({ trvaniMs: Math.round(entry.duration) })),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
})()
