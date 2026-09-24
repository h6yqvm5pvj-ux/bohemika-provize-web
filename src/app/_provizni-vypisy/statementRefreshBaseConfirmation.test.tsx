// @vitest-environment happy-dom
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {NeonRefreshBaseNotice} from "./statementLifeCardNotices";
import {neonRefreshBaseReview} from "./statementRefreshBaseReview";
import type {CommissionRow, MatchedSystemContract} from "./statementTypes";

const contract: MatchedSystemContract = {id:"entry",adviserEmail:"advisor@example.test",productKey:"neon",isRefresh:true,
  requiresStatementRefresh:true,inputAmount:1100,calculationInputAmount:1100};
const row=(type="A101",base=7840,commission=100)=>({type,base,commission,product:"CPP_NEONRF"}) as CommissionRow;
const review=neonRefreshBaseReview(contract,[row()]);
let root:Root,container:HTMLDivElement;
const onConfirm=vi.fn();
beforeEach(()=>{
  onConfirm.mockReset();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  container=document.createElement("div");root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});

describe("confirming a refresh base directly from the notice",()=>{
  it("offers the statement base, prevents a second click while saving and shows the confirmed result",async()=>{
    await act(async()=>root.render(<NeonRefreshBaseNotice review={review} onConfirm={onConfirm}/>));
    expect(container.textContent?.replaceAll("\u00a0"," ")).toContain("7 840 Kč ročně");
    expect(container.querySelector("button")?.textContent).toBe("Použít základnu z výpisu a přepočítat");
    expect(container.textContent).not.toContain("Potvrzení se uloží při zpracování");
    await act(async()=>container.querySelector("button")!.click());expect(onConfirm).toHaveBeenCalledOnce();
    await act(async()=>root.render(<NeonRefreshBaseNotice review={review} onConfirm={onConfirm} saving/>));
    expect(container.querySelector("button")!.disabled).toBe(true);
    await act(async()=>container.querySelector("button")!.click());expect(onConfirm).toHaveBeenCalledOnce();
    const confirmed=neonRefreshBaseReview({...contract,commissionBaseSource:"commission_statement",calculationInputAmount:653.33,
      refreshCommissionBase:{calculationAnnualPremium:7840},refreshStatementResolvedStatementNumber:"91"},[row()]);
    await act(async()=>root.render(<NeonRefreshBaseNotice review={confirmed} onConfirm={onConfirm}/>));
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toContain("Riziková základna potvrzena");
    expect(container.textContent).toContain("výpisu 91");
  });

  it("keeps errors visible and allows retry",async()=>{
    await act(async()=>root.render(<NeonRefreshBaseNotice review={review} onConfirm={onConfirm} error="Uložení se nezdařilo."/>));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Uložení se nezdařilo");
    await act(async()=>container.querySelector("button")!.click());expect(onConfirm).toHaveBeenCalledOnce();
  });

  it.each([[row("A201")],[row("B101")],[row("A101",7840,-100)],[row(),row("B0301",12000)]].map(rows=>({rows})))(
    "does not offer confirmation without an unambiguous positive risk base",async ({rows})=>{
      await act(async()=>root.render(<NeonRefreshBaseNotice review={neonRefreshBaseReview(contract,rows)} onConfirm={onConfirm}/>));
      expect(container.querySelector("button")).toBeNull();expect(onConfirm).not.toHaveBeenCalled();
    }
  );
});
