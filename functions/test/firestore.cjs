const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {consumeRate}=require('../security');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:'),'Emulator required');
const projectId='demo-bohemika-rules';
const app=initializeApp({projectId},'functions-security-integration');const db=getFirestore(app);
const suffix=Date.now();
after(async()=>{await db.terminate();await deleteApp(app);});
test('real Firestore limiter shares quota across concurrent function invocations',async()=>{
 const result=await Promise.all(Array.from({length:16},()=>consumeRate(db,'integration',String(suffix),4)));
 assert.equal(result.filter(x=>x.allowed).length,4);
 const {createHash}=require('node:crypto');const id=createHash('sha256').update(`functions:integration:${suffix}`).digest('hex');
 await db.collection('_rateLimits').doc(id).delete();
});
