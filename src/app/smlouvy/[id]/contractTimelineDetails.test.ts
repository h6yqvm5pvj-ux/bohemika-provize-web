import { describe, expect, it } from "vitest";
import { contractEditSource, unifiedContractDetail, updateContractTimelineEntry } from "./contractTimelineDetails";
import type { ContractDoc } from "./contractDetailTypes";

const owner = "owner@example.test";
const original: ContractDoc = { id: "root", userEmail: owner, productKey: "neon", entryType: "contract" };
const amendment: ContractDoc = { id: "change", userEmail: owner, productKey: "neon", entryType: "endorsement", rootContractEntryId: "root" };

describe("unified contract detail identity", () => {
  it("uses the authorized original from the existing response when a URL names its amendment", () => {
    expect(unifiedContractDetail(amendment, [original, amendment], owner)).toBe(original);
    expect(unifiedContractDetail(amendment, [original, amendment], owner.toUpperCase())).toBe(original);
  });

  it("retains an explicitly selected original", () => {
    expect(unifiedContractDetail(original, [original, amendment], owner)).toBe(original);
  });

  it.each([
    [], [amendment], [{ ...original, userEmail: "other@example.test" }],
    [{ ...original, productKey: "flexi" }], [{ ...original, entryType: "endorsement" }],
    [original, { ...original }],
  ].map(timeline => ({ timeline: timeline as ContractDoc[] })))("keeps a missing, foreign or ambiguous root out of the main identity: %j", ({ timeline }) => {
    expect(unifiedContractDetail(amendment, timeline, owner)).toBe(amendment);
  });

  it("does not substitute another owner's requested record or an unidentified owner", () => {
    expect(unifiedContractDetail({ ...amendment, userEmail: "other@example.test" }, [original], owner).id).toBe("change");
    expect(unifiedContractDetail(amendment, [original], null)).toBe(amendment);
  });
});

describe("inline source snapshot updates", () => {
  it("updates only the saved source and retains other amendments", () => {
    const changed = updateContractTimelineEntry([original, amendment], "root", entry => ({ ...entry, contractNumber: "synthetic-123", note: "saved" }));
    expect(changed[0]).toEqual({ ...original, contractNumber: "synthetic-123", note: "saved" });
    expect(changed[1]).toBe(amendment);
    expect(original.contractNumber).toBeUndefined();
  });
  it("clears a migrated legacy note on the amendment without clearing the original note", () => {
    const rootWithNote = { ...original, note: "original-note" };
    const changed = updateContractTimelineEntry([rootWithNote, { ...amendment, note: "amendment-note" }], "change", entry => ({ ...entry, note: "" }));
    expect(changed[0].note).toBe("original-note");
    expect(changed[1].note).toBe("");
  });
});

describe("explicit contract editing source", () => {
  it("retains the amendment write target while the main view remains the original", () => {
    const main = unifiedContractDetail(amendment, [original, amendment], owner);
    expect(main).toBe(original);
    expect(contractEditSource(main, [original, amendment], "change", owner)).toBe(amendment);
    expect(contractEditSource(main, [original, amendment], "root", owner)).toBe(original);
  });
  it("uses the current root state over a stale timeline root snapshot", () => {
    const current = { ...original, clientName: "Synthetic edited client" };
    expect(contractEditSource(current, [original, amendment], "root", owner)).toBe(current);
  });
  it.each([
    { ...amendment, userEmail: "other@example.test" },
    { ...amendment, productKey: "flexi" },
    { ...amendment, rootContractEntryId: "unrelated" },
  ] satisfies ContractDoc[])("rejects an unrelated write target without silently saving the root: %j", foreign => {
    expect(contractEditSource(original, [original, foreign], "change", owner)).toBeNull();
  });
  it("rejects missing and ambiguous target IDs", () => {
    expect(contractEditSource(original, [original], "change", owner)).toBeNull();
    expect(contractEditSource(original, [original, amendment, { ...amendment }], "change", owner)).toBeNull();
    expect(contractEditSource(original, [original, amendment], null, owner)).toBeNull();
    expect(contractEditSource(original, [original, amendment], "root", null)).toBeNull();
  });
  it("keeps saved amendment changes out of the original source snapshot", () => {
    const target = contractEditSource(original, [original, amendment], "change", owner)!;
    const result = updateContractTimelineEntry([original, amendment], target.id, entry => ({ ...entry, clientName: "Synthetic amendment client" }));
    expect(result[0]).toBe(original);
    expect(result[1].clientName).toBe("Synthetic amendment client");
  });
});
