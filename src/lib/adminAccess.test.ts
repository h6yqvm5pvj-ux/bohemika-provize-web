import { describe, expect, it } from "vitest";
import { adminRoleAtLeast, resolveAdminRoleFromClaims } from "./adminAccess";

describe("admin role authorization", () => {
  it("retains support access without full administrator permissions", () => {
    const role = resolveAdminRoleFromClaims("support@example.test", { admin: true, adminRole: "support" });
    expect(role).toBe("support");
    expect(adminRoleAtLeast(role, "admin")).toBe(false);
  });
  it.each([null, "unknown", "", true, 1])("rejects an explicitly invalid admin role %j", (adminRole) => {
    expect(resolveAdminRoleFromClaims("user@example.test", { admin: true, adminRole })).toBeNull();
  });
  it("preserves legacy admin claims with no role", () => {
    expect(resolveAdminRoleFromClaims("user@example.test", { admin: true })).toBe("admin");
  });
  it.each(["admin", "owner"])("preserves the legitimate %s role", (adminRole) => {
    expect(resolveAdminRoleFromClaims("user@example.test", { admin: true, adminRole })).toBe(adminRole);
  });
  it("does not grant privileges based on the role field alone", () => {
    expect(resolveAdminRoleFromClaims("user@example.test", { adminRole: "owner" })).toBeNull();
  });
  it("does not turn an account creator into an administrator", () => {
    expect(resolveAdminRoleFromClaims("vojtech.mahr@bohemika.eu", { admin: true, adminRole: "owner" })).toBeNull();
  });
});
