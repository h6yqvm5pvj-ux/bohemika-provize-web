const PORTAL_ORIGIN = "https://sjednatel.bohemiaservis.cz";

export type ContractPortalLinks = {
  maxxContractDetailUrl?: string;
  extranetContractDetailUrl?: string;
};

type PortalSource = {
  maxxContractDetailUrl?: unknown;
  extranetContractDetailUrl?: unknown;
  cppExtranetEntityTypeId?: unknown;
  cppExtranetEntityId?: unknown;
};

function portalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.origin !== PORTAL_ORIGIN || url.username || url.password) return undefined;
    return url.toString();
  } catch { return undefined; }
}

function entityId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  const text = String(value).trim();
  return /^\d{1,32}$/.test(text) ? text : null;
}

/** Keep only portal links needed by the card; never forward raw contract data. */
export function contractPortalLinks(source: PortalSource): ContractPortalLinks {
  const maxx = portalUrl(source.maxxContractDetailUrl);
  const type = entityId(source.cppExtranetEntityTypeId);
  const id = entityId(source.cppExtranetEntityId);
  const extranet = type && id
    ? `${PORTAL_ORIGIN}/redirect_extranet.aspx?${new URLSearchParams({
      type: "detail", p_EntityTypeID: type, p_EntityID: id,
    })}` : portalUrl(source.extranetContractDetailUrl);
  return {
    ...(maxx ? { maxxContractDetailUrl: maxx } : {}),
    ...(extranet ? { extranetContractDetailUrl: extranet } : {}),
  };
}
