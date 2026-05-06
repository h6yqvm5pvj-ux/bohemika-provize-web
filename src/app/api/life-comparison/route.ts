import { NextResponse } from "next/server";

type ComparisonProduct = {
  id: string;
  insurer: string;
  name: string;
  version: string;
};

type ComparisonItem = {
  id: string;
  page: number;
  question: string;
  values: Record<string, string>;
};

type ComparisonSection = {
  title: string;
  items: ComparisonItem[];
};

type ComparisonPayload = {
  source?: string;
  generatedAt?: string;
  products: ComparisonProduct[];
  sections: ComparisonSection[];
};

type QueryOptions = {
  sectionTerms: string[];
  productIds: string[];
  insurerTerms: string[];
  search: string;
  differencesOnly: boolean;
  includeEmptySections: boolean;
};

function normalizeSearchValue(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseBooleanParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseListParams(searchParams: URLSearchParams, keys: string[]): string[] {
  const values: string[] = [];

  keys.forEach((key) => {
    searchParams.getAll(key).forEach((rawValue) => {
      rawValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => values.push(value));
    });
  });

  return Array.from(new Set(values));
}

function toValuesMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const map: Record<string, string> = {};

  Object.entries(record).forEach(([key, rawValue]) => {
    if (typeof rawValue === "string") {
      map[key] = rawValue;
    }
  });

  return map;
}

function isComparisonPayload(value: unknown): value is ComparisonPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;

  if (!Array.isArray(payload.products) || !Array.isArray(payload.sections)) return false;

  const productsValid = payload.products.every((rawProduct) => {
    if (!rawProduct || typeof rawProduct !== "object") return false;
    const product = rawProduct as Record<string, unknown>;
    return (
      typeof product.id === "string" &&
      typeof product.insurer === "string" &&
      typeof product.name === "string" &&
      typeof product.version === "string"
    );
  });
  if (!productsValid) return false;

  const sectionsValid = payload.sections.every((rawSection) => {
    if (!rawSection || typeof rawSection !== "object") return false;
    const section = rawSection as Record<string, unknown>;
    if (typeof section.title !== "string" || !Array.isArray(section.items)) return false;

    return section.items.every((rawItem) => {
      if (!rawItem || typeof rawItem !== "object") return false;
      const item = rawItem as Record<string, unknown>;
      if (typeof item.id !== "string") return false;
      if (typeof item.question !== "string") return false;
      if (!Number.isFinite(item.page)) return false;
      return toValuesMap(item.values) !== null;
    });
  });

  return sectionsValid;
}

function parseQueryOptions(searchParams: URLSearchParams): QueryOptions {
  return {
    sectionTerms: parseListParams(searchParams, ["section", "sectionTitle"]),
    productIds: parseListParams(searchParams, ["productId", "product", "productIds"]),
    insurerTerms: parseListParams(searchParams, ["insurer", "insurerName"]),
    search: (searchParams.get("search") ?? "").trim(),
    differencesOnly: parseBooleanParam(searchParams.get("differences")),
    includeEmptySections: parseBooleanParam(searchParams.get("includeEmptySections")),
  };
}

function selectProducts(
  products: ComparisonProduct[],
  options: QueryOptions
): ComparisonProduct[] {
  const requestedProductIds = new Set(options.productIds.map((id) => id.trim()));
  const insurerTerms = options.insurerTerms.map(normalizeSearchValue);

  return products.filter((product) => {
    if (requestedProductIds.size > 0 && !requestedProductIds.has(product.id)) return false;
    if (insurerTerms.length === 0) return true;

    const insurerValue = normalizeSearchValue(product.insurer);
    return insurerTerms.some((term) => insurerValue.includes(term));
  });
}

function itemMatchesSearch(
  sectionTitle: string,
  item: ComparisonItem,
  selectedProductIds: string[],
  searchTerm: string
): boolean {
  if (!searchTerm) return true;

  const values = selectedProductIds.map((productId) => item.values[productId] ?? "");
  const haystack = [
    sectionTitle,
    item.question,
    item.id,
    String(item.page),
    ...values,
  ]
    .map(normalizeSearchValue)
    .join(" ");

  return haystack.includes(searchTerm);
}

function itemHasDifferences(item: ComparisonItem, selectedProductIds: string[]): boolean {
  if (selectedProductIds.length < 2) return false;

  const normalizedValues = selectedProductIds.map((productId) =>
    normalizeSearchValue(item.values[productId] ?? "")
  );

  return new Set(normalizedValues).size > 1;
}

function filterPayload(payload: ComparisonPayload, options: QueryOptions): ComparisonPayload {
  const selectedProducts = selectProducts(payload.products, options);
  const selectedProductIds = selectedProducts.map((product) => product.id);
  const sectionTerms = options.sectionTerms.map(normalizeSearchValue);
  const searchTerm = normalizeSearchValue(options.search);

  const filteredSections = payload.sections
    .filter((section) => {
      if (sectionTerms.length === 0) return true;
      const normalizedTitle = normalizeSearchValue(section.title);
      return sectionTerms.some((term) => normalizedTitle.includes(term));
    })
    .map((section) => {
      const filteredItems = section.items
        .map((item) => {
          const scopedValues: Record<string, string> = {};
          selectedProductIds.forEach((productId) => {
            scopedValues[productId] = item.values[productId] ?? "";
          });
          return {
            id: item.id,
            page: item.page,
            question: item.question,
            values: scopedValues,
          };
        })
        .filter((item) => itemMatchesSearch(section.title, item, selectedProductIds, searchTerm))
        .filter((item) => (options.differencesOnly ? itemHasDifferences(item, selectedProductIds) : true));

      return {
        title: section.title,
        items: filteredItems,
      };
    })
    .filter((section) => (options.includeEmptySections ? true : section.items.length > 0));

  return {
    source: payload.source,
    generatedAt: payload.generatedAt,
    products: selectedProducts,
    sections: filteredSections,
  };
}

export async function GET(request: Request) {
  const configuredUpstreamUrl =
    process.env.LIFE_COMPARISON_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_LIFE_COMPARISON_API_URL?.trim();
  const upstreamUrl =
    configuredUpstreamUrl || new URL("/api/life-comparison-source", request.url).toString();
  const requestUrl = new URL(request.url);
  const options = parseQueryOptions(requestUrl.searchParams);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: `Upstream returned HTTP ${upstreamResponse.status}.` },
        { status: 502 }
      );
    }

    const payload = (await upstreamResponse.json()) as unknown;
    if (!isComparisonPayload(payload)) {
      return NextResponse.json(
        { error: "Invalid online life comparison payload." },
        { status: 502 }
      );
    }

    const filteredPayload = filterPayload(payload, options);
    const totalItems = filteredPayload.sections.reduce(
      (count, section) => count + section.items.length,
      0
    );

    return NextResponse.json({
      ...filteredPayload,
      meta: {
        filters: {
          sectionTerms: options.sectionTerms,
          productIds: options.productIds,
          insurerTerms: options.insurerTerms,
          search: options.search,
          differencesOnly: options.differencesOnly,
          includeEmptySections: options.includeEmptySections,
        },
        stats: {
          productCount: filteredPayload.products.length,
          sectionCount: filteredPayload.sections.length,
          itemCount: totalItems,
        },
      },
    });
  } catch (error) {
    console.error("Failed to load online life comparison payload", error);
    return NextResponse.json(
      { error: "Failed to fetch online life comparison payload." },
      { status: 502 }
    );
  }
}
