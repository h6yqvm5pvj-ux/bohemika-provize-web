const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const req=createRequire(require('node:path').resolve('package.json'));
const ts=req('typescript');
const {NextRequest}=req('next/server');
const root=process.cwd()+'/';
function load(file,stubs={},globals={}) {
  const loadedModule={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(root+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const context=vm.createContext({module:loadedModule,exports:loadedModule.exports,require:id=>{
    if(Object.hasOwn(stubs,id))return stubs[id];
    if(id==='next/server')return req(id);
    throw new Error('Unmocked dependency: '+id);
  },console,URL,URLSearchParams,Request,Response,Headers,Date,TextEncoder,TextDecoder,Uint8Array,btoa,crypto:require('node:crypto').webcrypto,process:{env:{NODE_ENV:'production'}},...globals});
  vm.runInContext(code,context,{filename:file});
  return loadedModule.exports;
}
async function main(){
  const result={};
  const location={search:'?next='+encodeURIComponent('/\\audit.invalid/check')};
  const auth=load('src/app/lib/authSession.ts',{'./clientCardPrivacy':{clearLegacyClientCards(){}}},{window:{location}});
  const accepted=auth.resolveSafeLoginNextPath('/');
  result.loginRedirect={input:location.search,accepted,resolved:new URL(accepted,'https://bohemka.app/login').href};
  assert.equal(new URL(accepted,'https://bohemka.app/login').origin,'https://audit.invalid');
  location.search='?next='+encodeURIComponent('//audit.invalid/check');
  assert.equal(auth.resolveSafeLoginNextPath('/'),'/');

  const updates=[];
  const rate={applyRateLimitHeaders(){},consumeRateLimit:async()=>({allowed:true})};
  const endpoint=load('src/app/api/auth/confirm-email-for-mfa/route.ts',{
    '@/lib/server/firebaseAdmin':{adminAuth:{
      verifyIdToken:async()=>({uid:'audit-user',email:'audit@example.test',auth_time:Math.floor(Date.now()/1000)}),
      getUser:async()=>({uid:'audit-user',email:'audit@example.test',disabled:false,emailVerified:false}),
      updateUser:async(uid,fields)=>{updates.push({uid,fields});}
    }},
    '@/lib/server/loginAttemptLockout':{getLoginAttemptLockoutError:async()=>null},
    '@/lib/server/rateLimit':rate
  });
  const missing=await endpoint.POST(new Request('https://bohemka.app/api/auth/confirm-email-for-mfa',{method:'POST'}));
  assert.equal(missing.status,401);
  const response=await endpoint.POST(new Request('https://bohemka.app/api/auth/confirm-email-for-mfa',{method:'POST',headers:{authorization:'Bearer synthetic-audit-token'}}));
  result.emailVerification={status:response.status,payload:await response.json(),mockUpdates:updates};
  assert.equal(response.status,200);
  assert.equal(updates[0].fields.emailVerified,true);

  const proxy=load('src/proxy.ts',{
    '@/lib/appSession':{APP_SESSION_COOKIE_NAME:'bohemika_app_session'},
    '@/lib/server/activeAppSession':{verifyActiveAppSession:async()=>({ok:true,session:{}})}
  });
  result.authenticatedFrameHeaders=[];
  for(const path of ['/kalkulacka?prefill=commission-statement&product=neon','/embed/pojisteni-vozidla','/smlouvy/audit-contract?embedded=1','/embed/zivotni-pojisteni','/muj-tym/tydenni-report?source=weekly-report&embed=mailbox']){
    const res=await proxy.proxy(new NextRequest('https://bohemka.app'+path));
    result.authenticatedFrameHeaders.push({path,xFrame:res.headers.get('x-frame-options'),ancestors:res.headers.get('content-security-policy').match(/frame-ancestors[^;]+/)[0]});
  }
  assert.equal(result.authenticatedFrameHeaders[0].xFrame,'DENY');
  assert.equal(result.authenticatedFrameHeaders[2].xFrame,'SAMEORIGIN');

  const handlers={};const cache=new Map();let revision=1,networkCalls=0;
  const sw=vm.createContext({URL,Response,Request,console,
    self:{location:{hostname:'bohemka.app',origin:'https://bohemka.app'},addEventListener:(name,cb)=>handlers[name]=cb},
    fetch:async()=>{networkCalls++;return new Response('revision-'+revision,{headers:{'Cache-Control':'private, no-store','Content-Type':'text/x-component'}});},
    caches:{match:async request=>cache.get(request.url)?.clone(),open:async()=>({put:async(request,response)=>cache.set(request.url,response)})}
  });
  vm.runInContext(fs.readFileSync(root+'public/sw.js','utf8'),sw);
  const request=new Request('https://bohemka.app/vizitka/audit-advisor?_rsc=synthetic',{headers:{rsc:'1'}});
  async function swFetch(){let promise;handlers.fetch({request,respondWith:p=>promise=p});return (await promise).text();}
  const first=await swFetch();await new Promise(resolve=>setImmediate(resolve));revision=2;
  const second=await swFetch();
  result.serviceWorkerCache={first,afterServerRevisionChange:second,networkCalls,cachedDespiteNoStore:cache.size===1};
  assert.equal(second,'revision-1');assert.equal(networkCalls,1);
  function storage(initial){const map=new Map(Object.entries(initial));return {get length(){return map.size;},key:index=>[...map.keys()][index]??null,getItem:key=>map.get(key)??null,removeItem:key=>map.delete(key)};}
  const localStorage=storage({'carRecord.resultsInput':'synthetic car draft','lifeRecordFormDraft':'synthetic life draft','lifeRecordResultInput':'synthetic life result','bohemika.client-card.retired':'retired synthetic value'});
  const auditWindow={localStorage,sessionStorage:storage({})};
  const privacy=load('src/app/lib/clientCardPrivacy.ts',{}, {window:auditWindow});
  const logout=load('src/app/lib/authSession.ts',{'./clientCardPrivacy':privacy},{window:auditWindow,fetch:async()=>new Response('{}',{status:200})});
  await logout.clearServerSession();
  result.recordDraftsAfterLogout={remainingKeys:Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)),retiredClientCardRemoved:localStorage.getItem('bohemika.client-card.retired')===null};
  assert.equal(localStorage.getItem('carRecord.resultsInput'),'synthetic car draft');
  assert.equal(localStorage.getItem('lifeRecordFormDraft'),'synthetic life draft');
  fs.writeFileSync('/tmp/bohemika-audit-probes.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
