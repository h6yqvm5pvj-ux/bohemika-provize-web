// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CppAutoBatchQueue, cppAutoBatchQueueItemFromPrefill, cppAutoBatchQueueItemKey,
  statementBatchQueueContractEntry, validateCppAutoBatchQueueItem } from "./CppAutoBatchQueue";
import { statementCalculatorPrefill } from "./statementPresentation";
import { resolveStatementProduct } from "./statementParsing";
import { StatementCalculatorIframePanel } from "./StatementEmbeddedModals";
import { canQueueStatementProduct, isStatementBatchQueueAddMessage, isStatementBatchQueueProduct,
  STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE } from "@/app/lib/statementBatchQueue";
import { saveContractEntry } from "../kalkulacka/useContractSave";
import { normalizeCreateEntryPayload } from "../api/contracts/_lib/contractsApi.createPayload";

const mocks = vi.hoisted(() => ({ requestContractsMutationWithAuth: vi.fn(), getContractsMutationError: vi.fn(), uploadContractPdfAttachmentWithAuth: vi.fn() }));
vi.mock("../kalkulacka/calculatorApi", () => mocks);
const prefill = () => ({ ...statementCalculatorPrefill({
  product: resolveStatementProduct("KOO_NAMIRU"), contractNumber: "1234567890", clientName: "Novák Jan",
  signedAt: "01.09.2026", validFrom: "02.09.2026", statementBase: 12000,
  source: { statementId: "statement-0001", statementNumber: "123", statementPeriod: "září", statementChronologyMs: 123456 },
})!, cppA101QueueEligible: true });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getContractsMutationError.mockReturnValue(null);
  mocks.requestContractsMutationWithAuth.mockResolvedValue({ response: new Response(null, { status: 200 }), data: { entryId: "entry-1" } });
  mocks.uploadContractPdfAttachmentWithAuth.mockResolvedValue(undefined);
});

describe("Kooperativa in the commission statement queue", () => {
  it("preserves the product and statement premium through form, queue and authenticated save with PDF", async () => {
    const source = prefill();
    expect(source).toMatchObject({ product: "kooperativaAuto", sourceProductCode: "KOO_NAMIRU", clientName: "Jan Novák", amountText: "12000" });
    const file = new File(["synthetic PDF"], "kooperativa.pdf", { type: "application/pdf" });
    expect(isStatementBatchQueueProduct(source.product)).toBe(true);
    expect(isStatementBatchQueueAddMessage({ ...source, type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "", pdfFile: file })).toBe(true);
    const item = { ...cppAutoBatchQueueItemFromPrefill(source), pdfFile: file };
    expect(validateCppAutoBatchQueueItem(item)).toBeNull();
    expect(cppAutoBatchQueueItemKey(item)).toBe("kooperativaAuto:1234567890");
    const result = await saveContractEntry({ user: {} as User, ownerEmail: "represented@example.test",
      entry: statementBatchQueueContractEntry(item), pdfFile: item.pdfFile, fallbackError: "Chyba uložení" });
    expect(result).toMatchObject({ ok: true, pdfAttachment: { status: "uploaded" } });
    expect(mocks.requestContractsMutationWithAuth).toHaveBeenCalledWith(expect.objectContaining({
      payload: { ownerEmail: "represented@example.test", entry: expect.objectContaining({
        productKey: "kooperativaAuto", inputAmount: 12000, frequencyRaw: source.frequency,
        contractNumber: "1234567890", clientName: "Jan Novák", createdFromCommissionStatement: true,
        createdFromCommissionStatementId: "statement-0001", createdFromCommissionStatementChronologyMs: 123456,
      }) }, idempotencyKey: expect.any(String),
    }));
    expect(mocks.uploadContractPdfAttachmentWithAuth).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: "represented@example.test", entryId: "entry-1", file }));
  });

  it.each(["cppAuto", "domex", "kooperativaAuto", "uniqaAuto", "allianzAuto", "cppcestovko", "pillowAuto"] as const)("preserves %s instead of coercing it to another insurer", product => {
    const item = cppAutoBatchQueueItemFromPrefill({ ...prefill(), product });
    expect(item.product).toBe(product); expect(statementBatchQueueContractEntry(item).productKey).toBe(product);
  });
  it("rejects unsupported products and invalid message frequency", () => {
    expect(() => cppAutoBatchQueueItemFromPrefill({ ...prefill(), product: "neon" })).toThrow();
    expect(isStatementBatchQueueAddMessage({ ...prefill(), type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "", frequency: {} })).toBe(false);
  });
  it("keeps queue identities separate for contracts at different insurers", () => {
    const source = prefill();
    expect(cppAutoBatchQueueItemKey(source)).not.toBe(cppAutoBatchQueueItemKey({ ...source, product: "cppAuto" }));
  });
  it("validates edited values and keeps the selected frequency and cancellation date", () => {
    const item = { ...cppAutoBatchQueueItemFromPrefill(prefill()), amountText: "3 000,50", frequency: "quarterly" as const, stornoDate: "2026-10-01" };
    expect(validateCppAutoBatchQueueItem(item)).toBeNull();
    expect(statementBatchQueueContractEntry(item)).toMatchObject({ inputAmount: 3000.5, frequencyRaw: "quarterly", status: "storno", stornoDate: "2026-10-01" });
    expect(validateCppAutoBatchQueueItem({ ...item, amountText: "0" })).toContain("větší než nula");
  });

  it("enables the calculator's queue flag and shows the correct product in the mixed queue", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"); // Detached to avoid iframe network requests.
    const root = createRoot(container);
    try {
      await act(async () => root.render(<StatementCalculatorIframePanel prefill={prefill()} onClose={() => {}} />));
      const url = new URL(container.querySelector("iframe")!.getAttribute("src")!, "http://localhost");
      expect(url.searchParams.get("product")).toBe("kooperativaAuto");
      expect(url.searchParams.get("cppA101QueueEligible")).toBe("1");
      expect(url.searchParams.get("prefill")).toBe("commission-statement");
      const onRun = vi.fn();
      const items = [cppAutoBatchQueueItemFromPrefill(prefill()), cppAutoBatchQueueItemFromPrefill({ ...prefill(), product: "cppAuto" })];
      await act(async () => root.render(<CppAutoBatchQueue items={items} isRunning={false} onUpdate={() => {}}
        onRemove={() => {}} onRun={onRun} onClearSaved={() => {}} />));
      expect(container.textContent).toContain("Kooperativa Auto");
      expect(container.textContent).toContain("ČPP Auto");
      const run = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Nahrát frontu"))!;
      await act(async () => run.click()); expect(onRun).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount()); vi.unstubAllGlobals();
    }
  });
});

describe.each([
  { product: "allianzAuto", productCode: "ALLMOJEAUT", label: "Allianz Auto", contractNumber: "4321123456", statementId: "statement-allianz" },
  { product: "pillowAuto", productCode: "PIL_AUTOZ", label: "Pillow Auto", contractNumber: "9012345678", statementId: "statement-pillow" },
] as const)("$label in the commission statement queue", ({ product, productCode, label, contractNumber, statementId }) => {
  const productPrefill = () => ({
    ...statementCalculatorPrefill({
      product: resolveStatementProduct(productCode),
      contractNumber, clientName: "Novák Jan",
      signedAt: "01.09.2026", validFrom: "02.09.2026", statementBase: 12000,
      source: { statementId, statementChronologyMs: 123456 },
    })!,
    cppA101QueueEligible: true,
  });

  it.each(["monthly", "quarterly", "semiannual", "annual"] as const)(
    "preserves the product, %s payments and PDF through the queue and authenticated save",
    async frequency => {
      const source = { ...productPrefill(), frequency };
      expect(source).toMatchObject({ product, sourceProductCode: productCode, amountText: "12000" });
      expect(canQueueStatementProduct(source.product, false)).toBe(true);
      const file = new File(["synthetic PDF"], `${product}.pdf`, { type: "application/pdf" });
      expect(isStatementBatchQueueAddMessage({
        ...source, type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "", pdfFile: file,
      })).toBe(true);
      const item = { ...cppAutoBatchQueueItemFromPrefill(source), pdfFile: file };
      expect(validateCppAutoBatchQueueItem(item)).toBeNull();
      expect(cppAutoBatchQueueItemKey(item)).toBe(`${product}:${contractNumber}`);
      expect(cppAutoBatchQueueItemKey(item)).not.toBe(cppAutoBatchQueueItemKey({ ...item, product: "cppAuto" }));
      const result = await saveContractEntry({
        user: {} as User, ownerEmail: "represented@example.test",
        entry: statementBatchQueueContractEntry(item), pdfFile: item.pdfFile, fallbackError: "Chyba uložení",
      });
      expect(result).toMatchObject({ ok: true, pdfAttachment: { status: "uploaded" } });
      expect(mocks.requestContractsMutationWithAuth).toHaveBeenCalledWith(expect.objectContaining({
        payload: { ownerEmail: "represented@example.test", entry: expect.objectContaining({
          productKey: product, inputAmount: 12000, frequencyRaw: frequency,
          contractNumber, createdFromCommissionStatement: true,
          createdFromCommissionStatementId: statementId, createdFromCommissionStatementChronologyMs: 123456,
        }) },
      }));
      expect(mocks.uploadContractPdfAttachmentWithAuth).toHaveBeenCalledWith(expect.objectContaining({
        file, ownerEmail: "represented@example.test", entryId: "entry-1",
      }));
    }
  );

  it("enables the embedded form and renders its payment frequencies in the mixed queue", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<StatementCalculatorIframePanel prefill={productPrefill()} onClose={() => {}} />));
      const url = new URL(container.querySelector("iframe")!.getAttribute("src")!, "http://localhost");
      expect(url.searchParams.get("product")).toBe(product);
      expect(url.searchParams.get("cppA101QueueEligible")).toBe("1");
      const onRun = vi.fn();
      await act(async () => root.render(<CppAutoBatchQueue
        items={[cppAutoBatchQueueItemFromPrefill(productPrefill()), cppAutoBatchQueueItemFromPrefill(prefill())]}
        isRunning={false} onUpdate={() => {}} onRemove={() => {}} onClearSaved={() => {}} onRun={onRun}
      />));
      expect(container.textContent).toContain(label);
      expect(container.textContent).toContain("Kooperativa Auto");
      const productCard = container.querySelector("article")!;
      expect([...productCard.querySelectorAll("select option")].map(option => option.getAttribute("value")))
        .toEqual(["monthly", "quarterly", "semiannual", "annual"]);
      await act(async () => [...container.querySelectorAll("button")]
        .find(button => button.textContent?.includes("Nahrát frontu"))!.click());
      expect(onRun).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});

describe("ČPP Auto replacements in the commission statement queue", () => {
  const cppPrefill = () => statementCalculatorPrefill({
    product: resolveStatementProduct("CPP_ACPIV"), contractNumber: "NEW123", clientName: "Novák Jan",
    signedAt: "01.09.2026", validFrom: "02.09.2026", statementBase: 12000,
    source: { statementId: "statement-cpp" },
  })!;
  const replacement = { isRefresh: true, refreshOriginalContractNumber: " OLD123 " };

  it("allows ČPP Auto with replacement enabled and keeps other replacement workflows excluded", () => {
    expect(canQueueStatementProduct("cppAuto", true)).toBe(true);
    expect(canQueueStatementProduct("cppAuto", false)).toBe(true);
    for (const product of ["domex", "allianzAuto", "kooperativaAuto", "uniqaAuto", "pillowAuto"] as const) {
      expect(canQueueStatementProduct(product, false)).toBe(true);
      expect(canQueueStatementProduct(product, true)).toBe(false);
    }
    expect(canQueueStatementProduct("neon", true)).toBe(false);
  });

  it("preserves replacement details through the iframe message, queue and authenticated save with PDF", async () => {
    const source = cppPrefill();
    const file = new File(["synthetic PDF"], "cpp.pdf", { type: "application/pdf" });
    const message = { ...source, ...replacement, type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "", pdfFile: file };
    expect(isStatementBatchQueueAddMessage(message)).toBe(true);
    const item = { ...cppAutoBatchQueueItemFromPrefill(source, message), pdfFile: file };
    expect(validateCppAutoBatchQueueItem(item)).toBeNull();
    expect(item).toMatchObject({ isRefresh: true, refreshOriginalContractNumber: "OLD123" });
    const result = await saveContractEntry({
      user: {} as User, ownerEmail: "represented@example.test", entry: statementBatchQueueContractEntry(item),
      pdfFile: item.pdfFile, fallbackError: "Chyba uložení",
    });
    expect(result).toMatchObject({ ok: true, pdfAttachment: { status: "uploaded" } });
    expect(mocks.requestContractsMutationWithAuth).toHaveBeenCalledWith(expect.objectContaining({
      payload: { ownerEmail: "represented@example.test", entry: expect.objectContaining({
        productKey: "cppAuto", isRefresh: true, refreshOriginalContractNumber: "OLD123",
        inputAmount: 12000, createdFromCommissionStatementId: "statement-cpp",
      }) },
    }));
    expect(mocks.uploadContractPdfAttachmentWithAuth).toHaveBeenCalledWith(expect.objectContaining({ file }));
    expect(statementBatchQueueContractEntry(cppAutoBatchQueueItemFromPrefill(source)))
      .toMatchObject({ isRefresh: false, refreshOriginalContractNumber: null });
  });

  it.each([
    { isRefresh: true, refreshOriginalContractNumber: "" },
    { isRefresh: true, refreshOriginalContractNumber: " new 123 " },
    { isRefresh: false, refreshOriginalContractNumber: "OLD123" },
    { isRefresh: true, refreshOriginalContractNumber: "OLD123", product: "allianzAuto" as const },
  ])("rejects inconsistent replacement data in messages and before batch saving: %j", patch => {
    const source = { ...cppPrefill(), ...patch };
    expect(isStatementBatchQueueAddMessage({ ...source, type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "" })).toBe(false);
    expect(validateCppAutoBatchQueueItem(cppAutoBatchQueueItemFromPrefill(source, patch))).not.toBeNull();
  });

  it.each([
    { isRefresh: "true" }, { refreshOriginalContractNumber: {} }, { refreshOriginalContractNumber: 123 },
  ])("rejects manipulated message field types: %j", patch => {
    expect(isStatementBatchQueueAddMessage({
      ...cppPrefill(), ...replacement, ...patch, type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "",
    })).toBe(false);
  });

  it("shows the replacement and allows correcting the original contract number before upload", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"), root = createRoot(container);
    const onUpdate = vi.fn();
    const item = cppAutoBatchQueueItemFromPrefill(cppPrefill(), replacement);
    try {
      await act(async () => root.render(<CppAutoBatchQueue items={[item]} isRunning={false}
        onUpdate={onUpdate} onRemove={() => {}} onClearSaved={() => {}} onRun={() => {}} />));
      expect(container.textContent).toContain("Náhrada původní smlouvy");
      const input = [...container.querySelectorAll("label")]
        .find(label => label.textContent?.includes("Číslo původní smlouvy"))!.querySelector("input")!;
      expect(input.value).toBe("OLD123");
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "OLD456");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(onUpdate).toHaveBeenCalledWith(item.id, { refreshOriginalContractNumber: "OLD456" });
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});

describe("ČPP travel insurance in the commission statement queue", () => {
  const travelPrefill = (productCode = "CPP_CS_Z") => ({
    ...statementCalculatorPrefill({
      product: resolveStatementProduct(productCode), contractNumber: "1800000001", clientName: "Novák Jan",
      signedAt: "01.09.2026", validFrom: "02.09.2026", statementBase: 1899.5,
      source: { statementId: "statement-travel", statementChronologyMs: 123456 },
    })!,
    cppA101QueueEligible: true,
  });

  it.each(["CPP_CS_Z", "CPP_CS6"])("preserves the one-off premium, policy end and PDF through the queue and authenticated save for %s", async productCode => {
    const source = travelPrefill(productCode);
    expect(source).toMatchObject({ product: "cppcestovko", sourceProductCode: productCode, amountText: "1899.5", frequency: "annual" });
    expect(canQueueStatementProduct(source.product, false)).toBe(true);
    expect(canQueueStatementProduct(source.product, true)).toBe(false);
    const file = new File(["synthetic PDF"], "travel.pdf", { type: "application/pdf" });
    const message = { ...source, type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, policyEndDate: "2026-09-12", stornoDate: "", pdfFile: file };
    expect(isStatementBatchQueueAddMessage(message)).toBe(true);
    const item = { ...cppAutoBatchQueueItemFromPrefill(source), policyEndDate: message.policyEndDate, pdfFile: file };
    expect(validateCppAutoBatchQueueItem(item)).toBeNull();
    expect(cppAutoBatchQueueItemKey(item)).toBe("cppcestovko:1800000001");
    const entry = statementBatchQueueContractEntry(item);
    const normalized = normalizeCreateEntryPayload({ raw: entry, ownerEmail: "represented@example.test", ownerUid: "user-travel" });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) throw new Error(normalized.error);
    expect(normalized.payload).toMatchObject({ productKey: "cppcestovko", inputAmount: 1899.5, frequencyRaw: "annual", isRefresh: false });
    expect(normalized.payload.policyEndDate?.toISOString().slice(0, 10)).toBe("2026-09-12");
    const result = await saveContractEntry({ user: {} as User, ownerEmail: "represented@example.test",
      entry, pdfFile: file, fallbackError: "Chyba uložení" });
    expect(result).toMatchObject({ ok: true, pdfAttachment: { status: "uploaded" } });
    expect(mocks.requestContractsMutationWithAuth).toHaveBeenCalledWith(expect.objectContaining({
      payload: { ownerEmail: "represented@example.test", entry: expect.objectContaining({
        productKey: "cppcestovko", inputAmount: 1899.5, effectiveInputAmount: 1899.5, frequencyRaw: "annual",
        policyEndDate: "2026-09-12", createdFromCommissionStatementId: "statement-travel",
      }) },
    }));
    expect(mocks.uploadContractPdfAttachmentWithAuth).toHaveBeenCalledWith(expect.objectContaining({ file, entryId: "entry-1" }));
  });

  it.each(["monthly", "quarterly", "semiannual"] as const)("rejects %s payments instead of changing the one-off premium", frequency => {
    expect(validateCppAutoBatchQueueItem({ ...cppAutoBatchQueueItemFromPrefill(travelPrefill()), frequency }))
      .toContain("podporovanou frekvenci");
  });

  it.each(["2026-09-01", "2026-02-30"])("rejects an invalid policy end before batch saving: %s", policyEndDate => {
    expect(validateCppAutoBatchQueueItem({ ...cppAutoBatchQueueItemFromPrefill(travelPrefill()), policyEndDate })).not.toBeNull();
  });

  it("keeps older messages without an end date compatible and rejects malformed dates and replacements", () => {
    const message = { ...travelPrefill(), type: STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE, stornoDate: "" };
    expect(isStatementBatchQueueAddMessage(message)).toBe(true);
    expect(isStatementBatchQueueAddMessage({ ...message, policyEndDate: {} })).toBe(false);
    expect(isStatementBatchQueueAddMessage({ ...message, isRefresh: true, refreshOriginalContractNumber: "OLD123" })).toBe(false);
    expect(statementBatchQueueContractEntry(cppAutoBatchQueueItemFromPrefill(travelPrefill())).policyEndDate).toBeNull();
  });

  it.each(["CPP_CS_Z", "CPP_CS6"])("enables the embedded %s form and offers one-off payment and an editable policy end in the mixed queue", async productCode => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(<StatementCalculatorIframePanel prefill={travelPrefill(productCode)} onClose={() => {}} />));
      const url = new URL(container.querySelector("iframe")!.getAttribute("src")!, "http://localhost");
      expect(url.searchParams.get("product")).toBe("cppcestovko");
      expect(url.searchParams.get("cppA101QueueEligible")).toBe("1");
      const item = { ...cppAutoBatchQueueItemFromPrefill(travelPrefill(productCode)), policyEndDate: "2026-09-12" };
      const onUpdate = vi.fn(), onRun = vi.fn();
      await act(async () => root.render(<CppAutoBatchQueue items={[item, cppAutoBatchQueueItemFromPrefill(prefill())]}
        isRunning={false} onUpdate={onUpdate} onRemove={() => {}} onClearSaved={() => {}} onRun={onRun} />));
      expect(container.textContent).toContain("ČPP Cestovko");
      expect(container.textContent).toContain("Kooperativa Auto");
      const card = container.querySelector("article")!;
      expect([...card.querySelectorAll("select option")].map(option => [option.getAttribute("value"), option.textContent]))
        .toEqual([["annual", "jednorázově"]]);
      const input = [...card.querySelectorAll("label")].find(label => label.textContent?.includes("Konec pojištění"))!.querySelector("input")!;
      expect(input.value).toBe("2026-09-12");
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "2026-09-15");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(onUpdate).toHaveBeenCalledWith(item.id, { policyEndDate: "2026-09-15" });
      await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Nahrát frontu"))!.click());
      expect(onRun).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});

describe("UNIQA Auto in the commission statement queue", () => {
  const uniqaPrefill = () => ({ ...statementCalculatorPrefill({
    product: resolveStatementProduct("UNIQA_AUTO"), contractNumber:"5520123456",clientName:"Novák Jan",
    signedAt:"01.09.2026",validFrom:"02.09.2026",statementBase:2796,
    source:{statementId:"statement-uniqa",statementNumber:"123",statementChronologyMs:123456},
  })!,cppA101QueueEligible:true });

  it.each(["quarterly","semiannual","annual"] as const)("preserves UNIQA, %s payments and PDF through the queue and authenticated save",async frequency=>{
    const source={...uniqaPrefill(),frequency};
    expect(source).toMatchObject({product:"uniqaAuto",sourceProductCode:"UNIQA_AUTO",amountText:"2796"});
    const file=new File(["synthetic PDF"],"uniqa.pdf",{type:"application/pdf"});
    expect(isStatementBatchQueueAddMessage({...source,type:STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE,stornoDate:"",pdfFile:file})).toBe(true);
    const item={...cppAutoBatchQueueItemFromPrefill(source),pdfFile:file};
    expect(validateCppAutoBatchQueueItem(item)).toBeNull();
    expect(cppAutoBatchQueueItemKey(item)).toBe("uniqaAuto:5520123456");
    const result=await saveContractEntry({user:{} as User,ownerEmail:"represented@example.test",
      entry:statementBatchQueueContractEntry(item),pdfFile:item.pdfFile,fallbackError:"Chyba uložení"});
    expect(result).toMatchObject({ok:true,pdfAttachment:{status:"uploaded"}});
    expect(mocks.requestContractsMutationWithAuth).toHaveBeenCalledWith(expect.objectContaining({
      payload:{ownerEmail:"represented@example.test",entry:expect.objectContaining({productKey:"uniqaAuto",inputAmount:2796,
        frequencyRaw:frequency,contractNumber:"5520123456",createdFromCommissionStatementId:"statement-uniqa"})},
    }));
    expect(mocks.uploadContractPdfAttachmentWithAuth).toHaveBeenCalledWith(expect.objectContaining({file,ownerEmail:"represented@example.test"}));
  });

  it("prevents unsupported monthly payments from being silently recalculated as quarterly",()=>{
    const item={...cppAutoBatchQueueItemFromPrefill(uniqaPrefill()),frequency:"monthly" as const};
    expect(validateCppAutoBatchQueueItem(item)).toContain("podporovanou frekvenci");
  });

  it("enables the embedded UNIQA form and shows UNIQA alongside other queued insurers",async()=>{
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
    const container=document.createElement("div"),root=createRoot(container);
    try{
      await act(async()=>root.render(<StatementCalculatorIframePanel prefill={uniqaPrefill()} onClose={()=>{}}/>));
      const url=new URL(container.querySelector("iframe")!.getAttribute("src")!,"http://localhost");
      expect(url.searchParams.get("product")).toBe("uniqaAuto");
      expect(url.searchParams.get("cppA101QueueEligible")).toBe("1");
      const onRun=vi.fn();
      await act(async()=>root.render(<CppAutoBatchQueue items={[cppAutoBatchQueueItemFromPrefill(uniqaPrefill()),cppAutoBatchQueueItemFromPrefill(prefill())]}
        isRunning={false} onUpdate={()=>{}} onRemove={()=>{}} onClearSaved={()=>{}} onRun={onRun}/>));
      expect(container.textContent).toContain("UNIQA Auto");expect(container.textContent).toContain("Kooperativa Auto");
      const uniqaCard=container.querySelector("article")!;
      expect([...uniqaCard.querySelectorAll("select option")].map(option=>option.getAttribute("value"))).toEqual(["quarterly","semiannual","annual"]);
      await act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent?.includes("Nahrát frontu"))!.click());
      expect(onRun).toHaveBeenCalledOnce();
    }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
  });
});
