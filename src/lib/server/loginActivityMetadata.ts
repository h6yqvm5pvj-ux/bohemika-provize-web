import { isIP } from "node:net";
import { getRequestIp } from "./rateLimit";

export function auditText(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
export function auditEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email) ? email : null;
}
export function maskAuditIp(ip: string): string {
  if (isIP(ip) === 4) return `${ip.split(".").slice(0, 3).join(".")}.xxx`;
  if (isIP(ip) === 6) return `${ip.split(":").filter(Boolean).slice(0, 3).join(":")}:…`;
  return "";
}
export function auditDevice(value: unknown): string {
  const ua = auditText(value, 240).toLowerCase();
  const browser = ua.includes("edg/") ? "Edge" : ua.includes("firefox/") ? "Firefox" : /chrome|crios/.test(ua) ? "Chrome" : ua.includes("safari/") ? "Safari" : "Neznámý prohlížeč";
  const os = /iphone|ipad/.test(ua) ? "iOS" : ua.includes("android") ? "Android" : ua.includes("windows") ? "Windows" : /macintosh|mac os/.test(ua) ? "macOS" : ua.includes("linux") ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}
export function loginRequestMetadata(req: Request) {
  const ip = getRequestIp(req);
  // The platform, not request content or a user-supplied generic proxy header,
  // must establish both the network identity and the geographic metadata.
  const platformIp = req.headers.get("x-vercel-forwarded-for")?.trim();
  const trusted = process.env.VERCEL === "1" && !!platformIp && !!isIP(platformIp) && platformIp === ip;
  const rawCountry = trusted ? req.headers.get("x-vercel-ip-country") || "" : "";
  const country = /^[A-Z]{2}$/.test(rawCountry) && rawCountry !== "XX" ? rawCountry : "";
  let city = "";
  if (trusted) {
    try { city = auditText(decodeURIComponent((req.headers.get("x-vercel-ip-city") || "").replace(/\+/g, " ")), 80); }
    catch { /* malformed platform metadata remains unknown */ }
  }
  return { country, city, ipLabel: maskAuditIp(ip), device: auditDevice(req.headers.get("user-agent")),
    environment: process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "development" };
}
