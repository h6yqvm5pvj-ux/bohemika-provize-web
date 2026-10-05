"use client";

import { AUTO_TOOL_DOCUMENT_INSURERS } from "@/app/lib/toolDocuments";
import { DocumentsInsurers } from "../DocumentsInsurers";

export default function DocumentsCategoryPage() {
  return <DocumentsInsurers title="Auto" description="Dokumenty pro povinné ručení a havarijní pojištění. Pokračuj výběrem pojišťovny." category="auto" insurers={AUTO_TOOL_DOCUMENT_INSURERS} />;
}
