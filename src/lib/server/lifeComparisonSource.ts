import comparisonData from "@/app/pomucky/srovnavac-zivotniho-pojisteni/lifeComparisonData.json";
import onlineProductsData from "@/app/pomucky/srovnavac-zivotniho-pojisteni/lifeComparisonOnlineProducts.json";

type RawComparisonPayload = {
  source?: string;
  generatedAt?: string;
  products?: unknown[];
  sections?: unknown[];
};

export function resolveLifeComparisonSourcePayload(): RawComparisonPayload {
  const onlinePayload = onlineProductsData as RawComparisonPayload;
  const fallbackPayload = comparisonData as RawComparisonPayload;

  const hasOnlineProducts =
    Array.isArray(onlinePayload.products) && onlinePayload.products.length > 0;
  const hasOnlineSections =
    Array.isArray(onlinePayload.sections) && onlinePayload.sections.length > 0;
  const fallbackSections = Array.isArray(fallbackPayload.sections)
    ? fallbackPayload.sections
    : [];

  if (!hasOnlineProducts) {
    return fallbackPayload;
  }

  return {
    ...onlinePayload,
    sections: hasOnlineSections ? onlinePayload.sections : fallbackSections,
  };
}
