export function normalizeVehicleQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "") : "";
}

export function isValidVehicleQuery(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{11,25}$/.test(value) ||
    (/^[A-Z0-9]{5,8}$/.test(value) && /[0-9]/.test(value));
}
