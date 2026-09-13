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
async function base() {await fill("life-age","35");await fill("life-insuredIncome","40000");await fill("life-essentialExpenses","22000");}
beforeEach(async()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLElement.prototype.scrollIntoView=vi.fn();container=document.createElement("div");document.body.append(container);root=createRoot(container);await act(async()=>root.render(<Page/>));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
describe("life insurance wizard",()=>{
  it("prevents skipping unvisited steps and revalidates edited earlier answers",async()=>{
    expect(button("Krok 5: Souhrn").disabled).toBe(true);
    await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("Doplň věk");
    await base();await fill("sickness-grossMonthly","-100");await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("kladnou částku");
    await fill("sickness-grossMonthly","");await click("Pokračovat");expect(document.activeElement?.textContent).toBe("Na koho se domácnost spoléhá?");
    await click("Pokračovat");await click("Krok 1: Klient");await fill("life-age","65");await click("Krok 3: Děti");
    expect(container.querySelector('[aria-current="step"]')?.getAttribute("aria-label")).toBe("Krok 1: Klient");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("nižší než 65");
  });
  it("handles uninsured OSVČ and clears hidden children and loan values before export",async()=>{
    await base();await choice("OSVČ");await click("Pokračovat");expect(container.querySelector('[role="alert"]')?.textContent).toContain("jestli si OSVČ");
    await choice("NeKlient");await click("Pokračovat");await click("Pokračovat");
    await choice("AnoDo výpočtu");await fill("life-childrenCount","2");await fill("life-childHorizonYears","15");
    await choice("NePřeskočit");await choice("NeSmrt");
    await click("Pokračovat");await choice("AnoZobrazit pole");await fill("life-totalDebt","1000000");await fill("life-loanPayments","10000");
    await choice("Ne");expect(container.querySelector('[aria-current="step"]')?.getAttribute("aria-label")).toBe("Krok 4: Závazky");
    await click("Pokračovat");await click("Zobrazit návrh krytí");
    expect(container.textContent).toContain("OSVČ: bez náhrady od zaměstnavatele");await click("Tisk / PDF");
    const data=exportData.mock.lastCall![0] as LifeInsuranceResultData;
    expect(data.numbers).toMatchObject({childrenCount:0,totalDebt:0,loanPayments:0});
    expect(data.sicknessBenefits.cumulative).toEqual([0,0,0]);
    expect(data.sickLeave.recommendedDaily).toBe(880);
  });
});
