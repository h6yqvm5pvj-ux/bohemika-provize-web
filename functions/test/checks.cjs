const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { authenticate, assertRevocation, consumeRate, authorizeRecipients } = require("../security");
const { processInvoice, nextMonth } = require("../billing");

const generation = "12345678-1234-1234-1234-123456789abc";
function memory(initial = {}) {
  const rows = new Map(Object.entries(initial)); let tail = Promise.resolve();
  const snapshot = path => ({ exists: rows.has(path), id: path.split("/").at(-1), ref: ref(path), data: () => rows.get(path) });
  const ref = path => ({ path, get: async () => snapshot(path) });
  const db = { rows, collection(name) {
    const query = (filters = [], max = Infinity) => ({
      doc: id => ref(`${name}/${id}`),
      where: (field, op, value) => { assert.equal(op, "=="); return query([...filters, [field,value]], max); },
      limit: n => query(filters, n),
      async get() {
        const docs = [...rows].filter(([k,v]) => k.startsWith(name + "/") && k.split("/").length === 2 && filters.every(([f,w]) => v[f] === w)).slice(0,max).map(([k]) => snapshot(k));
        return { empty: !docs.length, docs };
      },
    });
    return query();
  }, async runTransaction(fn) {
    const previous = tail; let unlock; tail = new Promise(resolve => { unlock = resolve; }); await previous;
    const writes = [];
    try {
      const value = await fn({ get: r => r.get(), set(r,v,opts) { writes.push(() => rows.set(r.path, opts?.merge ? { ...rows.get(r.path), ...v } : v)); },
        create(r,v) { if (rows.has(r.path)) throw new Error("already exists"); writes.push(() => rows.set(r.path,v)); } });
      writes.forEach(write => write()); return value;
    } finally { unlock(); }
  }};
  return db;
}
function fixture() {
  const token = { uid:"uid-manager", email:"manager@example.invalid", email_verified:true, auth_time:200, firebase:{sign_in_provider:"password",sign_in_second_factor:"totp"} };
  const user = { uid:token.uid, email:token.email, emailVerified:true, disabled:false, multiFactor:{enrolledFactors:[{factorId:"totp"}]} };
  const db = memory({ [`users/${token.email}`]:{userId:token.uid}, "users/recipient@example.invalid":{userId:"uid-recipient",managerEmail:token.email,fcmToken:"synthetic-device"} });
  const calls = { verify:[],push:[],http:[] }; let authError;
  const firestore = () => db; firestore.Timestamp = { fromDate:date => ({toDate:() => new Date(date), iso:date.toISOString()}) };
  const admin = {initializeApp(){},firestore,auth:() => ({async verifyIdToken(value, revoked){calls.verify.push(revoked);if(authError)throw authError;if(value!=="valid")throw Object.assign(new Error("invalid"),{code:"auth/invalid-id-token"});return token;},async getUser(){return user;}}),messaging:()=>({async send(m){calls.push.push(m);return "synthetic-message";}})};
  return {token,user,db,calls,admin,setAuthError:value=>{authError=value;},req:{method:"POST",headers:{authorization:"Bearer valid","content-type":"application/json"},body:{},query:{}}};
}
const expectStatus = (promise,status) => assert.rejects(promise,error => error.status === status);

test("normal TOTP and passkey authentication pass and always check SDK revocation", async () => {
  const f=fixture();await authenticate(f.admin,f.req);
  f.token.firebase={sign_in_provider:"custom"};f.token.app_totp_enrolled=true;
  await authenticate(f.admin,f.req);assert.deepEqual(f.calls.verify,[true,true]);
});
const rejects = {
  missing:f=>{delete f.req.headers.authorization;}, invalid:f=>{f.req.headers.authorization="Bearer invalid";},
  expired:f=>f.setAuthError({code:"auth/id-token-expired"}), revoked:f=>f.setAuthError({code:"auth/id-token-revoked"}),
  disabled:f=>{f.user.disabled=true;}, unverifiedUser:f=>{f.user.emailVerified=false;}, unverifiedToken:f=>{f.token.email_verified=false;},
  missingFactor:f=>{f.user.multiFactor.enrolledFactors=[];}, missingMfa:f=>{delete f.token.firebase.sign_in_second_factor;},
  forgedCustomClaimOnPassword:f=>{delete f.token.firebase.sign_in_second_factor;f.token.app_totp_enrolled=true;},
  changedEmail:f=>{f.user.email="other@example.invalid";}, wrongProfileUid:f=>{f.db.rows.set("users/manager@example.invalid",{userId:"other"});},
  blocked:f=>{f.db.rows.set("accountBlocks/uid-manager",{blocked:true});},
  pending:f=>{f.db.rows.set("accountBlocks/uid-manager",{revocation:{generation,validAfterSeconds:100,pendingOperations:{[generation]:true}}});},
  oldAuthTime:f=>{f.db.rows.set("accountBlocks/uid-manager",{revocation:{generation,validAfterSeconds:300,pendingOperations:{}}});},
  staleCustomGeneration:f=>{f.token.firebase={sign_in_provider:"custom"};f.token.app_totp_enrolled=true;f.token.app_auth_generation="old";f.db.rows.set("accountBlocks/uid-manager",{revocation:{generation,validAfterSeconds:100,pendingOperations:{}}});},
};
for(const [name,mutate] of Object.entries(rejects)) test(`authentication denies ${name}`,async()=>{const f=fixture();mutate(f);await assert.rejects(authenticate(f.admin,f.req));});
test("malformed revocation and unavailable Auth fail closed",async()=>{
 const f=fixture();f.db.rows.set("accountBlocks/uid-manager",{revocation:{generation}});await expectStatus(authenticate(f.admin,f.req),503);
 f.setAuthError({code:"auth/internal-error"});await expectStatus(authenticate(f.admin,f.req),503);
});
test("fresh custom token after revocation is accepted",async()=>{
 const f=fixture();f.token.firebase={sign_in_provider:"custom"};f.token.app_totp_enrolled=true;f.token.app_auth_generation=generation;
 f.db.rows.set("accountBlocks/uid-manager",{revocation:{generation,validAfterSeconds:200,pendingOperations:{}}});await authenticate(f.admin,f.req);
});
test("persistent block plus valid revocation remains blocked",()=>assert.throws(()=>assertRevocation({blocked:true,revocation:{generation,validAfterSeconds:1,pendingOperations:{}}},{auth_time:200}),e=>e.status===403));
test("shared limiter bounds concurrent requests and expires",async()=>{
 const db=memory();const results=await Promise.all(Array.from({length:30},()=>consumeRate(db,"test","u",5,1000)));
 assert.equal(results.filter(r=>r.allowed).length,5);assert.equal((await consumeRate(db,"test","u",5,61000)).allowed,true);
});
test("recipient authorization permits descendants and rejects unrelated users, cycles and self",async()=>{
 const f=fixture();f.db.rows.set("users/grandchild@example.invalid",{managerEmail:"recipient@example.invalid"});
 assert.equal((await authorizeRecipients(f.db,f.token.email,["grandchild@example.invalid"])).length,1);
 f.db.rows.set("users/outsider@example.invalid",{managerEmail:"outsider@example.invalid"});
 await expectStatus(authorizeRecipients(f.db,f.token.email,["recipient@example.invalid","outsider@example.invalid"]),403);
 await expectStatus(authorizeRecipients(f.db,f.token.email,[f.token.email]),403);
 await expectStatus(authorizeRecipients(f.db,f.token.email,["bad/path"]),400);
});

function handlers(f) {
 const capture=(options,fn)=>{fn.options=options;return fn;};
 const modules={"firebase-admin":f.admin,"axios":{async post(){f.calls.http.push("post");return {data:{choices:[{message:{content:"synthetic response"}}]}};},async get(){f.calls.http.push("get");return {data:{features:[]}};}},
  "firebase-functions/v2/firestore":{onDocumentCreated:capture},"firebase-functions/v2":{setGlobalOptions(){}},"firebase-functions/v2/https":{onRequest:capture},
  "firebase-functions/params":{defineSecret:()=>({value:()=>"synthetic-secret"})},"firebase-functions/v2/scheduler":{onSchedule:capture},
  "./security":require("../security"),"./billing":require("../billing"),"./runtime":require("../runtime")};
 const exports={};vm.runInNewContext(fs.readFileSync(require.resolve("../index"),"utf8"),{exports,require:name=>{if(!modules[name])throw new Error(name);return modules[name];},console:{log(){},warn(){},error(){}}},{timeout:1000});return exports;
}
async function invoke(fn,req) {
 const result={status:200,headers:{},body:null};const res={set(k,v){result.headers[k]=v;return this;},status(v){result.status=v;return this;},json(v){result.body=v;return this;},send(v){result.body=v;return this;}};
 await fn(req,res);return result;
}
const protectedFunctions=["aiAssistant","sendTeamMessage","sendTestPush","cuzkSuggestAddress","cuzkLookupByAddress","cuzkLookupByAdresniMisto","rsvVehicleLookup"];
for(const name of protectedFunctions) for(const kind of ["missing","invalid","missingMfa","revoked"]) test(`${name} rejects ${kind} before side effects`,async()=>{
 const f=fixture();rejects[kind](f);f.req.method=name.startsWith("cuzk")||name==="rsvVehicleLookup"?"GET":"POST";
 f.req.body={prompt:"test",managerEmail:f.token.email,message:"test",target:"selected",recipients:["recipient@example.invalid"]};f.req.query={vin:"SYNTHETICVIN12345"};
 const result=await invoke(handlers(f)[name],f.req);assert.ok([401,403].includes(result.status));assert.equal(f.calls.push.length,0);assert.equal(f.calls.http.length,0);
});
test("team handler rejects forged manager and every foreign recipient before sending",async()=>{
 const f=fixture(),fn=handlers(f).sendTeamMessage;
 f.req.body={managerEmail:"forged@example.invalid",message:"test",target:"selected",recipients:["recipient@example.invalid"]};
 assert.equal((await invoke(fn,f.req)).status,403);
 f.req.body.managerEmail=f.token.email;f.req.body.recipients.push("outsider@example.invalid");assert.equal((await invoke(fn,f.req)).status,403);assert.equal(f.calls.push.length,0);
 f.req.body.recipients=["recipient@example.invalid"];assert.equal((await invoke(fn,f.req)).status,200);assert.equal(f.calls.push.length,1);
});
test("AI accepts eligible user, rejects oversized prompt and enforces distributed limit",async()=>{
 const f=fixture(),fn=handlers(f).aiAssistant;f.req.body={prompt:"safe synthetic test"};assert.equal((await invoke(fn,f.req)).status,200);
 f.req.body.prompt="x".repeat(12001);assert.equal((await invoke(fn,f.req)).status,400);assert.equal(f.calls.http.length,1);
 f.req.body.prompt="safe";for(let i=0;i<28;i++)await invoke(fn,f.req);assert.equal((await invoke(fn,f.req)).status,429);
});
test("request wrapper requires JSON, bounds bytes, supports preflight and fails closed on database outage",async()=>{
 const f=fixture(),fn=handlers(f).aiAssistant;delete f.req.headers["content-type"];assert.equal((await invoke(fn,f.req)).status,415);
 f.req.headers["content-type"]="application/json";f.req.rawBody=Buffer.alloc(65537);assert.equal((await invoke(fn,f.req)).status,413);
 f.req.method="OPTIONS";delete f.req.headers.authorization;assert.equal((await invoke(fn,f.req)).status,204);
 f.req.method="POST";f.req.headers.authorization="Bearer valid";delete f.req.rawBody;f.db.runTransaction=async()=>{throw new Error("private provider error");};
 const result=await invoke(fn,f.req);assert.equal(result.status,503);assert.equal(JSON.stringify(result).includes("private provider error"),false);
});
test("disabled manager notification stays disabled and runtime identities are distinct",async()=>{
 const f=fixture(),exports=handlers(f);await exports.notifyManagerOnNewEntry({data:{data(){throw new Error("must remain disabled");}}});
 assert.equal(new Set(Object.values(exports).map(fn=>fn.options.serviceAccount)).size,12);
});

function billingFixture() {
 const f=fixture();f.db.rows.set("users/customer@example.invalid",{fullName:"Synthetic Customer",paidUntil:f.admin.firestore.Timestamp.fromDate(new Date("2030-01-31T12:00:00Z"))});
 f.req.headers.authorization="synthetic-secret";f.req.body={invoice:{id:123,state:"paid",total:200,client_name:"Synthetic Customer"}};return f;
}
test("webhook rejects missing/invalid authentication, empty secret and missing invoice id",async()=>{
 const f=billingFixture();await expectStatus(processInvoice(f.admin,f.req,""),503);await expectStatus(processInvoice(f.admin,f.req,"wrong"),401);
 delete f.req.body.invoice.id;await expectStatus(processInvoice(f.admin,f.req,"synthetic-secret"),400);
});
test("duplicate and concurrent invoice delivery extends subscription once",async()=>{
 const f=billingFixture();const results=await Promise.all(Array.from({length:10},()=>processInvoice(f.admin,f.req,"synthetic-secret")));
 assert.equal(results.filter(r=>r==="Subscription updated").length,1);assert.equal(f.db.rows.get("users/customer@example.invalid").paidUntil.iso,"2030-02-28T12:00:00.000Z");
 assert.equal(await processInvoice(f.admin,f.req,"synthetic-secret"),"Invoice already processed");
});
test("previous version's last invoice is migrated without another extension",async()=>{
 const f=billingFixture();f.db.rows.get("users/customer@example.invalid").lastInvoiceId=123;
 assert.equal(await processInvoice(f.admin,f.req,"synthetic-secret"),"Invoice already processed");assert.equal(f.db.rows.get("users/customer@example.invalid").paidUntil.iso,"2030-01-31T12:00:00.000Z");
});
test("ambiguous customer is rejected without writing and month end is clamped",async()=>{
 const f=billingFixture();f.db.rows.set("users/duplicate@example.invalid",{fullName:"Synthetic Customer"});await expectStatus(processInvoice(f.admin,f.req,"synthetic-secret"),409);
 assert.equal([...f.db.rows.keys()].filter(k=>k.startsWith("billingWebhookInvoices/")).length,0);
 assert.equal(nextMonth(new Date("2028-01-31T00:00:00Z")).toISOString(),"2028-02-29T00:00:00.000Z");
});
