/*
  Browser console extractor for sjednatel.bohemiaservis.cz.

  Usage:
  1. Open a BohemiaServis contract list/detail page in Chrome while logged in.
  2. Open DevTools -> Console.
  3. Paste this whole file and press Enter.
  4. The script copies CSV to clipboard and prints a table.

  It runs only in your browser session. It does not send data anywhere.
*/

(async () => {
  const config = {
    delayMs: 250,
    maxDetails: 500,
    onlyEntityTypeId: "43",
    ...globalThis.BS_CPP_EXTRACT_CONFIG,
  };

  const origin = location.origin;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value ?? "").replace(/\s+/g, "").trim();
  const decodeHtml = (value) => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  };
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const toCsv = (rows) => {
    const headers = [
      "contractNumber",
      "contractVersionId",
      "entityTypeId",
      "entityId",
      "extranetUrl",
      "detailUrl",
      "clientText",
      "error",
    ];
    return [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
    ].join("\n");
  };

  const parseDoc = (html) => new DOMParser().parseFromString(html, "text/html");
  const sameOriginUrl = (raw) => {
    try {
      const url = new URL(raw, origin);
      return url.origin === origin ? url : null;
    } catch {
      return null;
    }
  };

  const collectContractVersionIds = () => {
    const ids = new Set();
    const scan = (text) => {
      if (!text) return;
      for (const match of text.matchAll(/ContractVersionID=(\d+)/gi)) {
        ids.add(match[1]);
      }
      for (const match of text.matchAll(/contractVersionID(?:\\u0026|&|=|%3D|&#61;)+(\d+)/gi)) {
        ids.add(match[1]);
      }
    };

    scan(location.href);
    scan(document.documentElement.innerHTML);

    for (const link of document.querySelectorAll("a[href]")) {
      scan(link.href);
      scan(link.getAttribute("href"));
      scan(link.getAttribute("onclick"));
    }

    for (const entry of performance.getEntriesByType("resource")) {
      scan(entry.name);
    }

    return [...ids].slice(0, config.maxDetails);
  };

  const detailUrlForVersion = (contractVersionId) =>
    `${origin}/contractsclients/contract?ContractVersionID=${encodeURIComponent(
      contractVersionId
    )}&rwndrnd=${Math.random()}`;

  const extractContractNumber = (doc, html) => {
    const text = doc.body?.innerText ?? "";
    const decodedHtml = decodeHtml(html);
    const patterns = [
      /SMLOUVA:\s*([A-Za-z0-9._/-]{3,40})/i,
      /Smlouva\s+([A-Za-z0-9._/-]{3,40})/i,
      /(?:Cislo|Číslo)\s+smlouvy\s*[:\n\r ]+\s*([A-Za-z0-9._/-]{3,40})/i,
      /ContractNumber[^A-Za-z0-9._/-]{1,80}([A-Za-z0-9._/-]{3,40})/i,
    ];

    for (const source of [text, decodedHtml]) {
      for (const pattern of patterns) {
        const value = source.match(pattern)?.[1];
        if (value) return normalize(value);
      }
    }

    const inputs = [...doc.querySelectorAll("input, textarea, select")];
    for (const input of inputs) {
      const labelish = `${input.name ?? ""} ${input.id ?? ""} ${input.getAttribute("data-bind") ?? ""}`;
      if (!/contract|sml/i.test(labelish)) continue;
      const value = input.value || input.getAttribute("value") || "";
      const normalized = normalize(value);
      if (/^[A-Za-z0-9._/-]{3,40}$/.test(normalized)) return normalized;
    }

    return "";
  };

  const extractClientText = (doc) => {
    const text = (doc.body?.innerText ?? "").replace(/\s+/g, " ").trim();
    const match = text.match(/SMLOUVA:\s*[A-Za-z0-9._/-]{3,40}\s+(.{0,160})/i);
    return (match?.[1] ?? text.slice(0, 160)).trim();
  };

  const extractExtranetLink = (doc, html) => {
    const link = doc.querySelector('a[href*="redirect_extranet.aspx"]');
    const rawHref =
      link?.getAttribute("href") ||
      html.match(/redirect_extranet\.aspx\?[^"'<>\\\s]+/i)?.[0] ||
      "";
    if (!rawHref) return null;

    const href = decodeHtml(rawHref);
    const url = sameOriginUrl(href);
    if (!url) return null;

    const entityTypeId = url.searchParams.get("p_EntityTypeID") || "";
    const entityId = url.searchParams.get("p_EntityID") || "";
    if (config.onlyEntityTypeId && entityTypeId !== config.onlyEntityTypeId) {
      return null;
    }

    return {
      entityTypeId,
      entityId,
      extranetUrl: url.href,
    };
  };

  const fetchDetail = async (contractVersionId) => {
    const detailUrl = detailUrlForVersion(contractVersionId);
    const response = await fetch(detailUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { detailUrl, html };
  };

  const rows = [];
  const currentLink = extractExtranetLink(document, document.documentElement.innerHTML);
  if (currentLink) {
    rows.push({
      contractNumber: extractContractNumber(document, document.documentElement.innerHTML),
      contractVersionId: new URL(location.href).searchParams.get("ContractVersionID") || "",
      ...currentLink,
      detailUrl: location.href,
      clientText: extractClientText(document),
      error: "",
    });
  }

  const versionIds = collectContractVersionIds();
  console.log(`BohemiaServis extractor: found ${versionIds.length} contract version id(s).`);

  for (let index = 0; index < versionIds.length; index += 1) {
    const contractVersionId = versionIds[index];
    if (rows.some((row) => row.contractVersionId === contractVersionId)) continue;

    try {
      console.log(`[${index + 1}/${versionIds.length}] ${contractVersionId}`);
      const { detailUrl, html } = await fetchDetail(contractVersionId);
      const doc = parseDoc(html);
      const extranet = extractExtranetLink(doc, html);

      if (!extranet) {
        rows.push({
          contractNumber: extractContractNumber(doc, html),
          contractVersionId,
          entityTypeId: "",
          entityId: "",
          extranetUrl: "",
          detailUrl,
          clientText: extractClientText(doc),
          error: config.onlyEntityTypeId
            ? `No redirect_extranet link for entity type ${config.onlyEntityTypeId}`
            : "No redirect_extranet link",
        });
      } else {
        rows.push({
          contractNumber: extractContractNumber(doc, html),
          contractVersionId,
          ...extranet,
          detailUrl,
          clientText: extractClientText(doc),
          error: "",
        });
      }
    } catch (err) {
      rows.push({
        contractNumber: "",
        contractVersionId,
        entityTypeId: "",
        entityId: "",
        extranetUrl: "",
        detailUrl: detailUrlForVersion(contractVersionId),
        clientText: "",
        error: err?.message || String(err),
      });
    }

    if (config.delayMs > 0) await sleep(config.delayMs);
  }

  const okRows = rows.filter((row) => row.entityId);
  const csv = toCsv(okRows);
  console.table(rows);

  if (typeof copy === "function") {
    copy(csv);
    console.log(`Copied ${okRows.length} row(s) to clipboard as CSV.`);
  } else if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(csv);
    console.log(`Copied ${okRows.length} row(s) to clipboard as CSV.`);
  } else {
    console.log(csv);
  }

  globalThis.BS_CPP_EXTRACT_ROWS = rows;
  return rows;
})();
