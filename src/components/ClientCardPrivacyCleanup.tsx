"use client";

import { useEffect } from "react";
import { installClientCardPrivacyCleanup } from "@/app/lib/clientCardPrivacy";

export function ClientCardPrivacyCleanup() {
  useEffect(installClientCardPrivacyCleanup, []);
  return null;
}
