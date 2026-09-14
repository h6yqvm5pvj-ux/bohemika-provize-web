"use client";

import { useLinkStatus } from "next/link";
import { ArrowLeft, ChevronRight, ExternalLink, LoaderCircle } from "lucide-react";

export function ClientLinkIndicator({ kind = "next" }: { kind?: "back" | "open" | "next" }) {
  const { pending } = useLinkStatus();
  if (pending) return <span role="status" aria-label="Otevírám stránku" className="inline-flex shrink-0">
    <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
  </span>;
  const Icon = kind === "back" ? ArrowLeft : kind === "open" ? ExternalLink : ChevronRight;
  return <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />;
}
