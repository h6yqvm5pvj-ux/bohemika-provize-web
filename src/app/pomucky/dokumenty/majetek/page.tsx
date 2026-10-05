"use client";

import { PROPERTY_TOOL_DOCUMENT_INSURERS } from "@/app/lib/toolDocuments";
import { DocumentsInsurers } from "../DocumentsInsurers";

export default function DocumentsCategoryPage() {
  return <DocumentsInsurers title="Majetek" description="Dokumenty k pojištění nemovitostí a domácností. Vyber pojišťovnu a otevři její knihovnu." category="majetek" insurers={PROPERTY_TOOL_DOCUMENT_INSURERS} />;
}
