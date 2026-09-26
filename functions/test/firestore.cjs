const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const {consumeRate}=require('../security');
const {processInvoice}=require('../billing');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:'),'Emulator required');
const projectId='demo-bohemika-rules';
const app=initializeApp({projectId},'functions-security-integration');const db=getFirestore(app);
const firestore=()=>db;firestore.Timestamp=Timestamp;const admin={firestore};
const suffix=Date.now();
after(async()=>{await db.terminate();await deleteApp(app);});
test('real Firestore transactions enforce one extension under concurrent retries',async()=>{
 const ref=db.collection('users').doc(`audit-${suffix}@example.invalid`);
 const initial=Timestamp.fromDate(new Date('2030-01-31T12:00:00Z'));
 await ref.set({fullName:`Synthetic audit ${suffix}`,paidUntil:initial});
 const req={headers:{authorization:'synthetic-webhook-secret','content-type':'application/json'},body:{invoice:{id:`audit-${suffix}`,state:'paid',total:200,client_name:`Synthetic audit ${suffix}`}}};
 const result=await Promise.all(Array.from({length:8},()=>processInvoice(admin,req,'synthetic-webhook-secret')));
 assert.equal(result.filter(x=>x==='Subscription updated').length,1);
 assert.equal((await ref.get()).data().paidUntil.toDate().toISOString(),'2030-02-28T12:00:00.000Z');
 const events=await db.collection('billingWebhookInvoices').where('invoiceId','==',`audit-${suffix}`).get();assert.equal(events.size,1);
 await ref.delete();await events.docs[0].ref.delete();
});
test('real Firestore limiter shares quota across concurrent function invocations',async()=>{
 const result=await Promise.all(Array.from({length:16},()=>consumeRate(db,'integration',String(suffix),4)));
 assert.equal(result.filter(x=>x.allowed).length,4);
 const {createHash}=require('node:crypto');const id=createHash('sha256').update(`functions:integration:${suffix}`).digest('hex');
 await db.collection('_rateLimits').doc(id).delete();
});
