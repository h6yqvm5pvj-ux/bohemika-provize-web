/** Historical records stay in storage, but retired products are unavailable in the application. */
export function isRetiredProduct(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "comfortcc";
}
