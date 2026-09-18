// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";
import type { LifeInsuranceResultData } from "./lifeInsuranceShared";

const { exportData } = vi.hoisted(() => ({ exportData: vi.fn() }));
vi.mock("next/image", () => ({ default: () => <span /> }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({children}:{children:ReactNode}) => <main>{children}</main> }));
vi.mock("@/app/firebase-auth", () => ({ auth: {currentUser:{email:"advisor@example.test"}} }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_:unknown,cb:(user:unknown)=>void) => {cb({email:"advisor@example.test"});return ()=>{};} }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ effectiveUserEmail:(email:string)=>email||"", useEffectiveUserEmail:(email:string)=>email||"" }));
vi.mock("@/app/lib/userProfileCache", () => ({getUserProfileCached:async()=>({email:"advisor@example.test",profile:{fullName:"Jana Černá"}})}));
vi.mock("./LifeInsuranceExportDialog", () => ({LifeInsuranceExportDialog:({data}:{data:LifeInsuranceResultData}) => {exportData(data);return <div role="dialog"/>;}}));
let container:HTMLDivElement, root:Root;
function button(label:string) {const found=[...container.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim()===label||b.getAttribute("aria-label")===label);expect(found,label).toBeTruthy();return found!;}
async function click(label:string) {await act(async()=>button(label).click());}
async function choice(prefix:string) {const found=[...container.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.trim().startsWith(prefix));expect(found,prefix).toBeTruthy();await act(async()=>found!.click());}
async function fill(id:string,value:string) {const input=container.querySelector<HTMLInputElement>(`#${id}`)!;expect(input,id).toBeTruthy();await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});}
const minimumPicker = () => container.querySelector<HTMLButtonElement>("#pension-minimum")!;
const minimumOption = (value: string) => document.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)!;
async function toggleMinimumPicker() { await act(async()=>minimumPicker().click()); }
async function base() {await fill("life-age","35");await fill("life-insuredIncome","40000");await fill("life-essentialExpenses","22000");}
beforeEach(async()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLElement.prototype.scrollIntoView=vi.fn();container=document.createElement("div");document.body.append(container);root=createRoot(container);await act(async()=>root.render(<Page/>));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
describe("life insurance wizard",()=>{
  it("prevents skipping unvisited steps and revalidates edited earlier answers",async()=>{
    expect(button("Krok 6: Souhrn").disabled).toBe(true);
    await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("Doplň věk");
    await base();await fill("sickness-grossMonthly","-100");await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("kladnou částku");
    await fill("sickness-grossMonthly","");await click("Pokračovat");expect(document.activeElement?.textContent).toBe("Na koho se domácnost spoléhá?");
    await click("Pokračovat");await click("Krok 1: Klient");await fill("life-age","65");await click("Krok 3: Děti");
    expect(container.querySelector('[aria-current="step"]')?.getAttribute("aria-label")).toBe("Krok 1: Klient");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nižší než 65");
  });
  it("handles uninsured OSVČ and clears hidden children and loan values before export",async()=>{
    await base();await choice("OSVČ");await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("jestli si OSVČ");
    await click("Ne");await click("Pokračovat");await click("Pokračovat");
    await choice("AnoDo výpočtu");await fill("life-childrenCount","2");await fill("life-childHorizonYears","15");
    await choice("NePřeskočit");await choice("NeSmrt");
    await click("Pokračovat");await choice("AnoZobrazit pole");await fill("life-totalDebt","1000000");await fill("life-loanPayments","10000");
    await choice("Ne");expect(container.querySelector('[aria-current="step"]')?.getAttribute("aria-label")).toBe("Krok 4: Závazky");
    await click("Pokračovat");await click("Pokračovat");await click("Zobrazit návrh krytí");
    expect(container.textContent).toContain("OSVČ: bez náhrady od zaměstnavatele");await click("Tisk / PDF");
    const data=exportData.mock.lastCall![0] as LifeInsuranceResultData;
    expect(data.numbers).toMatchObject({childrenCount:0,totalDebt:0,loanPayments:0});
    expect(data.sicknessBenefits.cumulative).toEqual([0,0,0]);
    expect(data.sickLeave.recommendedDaily).toBe(880);
  });

  it("shows one personal state estimate per degree and keeps private coverage separate",async()=>{
    await base();await fill("sickness-grossMonthly","40000");await click("Pokračovat");await click("Pokračovat");
    await choice("NePřeskočit");await choice("NeSmrt");await click("Pokračovat");await choice("Ne");await click("Pokračovat");
    expect(container.querySelector('[aria-current="step"]')?.getAttribute("aria-label")).toBe("Krok 5: Invalidita");
    const pensionPreview=()=>container.querySelector('[aria-label="Orientační státní důchod"]')!;
    for(const amount of ["9 906 Kč","11 704 Kč","17 325 Kč"]) expect(pensionPreview().textContent?.replace(/\s/g," ")).toContain(amount);
    await choice("Osobní odhad");
    expect(pensionPreview().textContent).not.toContain("9 906");
    expect(pensionPreview().textContent).toContain("Vyplň příjem");
    await click("Pokračovat");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Doplň příjem");
    expect(container.querySelector<HTMLInputElement>("#pension-income")?.value).toBe("");
    await choice("Převzít ");await fill("pension-years","45");
    expect(minimumPicker().dataset.value).toBe("");
    expect(minimumPicker().textContent).toContain("Kliknutím vyber");
    expect(pensionPreview().textContent).toContain("Vyber možnost");
    await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("Zvýšené minimum");
    expect(container.querySelector('[aria-current="step"]')?.getAttribute("aria-label")).toBe("Krok 5: Invalidita");
    await toggleMinimumPicker();
    expect(document.querySelector('[role="option"][aria-selected="true"]')).toBeNull();
    await act(async()=>minimumOption("ordinary").click());
    for(const amount of ["10 760 Kč","13 690 Kč","22 479 Kč"]) expect(pensionPreview().textContent?.replace(/\s/g," ")).toContain(amount);
    await toggleMinimumPicker();expect(minimumOption("under28").getAttribute("aria-disabled")).toBe("true");await toggleMinimumPicker();
    await click("Pokračovat");await click("Zobrazit návrh krytí");
    const text=container.textContent!.replace(/\s/g," ");
    for(const amount of ["10.760 Kč","13.690 Kč","22.479 Kč"]) expect(text).toContain(amount);
    expect(container.querySelectorAll('[aria-label="Tabulka scénářů invalidity"]')).toHaveLength(0);
    expect(container.querySelector<HTMLDetailsElement>("details[data-personal-pension-source]")?.open).toBe(false);
    expect(text).not.toContain("9.906 Kč");
    await click("Tisk / PDF");
    const data=exportData.mock.lastCall![0] as LifeInsuranceResultData;
    expect(data.disabilityPension).toMatchObject({incomeMode:"gross",result:{assessmentBase:40000,creditedYears:45}});
    expect(data.invalidityScenarioId).toBe("veryLow");
    expect(button("Nízká").getAttribute("aria-pressed")).toBe("true");
    expect(data.invalidity.map(item=>item.monthlyNeed)).toEqual([4000,8000,12000]);
    expect(data.invalidity.map(item=>item.lumpWithoutDebt)).toEqual([1440000,2880000,4320000]);
    expect(data.death.annuityMortgageAmount).toBe(0);
  });

  it("retains personal inputs when editing and restores average-only mode without changing cover",async()=>{
    await base();await click("Pokračovat");await click("Pokračovat");await choice("NePřeskočit");await choice("NeSmrt");
    await click("Pokračovat");await choice("Ne");await click("Pokračovat");await choice("Osobní odhad");
    await fill("pension-income","40000");await fill("pension-years","45");
    await toggleMinimumPicker();await act(async()=>minimumOption("ordinary").click());
    await click("Pokračovat");await click("Zobrazit návrh krytí");await click("Tisk / PDF");
    const data=exportData.mock.lastCall![0] as LifeInsuranceResultData;
    expect(data.invalidity.map(item=>item.monthlyNeed)).toEqual([4000,8000,12000]);
    await click("Upravit odhad důchodu");
    expect(container.querySelector<HTMLInputElement>("#pension-income")?.value).toBe("40000");
    await fill("pension-years","45,5");await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("celých let");
    await choice("Průměr v ČR");await click("Pokračovat");await click("Zobrazit návrh krytí");
    expect(container.textContent).not.toContain("Osobní odhad státního důchodu");
    expect(container.textContent).toContain("Doplnit údaje o důchodu");
  });

  it("switches three simple variants without deducting the state pension, including investment",async()=>{
    await base();await fill("life-age","25");await fill("life-insuredIncome","31000");
    await click("Pokračovat");await click("Pokračovat");await choice("NePřeskočit");await choice("NeSmrt");
    await click("Pokračovat");await choice("Ne");await click("Pokračovat");await choice("Osobní odhad");
    await fill("pension-income","43400");await fill("pension-years","5");
    await toggleMinimumPicker();await act(async()=>minimumOption("under28").click());
    await click("Pokračovat");await click("Zobrazit návrh krytí");
    const disability=container.querySelector("#life-disability")!;
    expect(disability.querySelectorAll('[role="group"][aria-label="Varianta krytí invalidity"] button')).toHaveLength(3);
    expect(disability.querySelector('input[type="range"], table')).toBeNull();
    await click("Tisk / PDF");
    const options=[{label:"Nízká",id:"veryLow",needs:[3100,6200,9300]}, {label:"Střední",id:"low",needs:[9300,15500,24800]}, {label:"Vysoká",id:"medium",needs:[12400,18600,31000]}];
    for(const option of options) {
      await click(option.label);
      const data=exportData.mock.lastCall![0] as LifeInsuranceResultData;
      expect(data.invalidityScenarioId).toBe(option.id);
      expect(data.invalidity.map(item=>item.monthlyNeed)).toEqual(option.needs);
      expect(data.invalidity.map(item=>item.lumpWithoutDebt)).toEqual(option.needs.map(amount=>amount*480));
      expect(data.disabilityPension?.result.pensions.map(item=>item.total)).toEqual([9169,11304,17707]);
      expect(button(option.label).getAttribute("aria-pressed")).toBe("true");
    }
    await click("Investiční varianta");await choice("Investika Realitní fond");
    await click("Nízká");
    const investment=exportData.mock.lastCall![0] as LifeInsuranceResultData;
    expect(investment.invalidityModel).toBe("investment");
    expect(investment.invalidity.map(item=>item.monthlyNeed)).toEqual([3100,6200,9300]);
    await click("Upravit odhad důchodu");await click("Pokračovat");await click("Zobrazit návrh krytí");
    expect(button("Nízká").getAttribute("aria-pressed")).toBe("true");
  });

  it("links minimum help to the stepper age and blocks stale under-28 results after an age change",async()=>{
    await base();await fill("life-age","27");await click("Pokračovat");await click("Pokračovat");
    await choice("NePřeskočit");await choice("NeSmrt");await click("Pokračovat");await choice("Ne");await click("Pokračovat");
    await choice("Osobní odhad");await fill("pension-income","40000");await fill("pension-years","45");
    expect(minimumPicker().dataset.value).toBe("");
    await toggleMinimumPicker();expect(minimumOption("under28").getAttribute("aria-disabled")).toBe("false");await toggleMinimumPicker();
    expect(container.querySelector("#pension-minimum-age")?.textContent).toContain("Věk z kroku Klient: 27 let");
    await click("Nápověda");
    expect(container.querySelector("dialog[open]")?.textContent).toContain("Věk z kroku Klient: 27 let");
    expect(container.querySelector("dialog")?.textContent).toContain("Příklad: klientka, 25 let, pracuje 4,5 roku");
    await click("Rozumím");expect(container.querySelector("dialog")).toBeNull();
    expect(minimumPicker().dataset.value).toBe("");
    await toggleMinimumPicker();await act(async()=>minimumOption("under28").click());
    await click("Krok 1: Klient");await fill("life-age","28");await click("Krok 5: Invalidita");
    await toggleMinimumPicker();expect(minimumOption("under28").getAttribute("aria-disabled")).toBe("true");
    await act(async()=>minimumOption("under28").click());expect(minimumPicker().getAttribute("aria-expanded")).toBe("true");await toggleMinimumPicker();
    expect(container.querySelector("#pension-minimum-age")?.textContent).toContain("Věk z kroku Klient: 28 let");
    expect(container.querySelector("#pension-minimum-error")?.textContent).toContain("Vyber jiný režim minima");
    await click("Pokračovat");
    expect(container.querySelector('[aria-current="step"]')?.getAttribute("aria-label")).toBe("Krok 5: Invalidita");
    await click("Použít běžné minimum");
    expect(minimumPicker().dataset.value).toBe("ordinary");expect(container.querySelector("#pension-minimum-error")?.textContent).toBe("");
    await click("Pokračovat");await click("Zobrazit návrh krytí");await click("Tisk / PDF");
    const data=exportData.mock.lastCall![0] as LifeInsuranceResultData;
    expect(data.numbers.age).toBe(28);expect(data.disabilityPension?.result.minimumMode).toBe("ordinary");
  });
});
