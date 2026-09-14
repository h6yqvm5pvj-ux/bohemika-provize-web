import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import { clientContractIndexRecord } from "./clientContractIndex";
import { matchesSharedClient, readSharedClientContracts, type ClientSharingViewer } from "./clientContractSharing";

const owner = "own@example.test", peer = "peer@example.test", subordinate = "team@example.test";
const name = "Petr Novák", slug = clientSlugForName(name)!;
const base = { clientName: name, clientPhone: "+420 777 123 456", clientEmail: "petr@example.test", productKey: "neon" };
const doc = (id: string, email: string, patch: Record<string,unknown> = {}) => ({ id: `opaque-${id}`, data: () => ({ ...clientContractIndexRecord({...base,...patch},email), ownerEmail:email, entryId:id, contractNumber:`private-${id}`, note:"private note", inputAmount:10000 }) });
const where = vi.fn(), get = vi.fn();
const db = {collection:()=>({where})} as unknown as Firestore;
const viewer: ClientSharingViewer = { email:owner, teamEmails:[subordinate], selection:{scope:"my",advisers:[]}, adviserNames:new Map([[peer,"Jana Bílá"],[owner,"Jakub"],[subordinate,"Podřízený poradce"]]) };
beforeEach(()=>{ vi.clearAllMocks(); where.mockReturnValue({get}); get.mockResolvedValue({docs:[doc("own",owner),doc("peer",peer),doc("team",subordinate)]}); });
describe("shared client identity and field-level access",()=>{
  it("accepts title variants and normalizes phone formatting or email case",()=>{
    expect(matchesSharedClient({...base,id:"a"},{id:"b",clientName:"Bc. Petr Novák",clientPhone:"777123456"})).toBe(true);
    expect(matchesSharedClient({...base,id:"a"},{id:"b",clientName:name,clientEmail:"PETR@EXAMPLE.TEST"})).toBe(true);
  });
  it.each([
    {clientName:name}, {clientName:name,clientPhone:"777999888",clientEmail:"someone@example.test"},
    {clientName:"Petr Novak",clientPhone:"777123456"}, {clientName:"Jana Nová",clientEmail:"petr@example.test"},
  ])("does not connect a namesake or a shared contact with another name: %j",candidate=>{
    expect(matchesSharedClient({...base,id:"a"},{...candidate,id:"b"})).toBe(false);
  });
  it("returns only a product and adviser for a peer, with full data for an actual subordinate",async()=>{
    const result = await readSharedClientContracts(db,slug,viewer);
    expect(result?.summaries).toEqual([{shareId:"opaque-peer",productKey:"neon",adviserName:"Jana Bílá"}]);
    expect(result?.contracts).toHaveLength(1);
    expect(result?.contracts[0]).toMatchObject({id:"team",adviserEmail:subordinate,contractNumber:"private-team"});
    const summary = JSON.stringify(result?.summaries);
    for(const hidden of [peer,"private-peer","777", "petr@", "inputAmount","note","ownerEmail","entryId","contractSignedDate"]) expect(summary).not.toContain(hidden);
    expect(where).toHaveBeenCalledWith("clientSlug","==",slug);
  });
  it("gives the other adviser a reciprocal summary and does not grant detail access upwards",async()=>{
    const result=await readSharedClientContracts(db,slug,{...viewer,email:subordinate,teamEmails:[]});
    expect(result?.contracts).toEqual([]);
    expect(result?.summaries.map(item=>item.shareId).sort()).toEqual(["opaque-own","opaque-peer"]);
  });
  it("does not use another adviser's matching contacts to expand the sharing group",async()=>{
    get.mockResolvedValue({docs:[doc("own",owner,{clientEmail:null}),doc("bridge",peer,{clientEmail:"bridge@example.test"}),doc("other",peer,{clientPhone:"777222333",clientEmail:"bridge@example.test"})]});
    expect((await readSharedClientContracts(db,slug,viewer))?.summaries.map(item=>item.shareId)).toEqual(["opaque-bridge"]);
  });
  it("rejects guessed slugs without any owned/team contract, even for an admin with wider access",async()=>{
    get.mockResolvedValue({docs:[doc("peer",peer)]});
    expect(await readSharedClientContracts(db,slug,viewer)).toBeNull();
  });
  it("does not grant extra access through selected-adviser query parameters",async()=>{
    expect(await readSharedClientContracts(db,slug,{...viewer,selection:{scope:"team",advisers:[peer]}})).toBeNull();
  });
  it("keeps a card usable without contacts but shares no outside contracts",async()=>{
    get.mockResolvedValue({docs:[doc("own",owner,{clientPhone:null,clientEmail:null}),doc("peer",peer)]});
    expect(await readSharedClientContracts(db,slug,viewer)).toEqual({contracts:[],summaries:[],matchingAvailable:false});
  });
  it("revokes the shared view when the last owned contract disappears",async()=>{
    expect(await readSharedClientContracts(db,slug,viewer)).not.toBeNull();
    get.mockResolvedValue({docs:[doc("peer",peer)]});
    expect(await readSharedClientContracts(db,slug,viewer)).toBeNull();
  });
});
