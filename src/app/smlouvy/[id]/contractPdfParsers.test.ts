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
  const parserLoadErrors = new Map<string, Error>();
  const parserRunErrors = new Map<string, Error>();

  beforeEach(() => {
    vi.resetModules();
    loadedParsers.length = 0;
    parserLoadErrors.clear();
    parserRunErrors.clear();
    for (const parserName of new Set(parserCases.map(([, name]) => name))) {
      // Register each module once. Queuing two doMock calls for the same ID
      // before an import lets Vitest's parallel ID resolution choose the winner.
      vi.doMock(`@/app/lib/${parserName}`, () => {
        loadedParsers.push(parserName);
        const loadError = parserLoadErrors.get(parserName);
        if (loadError) throw loadError;
        return {
          [parserName]: async (file: File) => {
            const runError = parserRunErrors.get(parserName);
            if (runError) throw runError;
            return { parserName, file };
          },
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
    parserLoadErrors.set("parseAllianzAutoPdf", error);
    const { PDF_REIMPORT_PARSERS } = await import("./contractDetailPdfReimport");

    // Vitest wraps a factory failure; verify that the actual load error is its cause.
    await expect(PDF_REIMPORT_PARSERS.allianzAuto!({} as File)).rejects.toMatchObject({ cause: error });
    expect(loadedParsers).toEqual(["parseAllianzAutoPdf"]);
  });

  it("propagates a failure after the parser module loads", async () => {
    const error = new Error("Synthetic PDF cannot be parsed");
    parserRunErrors.set("parseAllianzAutoPdf", error);
    const { PDF_REIMPORT_PARSERS } = await import("./contractDetailPdfReimport");

    await expect(PDF_REIMPORT_PARSERS.allianzAuto!({} as File)).rejects.toBe(error);
    expect(loadedParsers).toEqual(["parseAllianzAutoPdf"]);
  });
});
