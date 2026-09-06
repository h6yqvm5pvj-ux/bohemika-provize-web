import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, any>>();
  const mailbox = new Set<string>();
  const writes: string[] = [];
  class Ref {
    constructor(public path: string) {}
    get id() { return this.path.split("/").at(-1)!; }
    collection(name: string) { return new Query(`${this.path}/${name}`); }
    async get() { return snapshot(this); }
    async set(value: Record<string, any>, options?: { merge?: boolean }) {
      writes.push(this.path);
      store.set(this.path, { ...(options?.merge ? store.get(this.path) : {}), ...value });
    }
    async update(value: Record<string, any>) {
      if (!store.has(this.path)) throw new Error("MISSING");
      return this.set(value, { merge: true });
    }
  }
  const snapshot = (ref: Ref) => ({ ref, id: ref.id, exists: store.has(ref.path), data: () => store.get(ref.path) });
  class Query {
    constructor(public path: string, public filters: [string, unknown][] = [], public orders: [string, string][] = [], public size = Infinity, public cursor: any[] = []) {}
    doc(id?: string) { return new Ref(`${this.path}/${id ?? 'generated'}`); }
    where(field: string, _operator: string, value: unknown) { return new Query(this.path, [...this.filters, [field, value]], this.orders, this.size, this.cursor); }
    orderBy(field: string, direction = 'asc') { return new Query(this.path, this.filters, [...this.orders, [field, direction]], this.size, this.cursor); }
    limit(size: number) { return new Query(this.path, this.filters, this.orders, size, this.cursor); }
    startAfter(...cursor: any[]) { return new Query(this.path, this.filters, this.orders, this.size, cursor); }
    async get() {
      let docs = [...store.keys()].filter(path => path.startsWith(`${this.path}/`) && !path.slice(this.path.length + 1).includes('/')).map(path => snapshot(new Ref(path)));
      docs = docs.filter(doc => this.filters.every(([field, value]) => doc.data()?.[field] === value));
      const values = (doc: ReturnType<typeof snapshot>) => this.orders.map(([field]) => field === '__name__' ? doc.id : doc.data()?.[field]);
      const compare = (a: any[], b: any[]) => {
        for(let i=0;i<b.length;i++) { if(a[i] !== b[i]) return (a[i] < b[i] ? -1 : 1) * (this.orders[i]?.[1] === 'desc' ? -1 : 1); }
        return 0;
      };
      docs.sort((a,b)=>compare(values(a),values(b)));
      if(this.cursor.length) { const cursor=this.cursor[0]?.ref ? values(this.cursor[0]) : this.cursor; docs=docs.filter(doc=>compare(values(doc),cursor)>0); }
      docs=docs.slice(0,this.size);
      return {docs,empty:docs.length===0,size:docs.length};
    }
  }
  const db = {
    collection: (name: string) => new Query(name),
    getAll: async (...refs: Ref[]) => Promise.all(refs.map(ref => ref.get())),
    runTransaction: async (run: (tx: any)=>unknown) => run({ get: (ref: Ref)=>ref.get(), set:(ref:Ref,data:any,options:any)=>ref.set(data,options), update:(ref:Ref,data:any)=>ref.update(data) }),
  };
  return { store, db, writes, mailbox, guard: vi.fn(), push: vi.fn(), writeMailbox: vi.fn() };
});

vi.mock("@/lib/server/firebaseAdmin",()=>({adminDb:mocks.db,adminMessaging:{sendEachForMulticast:mocks.push}}));
vi.mock("@/lib/server/apiEntryGuard",()=>({requireAdvisorAuthedRateLimited:mocks.guard,withRateLimitHeaders:(response:NextResponse)=>response}));
vi.mock("firebase-admin/firestore",()=>({FieldPath:{documentId:()=>"__name__"},Timestamp:{fromMillis:(value:number)=>value},FieldValue:{serverTimestamp:()=>123456}}));
vi.mock("firebase-admin/storage",()=>({getStorage:vi.fn()}));
vi.mock("@/lib/server/intranetWallAttachments",()=>({prepareIntranetWallAttachmentFile:vi.fn()}));
vi.mock("@/lib/server/mailbox",()=>({writeMailboxEntryOnce:mocks.writeMailbox,writeMailboxEntries:vi.fn()}));

import { GET } from "./route";
import { POST as updateState } from "./[postId]/state/route";
import { POST as updateSolution } from "./[postId]/solution/route";
import { sendDiscussionCommentNotifications } from "@/lib/server/intranetDiscussionNotifications";

const owner = 'owner@example.test';
const viewer = 'viewer@example.test';
const postPath = (id='post') => `intranetWallPosts/${id}`;
const statePath = (id='post',email=viewer) => `${postPath(id)}/viewerStates/${email}`;
const commentPath = (id='answer',post='post') => `${postPath(post)}/comments/${id}`;
const asUser = (email=viewer) => mocks.guard.mockResolvedValue({ok:true,ctx:{email,uid:email,rateLimit:{}}});
function post(id='post',extra: Record<string,unknown>={}) { mocks.store.set(postPath(id),{title:`Příspěvek ${id}`,text:'Studijní materiál pro tým',section:'pomoc',createdAt:1000,createdByEmail:owner,createdByUid:'owner-uid',createdByName:'Jana Novotná',...extra}); }
function comment(id='answer',extra:Record<string,unknown>={}) { mocks.store.set(commentPath(id),{text:'Zde je odpověď',createdAt:1001,createdByEmail:viewer,createdByUid:'viewer-uid',createdByName:'Petr Novák',...extra}); }
const request = (suffix='',body?:unknown) => new NextRequest(`https://example.test/api/intranet/wall${suffix}`,body===undefined?undefined:{method:'POST',body:JSON.stringify(body)});
const state = (body:unknown,id='post') => updateState(request(`/${id}/state`,body),{params:Promise.resolve({postId:id})});
const solution = (commentId:unknown,id='post') => updateSolution(request(`/${id}/solution`,{commentId}),{params:Promise.resolve({postId:id})});
const feed = async (query='') => (await GET(request(query))).json();

beforeEach(()=>{
  vi.clearAllMocks();mocks.store.clear();mocks.writes.length=0;mocks.mailbox.clear();asUser();
  mocks.push.mockResolvedValue({successCount:1});
  mocks.writeMailbox.mockImplementation(async ({recipientEmail,entryId})=>{const key=`${recipientEmail}:${entryId}`;if(mocks.mailbox.has(key))return{written:false};mocks.mailbox.add(key);return{written:true};});
});

describe('osobní stav příspěvků',()=>{
  it('ukládá pouze stav přihlášeného účtu a zachová ostatní pole',async()=>{
    post();
    expect((await state({field:'saved',value:true})).status).toBe(200);
    await state({field:'following',value:true});await state({field:'read',value:true});
    const saved = mocks.store.get(statePath())!;expect(saved.saved).toBe(true);expect(saved.following).toBe(true);expect(saved.readAtMs).toBeGreaterThan(0);
    await state({field:'read',value:true});expect(mocks.store.get(statePath())?.readAtMs).toBe(saved.readAtMs);
    await state({field:'saved',value:false});expect(mocks.store.get(statePath())?.following).toBe(true);
    asUser('other@example.test');expect((await feed()).posts[0]).toMatchObject({saved:false,following:false,readAtMs:null});
    asUser();expect((await feed()).posts[0]).toMatchObject({saved:false,following:true,readAtMs:saved.readAtMs});
  });
  it('nepovolí podstrčení jiného uživatele nebo změnu role',async()=>{
    post();expect((await state({field:'saved',value:true,email:owner})).status).toBe(400);
    expect((await state({field:'specialist',value:true})).status).toBe(400);
    expect((await state({field:'saved',value:'true'})).status).toBe(400);expect(mocks.writes).toEqual([]);
  });
  it('kontroluje existenci příspěvku a přihlášení',async()=>{
    expect((await state({field:'saved',value:true})).status).toBe(404);
    mocks.guard.mockResolvedValue({ok:false,response:NextResponse.json({ok:false},{status:401})});
    expect((await state({field:'saved',value:true})).status).toBe(401);expect(mocks.writes).toEqual([]);
  });
  it('autor sleduje vlastní diskusi, ale může se odhlásit',async()=>{
    post();asUser(owner);expect((await feed()).posts[0].following).toBe(true);
    await state({field:'following',value:false});expect((await feed('?view=following')).posts).toEqual([]);
  });
});

describe('filtry, hledání a stránkování',()=>{
  it('najde uložený příspěvek i za první stovkou záznamů',async()=>{
    for(let i=0;i<130;i++)post(`post${i}`,{createdAt:1000+i});
    mocks.store.set(statePath('post0'),{saved:true});
    const result=await feed('?view=saved');expect(result.posts.map((p:any)=>p.id)).toEqual(['post0']);expect(result.hasMore).toBe(false);
  });
  it('rozlišuje nepřečtené podle účtu a umožní vrácení do nepřečtených',async()=>{
    post();await state({field:'read',value:true});expect((await feed('?view=unread')).posts).toEqual([]);
    await state({field:'read',value:false});expect((await feed('?view=unread')).posts).toHaveLength(1);
  });
  it('hledá bez diakritiky podle autora, názvu i textu napříč kategoriemi',async()=>{
    post('a',{section:'zivot',title:'Školení invalidity',createdByName:'Ema'});post('b',{section:'auto',text:'Důležité k vozidlům',createdByName:'Jiří Hájek'});
    expect((await feed('?q=skoleni')).posts.map((p:any)=>p.id)).toEqual(['a']);
    expect((await feed('?q=hajek')).posts.map((p:any)=>p.id)).toEqual(['b']);
    expect((await feed('?q=vozidlum')).posts.map((p:any)=>p.id)).toEqual(['b']);
    expect((await feed('?q=hajek&section=zivot')).posts).toEqual([]);
  });
  it('nevynechá příspěvky se stejným časem vytvoření',async()=>{
    for(const id of ['a','b','c','d','e'])post(id);
    const first=await feed('?limit=2');expect(first.posts.map((p:any)=>p.id)).toEqual(['e','d']);
    const second=await feed(`?limit=2&cursorMs=${first.nextCursorMs}&cursorId=${first.nextCursorId}`);expect(second.posts.map((p:any)=>p.id)).toEqual(['c','b']);
    const third=await feed(`?limit=2&cursorMs=${second.nextCursorMs}&cursorId=${second.nextCursorId}`);expect(third.posts.map((p:any)=>p.id)).toEqual(['a']);expect(third.hasMore).toBe(false);
  });
  it('otevře starší příspěvek přímo z odkazu a vrací jen vlastní osobní stav',async()=>{
    post('old',{createdAt:1});post('new',{createdAt:2});mocks.store.set(statePath('old'),{saved:true});mocks.store.set(statePath('old',owner),{readAtMs:123});
    const response=await feed('?postId=old');expect(response.posts).toHaveLength(1);expect(response.posts[0]).toMatchObject({id:'old',saved:true,readAtMs:null});
    expect(response.posts[0]).not.toHaveProperty('viewerStates');
  });
  it('odmítá neplatné filtry a ID',async()=>{
    expect((await GET(request('?view=admin'))).status).toBe(400);expect((await GET(request('?postId=bad%2Fid'))).status).toBe(400);
  });
});

describe('badge Specialista a vybrané řešení',()=>{
  it('načítá aktuální roli u autora, komentáře a odpovědi',async()=>{
    post();comment();comment('reply',{parentCommentId:'answer',createdByEmail:owner,createdByUid:'owner-uid'});
    mocks.store.set(`users/${owner}`,{specialist:true});mocks.store.set('users/viewer-uid',{role:'specialista'});
    let item=(await feed()).posts[0];expect(item.author.specialist).toBe(true);expect(item.comments[0].author.specialist).toBe(true);expect(item.comments[0].replies[0].author.specialist).toBe(true);
    mocks.store.set(`users/${owner}`,{specialist:false});item=(await feed()).posts[0];expect(item.author.specialist).toBe(false);
  });
  it('povolí pouze autorovi otázky vybrat a zrušit existující řešení',async()=>{
    post();comment();expect((await solution('answer')).status).toBe(403);expect(mocks.writes).toEqual([]);
    asUser(owner);expect((await solution('missing')).status).toBe(404);
    expect((await solution('answer')).status).toBe(200);expect(mocks.store.get(postPath())?.acceptedCommentId).toBe('answer');
    expect((await solution(null)).status).toBe(200);expect(mocks.store.get(postPath())?.acceptedCommentId).toBeNull();
  });
  it('nepovolí řešení mimo Pomoc ani komentář jiného příspěvku',async()=>{
    post('post',{section:'auto'});comment();asUser(owner);expect((await solution('answer')).status).toBe(400);
    post();mocks.store.set('intranetWallPosts/other/comments/foreign',{text:'Cizí'});expect((await solution('foreign')).status).toBe(404);
  });
  it('zobrazí vybranou starší odpověď i jejího rodiče mimo posledních 120 komentářů',async()=>{
    post('post',{acceptedCommentId:'old-answer'});comment('parent',{createdAt:1});comment('old-answer',{createdAt:2,parentCommentId:'parent'});
    for(let i=0;i<130;i++)comment(`recent${i}`,{createdAt:100+i});
    const result=(await feed()).posts[0];expect(result.acceptedCommentId).toBe('old-answer');
    expect(result.comments.find((c:any)=>c.id==='parent').replies[0].id).toBe('old-answer');
    expect(result.comments.some((c:any)=>c.id==='recent129')).toBe(true);
  });
});

const notify=()=>sendDiscussionCommentNotifications({postId:'post',commentId:'new-comment',section:'pomoc',sectionLabel:'Pomoc',postAuthorEmail:owner,commenterEmail:viewer,commenterName:'Petr',origin:'https://example.test'});

describe('sledování diskusí',()=>{
  it('upozorní autora i sledující bez duplicit a bez vlastního komentáře',async()=>{
    post();mocks.store.set(statePath('post',owner),{following:true});mocks.store.set(statePath(),{following:true});mocks.store.set(statePath('post','watcher@example.test'),{following:true});
    await notify();expect(mocks.writeMailbox.mock.calls.map(call=>call[0].recipientEmail).sort()).toEqual([owner,'watcher@example.test'].sort());
    expect(mocks.writeMailbox.mock.calls[0][0].deepLink).toBe('/intranet?section=pomoc&postId=post');
  });
  it('respektuje odhlášení, vypnutá oznámení i push kanál',async()=>{
    post();mocks.store.set(statePath('post',owner),{following:false});
    for(const email of ['off@example.test','inbox@example.test','push@example.test'])mocks.store.set(statePath('post',email),{following:true});
    mocks.store.set('users/off@example.test',{notificationSettings:{types:{intranet:false}},fcmToken:'off'});
    mocks.store.set('users/inbox@example.test',{notificationSettings:{channels:{push:false}},fcmToken:'inbox'});
    mocks.store.set('users/push@example.test',{fcmToken:'push',notificationSettings:{intranet:{mode:'selected',sections:[]}}});
    await notify();expect(mocks.writeMailbox.mock.calls.map(call=>call[0].recipientEmail).sort()).toEqual(['inbox@example.test','push@example.test']);
    expect(mocks.push).toHaveBeenCalledTimes(1);expect(mocks.push.mock.calls[0][0].tokens).toEqual(['push']);
  });
  it('opakování události nepošle duplicitní push a chyba příjemce nezastaví ostatní',async()=>{
    post();mocks.store.set(`users/${owner}`,{fcmToken:'owner-token'});mocks.store.set(statePath('post','watcher@example.test'),{following:true});
    mocks.writeMailbox.mockRejectedValueOnce(new Error('test failure'));const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    await notify();expect(mocks.mailbox.size).toBe(1);expect(warning).toHaveBeenCalled();warning.mockRestore();
    await notify();const sent=mocks.push.mock.calls.length;await notify();expect(mocks.push.mock.calls.length).toBe(sent);
  });
});
