import { NextResponse } from "next/server";

import comparisonData from "@/app/pomucky/srovnavac-zivotniho-pojisteni/lifeComparisonData.json";
import onlineProductsData from "@/app/pomucky/srovnavac-zivotniho-pojisteni/lifeComparisonOnlineProducts.json";

export function GET() {
  const onlinePayload = onlineProductsData as {
    source?: string;
    generatedAt?: string;
    products?: unknown[];
    sections?: unknown[];
  };
  const fallbackPayload = comparisonData as {
    source?: string;
    generatedAt?: string;
    products?: unknown[];
    sections?: unknown[];
  };

  const hasOnlineProducts =
    Array.isArray(onlinePayload.products) && onlinePayload.products.length > 0;
  const hasOnlineSections =
    Array.isArray(onlinePayload.sections) && onlinePayload.sections.length > 0;
  const fallbackSections = Array.isArray(fallbackPayload.sections)
    ? fallbackPayload.sections
    : [];

  if (!hasOnlineProducts) {
    return NextResponse.json(comparisonData);
  }

  return NextResponse.json({
    ...onlinePayload,
    sections: hasOnlineSections ? onlinePayload.sections : fallbackSections,
  });
}
