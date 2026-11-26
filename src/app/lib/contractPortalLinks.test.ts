import { describe, expect, it } from "vitest";
import { contractPortalLinks } from "./contractPortalLinks";

const maxx = "https://sjednatel.bohemiaservis.cz/detail.aspx?sml=123456";
const extranet = "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx?type=detail&p_EntityTypeID=43&p_EntityID=123456";

describe("contract portal links", () => {
  it("uses stored identifiers without guessing from the visible policy number", () => {
    expect(contractPortalLinks({ maxxContractDetailUrl: maxx, cppExtranetEntityTypeId: 43, cppExtranetEntityId: "123456" }))
      .toEqual({ maxxContractDetailUrl: maxx, extranetContractDetailUrl: extranet });
    expect(contractPortalLinks({ cppExtranetEntityId: "123456" })).toEqual({});
  });

  it("preserves validated projected links through the cashflow pipeline", () => {
    expect(contractPortalLinks({ maxxContractDetailUrl: maxx, extranetContractDetailUrl: extranet }))
      .toEqual({ maxxContractDetailUrl: maxx, extranetContractDetailUrl: extranet });
  });

  it.each([
    "javascript:alert(1)", "data:text/html,test", "http://sjednatel.bohemiaservis.cz/detail.aspx?sml=1",
    "https://evil.example/detail.aspx?sml=1", "https://sjednatel.bohemiaservis.cz.evil.example/",
    "https://sjednatel.bohemiaservis.cz@evil.example/", "https://user:password@sjednatel.bohemiaservis.cz/",
    "https://sjednatel.bohemiaservis.cz:8443/", "//sjednatel.bohemiaservis.cz/detail.aspx", "x".repeat(2049),
    123, {}, null,
  ])("rejects an unsafe portal URL: %j", value => {
    expect(contractPortalLinks({ maxxContractDetailUrl: value, extranetContractDetailUrl: value })).toEqual({});
  });

  it.each(["1&next=evil", "../1", "<script>", -1, Number.MAX_SAFE_INTEGER + 1, {}, true, "1".repeat(33)])("rejects manipulated entity IDs: %j", value => {
    expect(contractPortalLinks({ cppExtranetEntityTypeId: 43, cppExtranetEntityId: value })).toEqual({});
  });
});
