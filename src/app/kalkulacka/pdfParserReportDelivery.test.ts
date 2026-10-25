import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { PDF_PARSER_REPORT_VERSION } from "@/app/lib/pdfParserReport";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.send }));
import { deliverPdfParserReport } from "./pdfParserReportDelivery";

const user = { uid: "synthetic-user" } as User;
const report = { product: "flexi", extraction: "native", parserVersion: PDF_PARSER_REPORT_VERSION, missingFields: ["amount"] } as const;
const diagnostic = () => ({ ...report, missingFields: [...report.missingFields] });
const pdf = () => new File(["%PDF-1.7\nSynthetic PDF"], "private-client-name.pdf", { type: "application/pdf" });
const signal = () => new AbortController().signal;
beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({ ok: true }); });

describe("background parser-report delivery", () => {
  it("submits only structured metadata and the original PDF bytes with a neutral name", async () => {
    const file = pdf();
    expect(await deliverPdfParserReport(user, file, diagnostic(), signal())).toBe("sent");
    const [actor, endpoint, init] = mocks.send.mock.calls[0];
    expect(actor).toBe(user);
    expect(endpoint).toBe("/api/mailbox/compose");
    const form = init.body as FormData;
    expect(form.get("recipientEmail")).toBeNull();
    expect(JSON.parse(form.get("parserReportJson") as string)).toEqual(diagnostic());
    const attachment = form.get("files") as File;
    expect(attachment.name).toBe("podklad-parseru.pdf");
    expect(await attachment.text()).toBe(await file.text());
  });

  it("coalesces simultaneous reports and serializes different uploads", async () => {
    const deferred = Promise.withResolvers<unknown>();
    mocks.send.mockReturnValueOnce(deferred.promise);
    const firstFile = pdf();
    const first = deliverPdfParserReport(user, firstFile, diagnostic(), signal());
    const duplicate = deliverPdfParserReport(user, firstFile, diagnostic(), signal());
    const second = deliverPdfParserReport(user, pdf(), diagnostic(), signal());
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    expect(duplicate).toBe(first);
    deferred.resolve({ ok: true });
    expect(await first).toBe("sent");
    expect(await second).toBe("sent");
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("contains transport failures and permits retry instead of breaking the calculator", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Synthetic transport failure"));
    const file = pdf();
    expect(await deliverPdfParserReport(user, file, diagnostic(), signal())).toBe("failed");
    expect(await deliverPdfParserReport(user, file, diagnostic(), signal())).toBe("sent");
  });

  it("does not upload cancelled or oversized diagnostics", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await deliverPdfParserReport(user, pdf(), diagnostic(), controller.signal)).toBe("skipped");
    expect(await deliverPdfParserReport(user, new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.pdf"), diagnostic(), signal())).toBe("failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
