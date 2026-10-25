import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const parserCases = [
  ["conseqzenit", "parseConseqZenitPdf"],
  ["cppAuto", "parseCppAutoPdf"],
  ["slaviaauto", "parseSlaviaAutoPdf"],
  ["allianzAuto", "parseAllianzAutoPdf"],
  ["csobAuto", "parseCsobAutoPdf"],
  ["uniqaAuto", "parseUniqaAutoPdf"],
  ["pillowAuto", "parsePillowAutoPdf"],
  ["kooperativaAuto", "parseKooperativaAutoPdf"],
  ["koopcestovko", "parseKooperativaCestovkoPdf"],
  ["cppcestovko", "parseCppCestovkoPdf"],
  ["cppsimplex", "parseCppSimplexPdf"],
  ["cppPPRbez", "parseCppKomplexPdf"],
  ["cppPPRs", "parseCppKomplexPdf"],
  ["neon", "parseNeonPdf"],
  ["flexi", "parseFlexiPdf"],
  ["domex", "parseDomexPdf"],
  ["domexneuron", "parseDomexPdf"],
  ["cppbytex", "parseCppBytexPdf"],
  ["cpphafan", "parseCppHafanPdf"],
  ["koopodzam", "parseKoopOdzamPdf"],
  ["maxdomov", "parseMaxdomovPdf"],
  ["maxcizinkomplex", "parseMaxCizinKomplexPdf"],
  ["comfortcc", "parseComfortPdf"],
] as const;

describe("on-demand contract PDF parsers", () => {
  const loadedParsers: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    loadedParsers.length = 0;
    for (const parserName of new Set(parserCases.map(([, name]) => name))) {
      vi.doMock(`@/app/lib/${parserName}`, () => {
        loadedParsers.push(parserName);
        return {
          [parserName]: async (file: File) => ({ parserName, file }),
        };
      });
    }
  });

  afterEach(() => {
    for (const parserName of new Set(parserCases.map(([, name]) => name))) {
      vi.doUnmock(`@/app/lib/${parserName}`);
    }
    vi.resetModules();
  });

  it("loads no PDF parser when opening the contract detail helpers", async () => {
    const { PDF_REIMPORT_PARSERS } = await import("./contractDetailPdfReimport");

    expect(Object.keys(PDF_REIMPORT_PARSERS)).toHaveLength(parserCases.length);
    expect(loadedParsers).toEqual([]);
    expect(PDF_REIMPORT_PARSERS.maximaMaxEfekt).toBeUndefined();
  });

  it("resolves portal identity without importing the Kooperativa PDF parser", async () => {
    const { resolveAllianzOdometerIdentity } = await import("./allianzOdometerUpload");

    expect(resolveAllianzOdometerIdentity("12345678")).toEqual({
      kind: "companyId", label: "IČO", value: "12345678",
    });
    expect(loadedParsers).toEqual([]);
  });

  it.each(parserCases)("loads only the requested parser for %s", async (product, parserName) => {
    const { PDF_REIMPORT_PARSERS } = await import("./contractDetailPdfReimport");
    const file = {} as File;

    await expect(PDF_REIMPORT_PARSERS[product]!(file)).resolves.toEqual({ parserName, file });
    expect(loadedParsers).toEqual([parserName]);
  });

  it("propagates a parser loading failure to the existing UI error handler", async () => {
    const error = new Error("PDF parser chunk unavailable");
    vi.doMock("@/app/lib/parseAllianzAutoPdf", () => { throw error; });
    const { PDF_REIMPORT_PARSERS } = await import("./contractDetailPdfReimport");

    await expect(PDF_REIMPORT_PARSERS.allianzAuto!({} as File)).rejects.toThrow();
  });
});
