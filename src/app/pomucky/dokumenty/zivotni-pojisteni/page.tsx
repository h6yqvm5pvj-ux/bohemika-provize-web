"use client";

import { LIFE_TOOL_DOCUMENT_INSURERS } from "@/app/lib/toolDocuments";
import { DocumentsInsurers } from "../DocumentsInsurers";

export default function DocumentsCategoryPage() {
  return <DocumentsInsurers title="Životní pojištění" description="Podklady pro životní pojištění na jednom místě. Vyber pojišťovnu a najdi potřebný dokument." category="zivotni-pojisteni" insurers={LIFE_TOOL_DOCUMENT_INSURERS} layout="landing" />;
}
