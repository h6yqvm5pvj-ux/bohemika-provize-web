import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {neonRefreshBaseReview,neonRefreshBaseStatus} from "./statementRefreshBaseReview";
import {NeonRefreshBaseNotice,LifeCommissionBaseDifferenceNotice} from "./statementLifeCardNotices";
import type {CommissionRow,MatchedSystemContract} from "./statementTypes";

const contract: MatchedSystemContract = {id:"test",adviserEmail:"advisor@example.test",productKey:"neon",isRefresh:true,
  calculationInputAmount:1000,refreshCommissionBase:{calculationAnnualPremium:12000},inputAmount:2000};
const row=(type:string,base:number,commission=100)=>({type,base,commission,product:"CPP_NEONRF"}) as CommissionRow;

describe("REFRESH base evidence",()=>{
  it("keeps a confirmed risk base distinct from a smaller B101 base",()=>{
    const review=neonRefreshBaseReview({...contract,commissionBaseSource:"commission_statement",refreshOriginalMissingInSystem:true,
      refreshStatementResolvedStatementNumber:"91"},[row("B101",732)]);
    expect(review).toMatchObject({status:"confirmed",annual:12000,statementRiskAnnual:null});
    const html=renderToStaticMarkup(createElement(NeonRefreshBaseNotice,{review}));
    expect(html).toContain("Riziková základna potvrzena");
    expect(html).toContain("výpisu 91");
    expect(html).not.toContain("732");
    const warning=renderToStaticMarkup(createElement(LifeCommissionBaseDifferenceNotice,{differences:[{label:"Základna B101",statementAnnualPremiumBase:732,systemAnnualPremiumBase:12000}]}));
    expect(warning).toContain("Základna B101");
    expect(warning).toContain("Rozdíl základny u konkrétní provize");
  });

  it("shows pending evidence even when the provisional amount happens to match the statement",()=>{
    const review=neonRefreshBaseReview({...contract,requiresStatementRefresh:true},[row("A101",12000)]);
    expect(review).toMatchObject({status:"waiting",statementRiskAnnual:12000});
    expect(renderToStaticMarkup(createElement(NeonRefreshBaseNotice,{review}))).toContain("Potvrzení se uloží při zpracování výpisu");
  });

  it.each(["A201","B101"])("does not offer confirmation from %s",code=>{
    const review=neonRefreshBaseReview({...contract,requiresStatementRefresh:true},[row(code,60000)]);
    expect(review?.statementRiskAnnual).toBeNull();
    const html=renderToStaticMarkup(createElement(NeonRefreshBaseNotice,{review}));
    expect(html).toContain("potřebujeme výpis s rizikovou A101/B0301");
    expect(html).not.toContain("Potvrzení se uloží");
  });

  it("uses risk A101 alongside larger A201 and ignores a reversed risk payment",()=>{
    expect(neonRefreshBaseReview(contract,[row("A201",60000),row("A101",12000)])?.statementRiskAnnual).toBe(12000);
    expect(neonRefreshBaseReview(contract,[row("A101",12000,-100),row("A201",60000)])?.statementRiskAnnual).toBeNull();
  });

  it("does not confirm from an unrelated product's risk row",()=>{
    expect(neonRefreshBaseReview(contract,[{...row("A101",12000),product:"CPP_DOMX+2"}])?.statementRiskAnnual).toBeNull();
  });

  it("keeps a calculation from an original contract explicitly unconfirmed",()=>{
    expect(neonRefreshBaseStatus({...contract,refreshOriginalContractNumber:"12345"})).toBe("calculated");
    expect(neonRefreshBaseStatus({...contract,refreshOriginalContractNumber:"12345",requiresStatementRefresh:true})).toBe("waiting");
  });

  it("requires evidence for legacy flags and a positive amount for confirmed state",()=>{
    expect(neonRefreshBaseStatus(contract)).toBe("waiting");
    expect(neonRefreshBaseStatus({...contract,commissionBaseSource:"commission_statement",calculationInputAmount:0,refreshCommissionBase:null})).toBe("waiting");
  });

  it.each([{...contract,isRefresh:false},{...contract,productKey:"flexi" as const},null])("leaves non-refresh products alone",system=>{
    expect(neonRefreshBaseReview(system,[row("A101",12000)])).toBeNull();
  });
});
