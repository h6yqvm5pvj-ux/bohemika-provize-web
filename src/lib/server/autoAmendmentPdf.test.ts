import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), destroy: vi.fn(), js: vi.fn(), files: vi.fn(), open: vi.fn(), pageJs: vi.fn(), annotations: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: mocks.getDocument }));
import { validateAutoAmendmentPdf } from "./autoAmendmentPdf";
const file = () => new File(["%PDF-1.7\nsynthetic"], "dodatek.pdf", { type: "application/pdf" });
beforeEach(() => {
  vi.clearAllMocks(); mocks.js.mockResolvedValue(false); mocks.files.mockResolvedValue(null); mocks.open.mockResolvedValue(null); mocks.pageJs.mockResolvedValue(null); mocks.annotations.mockResolvedValue([]);
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, hasJSActions: mocks.js, getAttachments: mocks.files, getOpenAction: mocks.open, getPage: async () => ({ getJSActions: mocks.pageJs, getAnnotations: mocks.annotations, cleanup() {} }) }), destroy: mocks.destroy });
});
describe("untrusted auto amendment PDF validation", () => {
  it("accepts a passive document with evaluation disabled and cleans it up", async () => {
    await validateAutoAmendmentPdf(file()); expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false, enableXfa: false })); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it.each([new File(["bad"], "test.pdf", { type: "application/pdf" }), new File(["%PDF-1.7"], "test.exe"), new File([], "empty.pdf")])("rejects disguised and empty files before parsing", async candidate => {
    await expect(validateAutoAmendmentPdf(candidate)).rejects.toThrow(); expect(mocks.getDocument).not.toHaveBeenCalled();
  });
  it.each(["script", "attachment", "action", "pageScript", "annotation"])("rejects active content: %s", async kind => {
    if (kind === "script") mocks.js.mockResolvedValue(true);
    if (kind === "attachment") mocks.files.mockResolvedValue({ malware: {} });
    if (kind === "action") mocks.open.mockResolvedValue({ action: "Print" });
    if (kind === "pageScript") mocks.pageJs.mockResolvedValue({ onOpen: ["synthetic"] });
    if (kind === "annotation") mocks.annotations.mockResolvedValue([{ unsafeUrl: "file:///synthetic" }]);
    await expect(validateAutoAmendmentPdf(file())).rejects.toThrow(); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("rejects parser failures and destroys the task", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF")), destroy: mocks.destroy });
    await expect(validateAutoAmendmentPdf(file())).rejects.toThrow(); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
