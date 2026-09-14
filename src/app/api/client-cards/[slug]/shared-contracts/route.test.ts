import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
const mocks = vi.hoisted(()=>({guard:vi.fn(),read:vi.fn(),advance:vi.fn()}));
vi.mock("@/app/api/contracts/_lib/contractsApi",()=>({requireContractsEntryGuard:mocks.guard}));
vi.mock("@/lib/server/firebaseAdmin",()=>({adminDb:{}}));
vi.mock("@/lib/server/clientContractIndex",()=>({advanceSharedClientIndex:mocks.advance}));
vi.mock("@/lib/server/clientContractSharing",()=>({readSharedClientContracts:mocks.read}));
import {GET} from "./route";
const ctx = {email:"own@example.test",teamEmails:["team@example.test","tip@example.test"],contractAccessEmails:["team@example.test","outside@example.test"],users:[
  {email:"own@example.test",name:"Own",accountType:"advisor"},{email:"team@example.test",name:"Team",accountType:"advisor"},
  {email:"outside@example.test",name:"Other",accountType:"advisor"},{email:"tip@example.test",accountType:"tipster"},
],isImpersonating:false};
const context = (slug=clientSlugForName("Petr Novák")!)=>({params:Promise.resolve({slug})});
const request = (query="")=>new NextRequest("http://localhost/api/client-cards/test/shared-contracts?"+query);
const result={contracts:[],summaries:[{shareId:"opaque",productKey:"neon",adviserName:"Other"}],matchingAvailable:true};
beforeEach(()=>{vi.resetAllMocks();mocks.guard.mockResolvedValue({ok:true,ctx,withRateLimit:(r:NextResponse)=>r});mocks.read.mockResolvedValue(result);mocks.advance.mockResolvedValue(true);});
describe("shared client contracts endpoint",()=>{
 it("uses current subordinates, never the broader admin access list",async()=>{
   const response=await GET(request("scope=my&ownerEmail=outside@example.test&includeDetails=1"),context());
   expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toContain("private, no-store");
   expect(mocks.read.mock.calls[0][2]).toMatchObject({email:ctx.email,teamEmails:["team@example.test"],selection:{scope:"my",advisers:[]}});
   expect(await response.json()).toEqual({ok:true,...result,indexing:false});
 });
 it("never starts global migration for a guessed client or a card without matching contacts",async()=>{
   mocks.read.mockResolvedValueOnce(null);expect((await GET(request(),context())).status).toBe(404);
   mocks.read.mockResolvedValueOnce({...result,summaries:[],matchingAvailable:false});expect((await GET(request(),context())).status).toBe(200);
   expect(mocks.advance).not.toHaveBeenCalled();
 });
 it("revalidates the association after a migration step",async()=>{
   mocks.read.mockResolvedValueOnce(result).mockResolvedValueOnce(null);
   const response=await GET(request(),context());expect(response.status).toBe(404);expect(JSON.stringify(await response.json())).not.toContain("opaque");
 });
 it("reports incomplete backfill without blocking the main card",async()=>{
   mocks.advance.mockResolvedValue(false);
   expect(await (await GET(request(),context())).json()).toMatchObject({ok:true,indexing:true});
   expect(mocks.advance.mock.calls[0][1]).toEqual(["own@example.test","team@example.test","outside@example.test"]);
 });
 it("denies impersonation and invalid IDs before any lookup",async()=>{
   expect((await GET(request(),context("../outside"))).status).toBe(404);
   mocks.guard.mockResolvedValue({ok:true,ctx:{...ctx,isImpersonating:true},withRateLimit:(r:NextResponse)=>r});
   expect((await GET(request(),context())).status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();
 });
 it.each([401,403,429])("preserves the authentication/role/rate limit rejection %s",async status=>{
   mocks.guard.mockResolvedValue({ok:false,response:NextResponse.json({}, {status})});expect((await GET(request(),context())).status).toBe(status);expect(mocks.read).not.toHaveBeenCalled();
 });
 it("returns a private error with no contract data on index failure",async()=>{
   mocks.advance.mockRejectedValue(new Error("private details"));const response=await GET(request(),context());
   expect(response.status).toBe(500);expect(JSON.stringify(await response.json())).not.toContain("private details");
 });
});
